import { basename, join } from 'node:path';
import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/services/prisma.service';
import { config } from '../../config/config';
import {
  ParsedAnkiCollectionMetadata,
  ParsedAnkiCard,
  ParsedAnkiMediaFile,
  ParsedAnkiNote,
  AnkiPackageService,
  InvalidAnkiPackageError,
} from './anki-package.service';
import { CreateImportDto } from './dto/create-import.dto';
import { DeckEntity } from './entities/deck.entity';
import { ImportDetailsEntity } from './entities/import-details.entity';
import { ImportEntity } from './entities/import.entity';
import { PaginatedDecksEntity } from './entities/paginated-decks.entity';
import { PaginatedImportsEntity } from './entities/paginated-imports.entity';
import { createImportSchema } from './schemas/import.schema';

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ankiPackageService: AnkiPackageService,
  ) {}

  async create(rawDto: CreateImportDto): Promise<ImportEntity> {
    await this.ensureStorageRoots();

    const dto = await this.validateCreateImportDto(rawDto);
    const originalName = basename(dto.originalName).trim();

    let importId: string | null = null;

    try {
      const createdImport = await this.prisma.import.create({
        data: {
          originalName,
          fileSize: dto.size,
          status: 'PROCESSING',
        },
      });

      importId = createdImport.id;

      const workspacePath = this.getWorkspacePath(importId);
      await mkdir(workspacePath, { recursive: true });
      await rename(dto.temporaryFilePath, this.getSourceArchivePath(importId));
      const preparedCollection =
        await this.ankiPackageService.readPreparedImportSource(importId);
      const collectionMetadata =
        this.ankiPackageService.parseCollectionMetadata(
          preparedCollection.raw.collection,
        );
      const notes = this.ankiPackageService.parseNotes(
        preparedCollection.raw.notes,
        collectionMetadata.noteModels,
      );
      const cards = this.ankiPackageService.parseCards(
        preparedCollection.raw.cards,
      );
      const mediaCollection =
        await this.ankiPackageService.parseMediaFiles(preparedCollection);
      this.logMissingMediaFiles(importId, mediaCollection.missingFiles);
      const storedMediaFiles = await this.storeMediaFiles(
        importId,
        mediaCollection.files,
      );

      await this.persistCollectionMetadata(
        importId,
        collectionMetadata,
        notes,
        cards,
        storedMediaFiles,
      );

      return ImportEntity.fromRecord(createdImport);
    } catch (error) {
      if (importId) {
        if (error instanceof InvalidAnkiPackageError) {
          await this.failCreatedImport(importId, error.message);
          throw new UnprocessableEntityException(error.message);
        }

        await this.rollbackCreatedImport(importId);
      }

      await this.safeRemovePath(dto.temporaryFilePath);

      this.logger.error(
        'Failed to prepare the import upload workspace.',
        error instanceof Error ? error.stack : undefined,
      );

      throw new InternalServerErrorException('Failed to store uploaded file.');
    }
  }

  async findAll(query: PaginationDto): Promise<PaginatedImportsEntity> {
    const { page, limit, skip, take } = this.resolvePagination(query);

    const [imports, totalItems] = await Promise.all([
      this.prisma.import.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.import.count(),
    ]);

    return PaginatedImportsEntity.create({
      items: imports.map(record => ImportDetailsEntity.fromRecord(record)),
      page,
      limit,
      totalItems,
    });
  }

  async findOne(id: string): Promise<ImportDetailsEntity> {
    const importRecord = await this.prisma.import.findUnique({
      where: { id },
    });

    if (!importRecord) {
      throw new NotFoundException('Import not found.');
    }

    return ImportDetailsEntity.fromRecord(importRecord);
  }

  async findImportDecks(
    importId: string,
    query: PaginationDto,
  ): Promise<PaginatedDecksEntity> {
    await this.ensureImportExists(importId);

    const { page, limit, skip, take } = this.resolvePagination(query);

    const [decks, totalItems] = await Promise.all([
      this.prisma.deck.findMany({
        where: { importId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.deck.count({ where: { importId } }),
    ]);

    const deckIds = decks.map(deck => deck.id);
    const { cardsCountByDeckId, notesCountByDeckId } =
      await this.getDeckAggregateMaps(deckIds);

    return PaginatedDecksEntity.create({
      items: decks.map(deck =>
        DeckEntity.fromRecord({
          ...deck,
          cardsCount: cardsCountByDeckId.get(deck.id) ?? 0,
          notesCount: notesCountByDeckId.get(deck.id) ?? 0,
        }),
      ),
      page,
      limit,
      totalItems,
    });
  }

  async findDeck(id: string): Promise<DeckEntity> {
    const deck = await this.prisma.deck.findUnique({
      where: { id },
    });

    if (!deck) {
      throw new NotFoundException('Deck not found.');
    }

    const [cardsCount, distinctNotes] = await Promise.all([
      this.prisma.card.count({
        where: { deckId: id },
      }),
      this.prisma.card.groupBy({
        by: ['noteId'],
        where: { deckId: id },
      }),
    ]);

    return DeckEntity.fromRecord({
      ...deck,
      cardsCount,
      notesCount: distinctNotes.length,
    });
  }

  async remove(id: string): Promise<void> {
    await this.ensureImportExists(id);
    await this.removeImportArtifacts(id);
    await this.prisma.import.delete({
      where: { id },
    });
  }

  private async validateCreateImportDto(rawDto: CreateImportDto): Promise<{
    originalName: string;
    size: number;
    temporaryFilePath: string;
  }> {
    const result = createImportSchema.safeParse(rawDto);

    if (!result.success) {
      await this.safeRemovePath(rawDto.temporaryFilePath);
      throw new BadRequestException(
        result.error.issues[0]?.message ?? 'Invalid upload file.',
      );
    }

    return {
      originalName: result.data.originalName,
      size: result.data.size,
      temporaryFilePath: result.data.temporaryFilePath as string,
    };
  }

  private async ensureStorageRoots(): Promise<void> {
    await Promise.all([
      mkdir(config.storage.importsTempDir, { recursive: true }),
      mkdir(config.storage.importsIncomingDir, { recursive: true }),
      mkdir(config.storage.mediaDir, { recursive: true }),
    ]);
  }

  private async persistCollectionMetadata(
    importId: string,
    collectionMetadata: ParsedAnkiCollectionMetadata,
    notes: ParsedAnkiNote[],
    cards: ParsedAnkiCard[],
    mediaFiles: StoredMediaFile[],
  ): Promise<void> {
    await this.prisma.$transaction(async transaction => {
      if (collectionMetadata.decks.length > 0) {
        await transaction.deck.createMany({
          data: collectionMetadata.decks.map(deck => ({
            importId,
            ankiDeckId: deck.ankiDeckId,
            name: deck.name,
            description: deck.description,
          })),
        });
      }

      if (collectionMetadata.noteModels.length > 0) {
        await transaction.noteModel.createMany({
          data: collectionMetadata.noteModels.map(noteModel => ({
            importId,
            ankiModelId: noteModel.ankiModelId,
            name: noteModel.name,
            fields: noteModel.fields,
            templates: noteModel.templates,
          })),
        });
      }

      const persistedDecks =
        cards.length > 0
          ? await transaction.deck.findMany({
              where: { importId },
              select: {
                id: true,
                ankiDeckId: true,
              },
            })
          : [];
      const deckIds = new Map(
        persistedDecks.map(deck => [deck.ankiDeckId, deck.id]),
      );

      const persistedNoteModels =
        collectionMetadata.noteModels.length > 0
          ? await transaction.noteModel.findMany({
              where: { importId },
              select: {
                id: true,
                ankiModelId: true,
              },
            })
          : [];
      const noteModelIds = new Map(
        persistedNoteModels.map(noteModel => [
          noteModel.ankiModelId,
          noteModel.id,
        ]),
      );

      if (notes.length > 0) {
        await transaction.note.createMany({
          data: notes.map(note => {
            const modelId = noteModelIds.get(note.ankiModelId);

            if (!modelId) {
              throw new InvalidAnkiPackageError(
                `The Anki note ${note.ankiNoteId} references missing note model ${note.ankiModelId}.`,
              );
            }

            return {
              importId,
              ankiNoteId: note.ankiNoteId,
              modelId,
              fields: note.fields,
              tags: note.tags,
            };
          }),
        });
      }

      const persistedNotes =
        cards.length > 0
          ? await transaction.note.findMany({
              where: { importId },
              select: {
                id: true,
                ankiNoteId: true,
              },
            })
          : [];
      const noteIds = new Map(
        persistedNotes.map(note => [note.ankiNoteId, note.id]),
      );

      if (cards.length > 0) {
        await transaction.card.createMany({
          data: cards.map(card => {
            const noteId = noteIds.get(card.ankiNoteId);

            if (!noteId) {
              throw new InvalidAnkiPackageError(
                `The Anki card ${card.ankiCardId} references missing note ${card.ankiNoteId}.`,
              );
            }

            const deckId = deckIds.get(card.ankiDeckId);

            if (!deckId) {
              throw new InvalidAnkiPackageError(
                `The Anki card ${card.ankiCardId} references missing deck ${card.ankiDeckId}.`,
              );
            }

            return {
              importId,
              ankiCardId: card.ankiCardId,
              noteId,
              deckId,
              ordinal: card.ordinal,
              cardType: card.type,
              queue: card.queue,
              dueDate: card.due,
              interval: card.ivl,
              easeFactor: card.factor,
              repetitions: card.reps,
              lapses: card.lapses,
            };
          }),
        });
      }

      if (mediaFiles.length > 0) {
        await transaction.mediaFile.createMany({
          data: mediaFiles.map(mediaFile => ({
            importId,
            ankiIndex: mediaFile.ankiIndex,
            originalName: mediaFile.originalName,
            mimeType: mediaFile.mimeType,
            sizeKb: mediaFile.sizeKb,
            storageUrl: mediaFile.storageUrl,
            type: mediaFile.type,
          })),
        });
      }

      await transaction.import.update({
        where: { id: importId },
        data: {
          status: 'COMPLETED',
          failureReason: null,
          decksCount: collectionMetadata.decks.length,
          notesCount: notes.length,
          cardsCount: cards.length,
          mediaCount: mediaFiles.length,
        },
      });
    });
  }

  private async ensureImportExists(id: string): Promise<void> {
    const importRecord = await this.prisma.import.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!importRecord) {
      throw new NotFoundException('Import not found.');
    }
  }

  private resolvePagination(query: PaginationDto): {
    page: number;
    limit: number;
    skip: number;
    take: number;
  } {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    return {
      page,
      limit,
      skip: (page - 1) * limit,
      take: limit,
    };
  }

  private async getDeckAggregateMaps(deckIds: string[]): Promise<{
    cardsCountByDeckId: Map<string, number>;
    notesCountByDeckId: Map<string, number>;
  }> {
    if (deckIds.length === 0) {
      return {
        cardsCountByDeckId: new Map(),
        notesCountByDeckId: new Map(),
      };
    }

    const [cardsByDeck, distinctDeckNotes] = await Promise.all([
      this.prisma.card.groupBy({
        by: ['deckId'],
        where: {
          deckId: { in: deckIds },
        },
        _count: {
          _all: true,
        },
      }),
      this.prisma.card.groupBy({
        by: ['deckId', 'noteId'],
        where: {
          deckId: { in: deckIds },
        },
      }),
    ]);

    const cardsCountByDeckId = new Map(
      cardsByDeck.map(record => [record.deckId, record._count._all]),
    );
    const notesCountByDeckId = new Map<string, number>();

    for (const record of distinctDeckNotes) {
      notesCountByDeckId.set(
        record.deckId,
        (notesCountByDeckId.get(record.deckId) ?? 0) + 1,
      );
    }

    return {
      cardsCountByDeckId,
      notesCountByDeckId,
    };
  }

  private getWorkspacePath(importId: string): string {
    return join(config.storage.importsTempDir, importId);
  }

  private getSourceArchivePath(importId: string): string {
    return join(this.getWorkspacePath(importId), 'source.apkg');
  }

  private async rollbackCreatedImport(importId: string): Promise<void> {
    await Promise.allSettled([
      this.prisma.import.delete({ where: { id: importId } }),
      this.safeRemovePath(this.getWorkspacePath(importId)),
      this.safeRemovePath(this.getImportMediaPath(importId)),
    ]);
  }

  private async failCreatedImport(
    importId: string,
    failureReason: string,
  ): Promise<void> {
    await Promise.allSettled([
      this.prisma.import.update({
        where: { id: importId },
        data: {
          status: 'FAILED',
          failureReason,
        },
      }),
      this.safeRemovePath(this.getWorkspacePath(importId)),
      this.safeRemovePath(this.getImportMediaPath(importId)),
    ]);
  }

  private async removeImportArtifacts(importId: string): Promise<void> {
    await Promise.all([
      this.removePath(this.getWorkspacePath(importId)),
      this.removePath(this.getImportMediaPath(importId)),
    ]);
  }

  private logMissingMediaFiles(
    importId: string,
    missingFiles: Array<{ ankiIndex: string; originalName: string }>,
  ): void {
    for (const missingFile of missingFiles) {
      this.logger.warn(
        `Skipping media index ${missingFile.ankiIndex} mapped to "${missingFile.originalName}" for import ${importId} because the file is missing from the package.`,
      );
    }
  }

  private async storeMediaFiles(
    importId: string,
    mediaFiles: ParsedAnkiMediaFile[],
  ): Promise<StoredMediaFile[]> {
    if (mediaFiles.length === 0) {
      return [];
    }

    const importMediaPath = this.getImportMediaPath(importId);
    await mkdir(importMediaPath, { recursive: true });

    const storedMediaFiles: StoredMediaFile[] = [];

    for (const mediaFile of mediaFiles) {
      const storageFileName = this.buildStorageFileName(
        mediaFile.ankiIndex,
        mediaFile.originalName,
      );
      const destinationPath = join(importMediaPath, storageFileName);

      await copyFile(mediaFile.filePath, destinationPath);

      storedMediaFiles.push({
        ankiIndex: mediaFile.ankiIndex,
        originalName: mediaFile.originalName,
        mimeType: mediaFile.mimeType,
        sizeKb: this.toSizeKb(mediaFile.sizeBytes),
        storageUrl: this.buildStorageUrl(importId, storageFileName),
        type: mediaFile.type,
      });
    }

    return storedMediaFiles;
  }

  private buildStorageFileName(
    ankiIndex: string,
    originalName: string,
  ): string {
    const normalizedFileName = basename(
      originalName.replaceAll('\\', '/'),
    ).trim();
    const safeFileName = Array.from(normalizedFileName)
      .map(character =>
        character.charCodeAt(0) <= 31 || '<>:"/\\|?*'.includes(character)
          ? '_'
          : character,
      )
      .join('')
      .trim();

    return `${ankiIndex}-${safeFileName.length > 0 ? safeFileName : 'media-file'}`;
  }

  private toSizeKb(sizeBytes: number): number {
    return Math.ceil(sizeBytes / 1024);
  }

  private getImportMediaPath(importId: string): string {
    return join(config.storage.mediaDir, importId);
  }

  private buildStorageUrl(importId: string, fileName: string): string {
    return `${importId}/${fileName}`;
  }

  private async safeRemovePath(path?: string): Promise<void> {
    if (!path) {
      return;
    }

    await rm(path, { recursive: true, force: true }).catch(() => undefined);
  }

  private async removePath(path?: string): Promise<void> {
    if (!path) {
      return;
    }

    await rm(path, { recursive: true, force: true });
  }
}

type StoredMediaFile = {
  ankiIndex: string;
  originalName: string;
  mimeType: string;
  sizeKb: number;
  storageUrl: string;
  type: ParsedAnkiMediaFile['type'];
};
