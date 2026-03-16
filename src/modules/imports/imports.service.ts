import { createReadStream } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  StreamableFile,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MediaType, Prisma } from '@prisma/client';
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
import { ListImportCardsQueryDto } from './dto/list-import-cards-query.dto';
import { ListImportMediaQueryDto } from './dto/list-import-media-query.dto';
import { ListImportNotesQueryDto } from './dto/list-import-notes-query.dto';
import { CardEntity, CardSummaryEntity } from './entities/card.entity';
import { DeckEntity } from './entities/deck.entity';
import { ImportExportEntity } from './entities/import-export.entity';
import { ImportDetailsEntity } from './entities/import-details.entity';
import { ImportEntity } from './entities/import.entity';
import { MediaEntity, MediaInfoEntity } from './entities/media.entity';
import { NoteEntity, NoteSummaryEntity } from './entities/note.entity';
import { PaginatedCardsEntity } from './entities/paginated-cards.entity';
import { PaginatedDecksEntity } from './entities/paginated-decks.entity';
import { PaginatedImportsEntity } from './entities/paginated-imports.entity';
import { PaginatedMediaEntity } from './entities/paginated-media.entity';
import { PaginatedNotesEntity } from './entities/paginated-notes.entity';
import {
  NoteFieldPreviewShape,
  NoteFieldValueShape,
} from './entities/shared-content.entity';
import { createImportSchema } from './schemas/import.schema';

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ankiPackageService: AnkiPackageService,
  ) {}

  async create(rawDto: CreateImportDto): Promise<ImportEntity> {
    const dto = await this.validateCreateImportDto(rawDto);
    const originalName = basename(dto.originalName).trim();

    let importId: string | null = null;

    try {
      await this.ensureStorageRoots();

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
        const normalizedFailure = this.normalizeImportCreationError(error);
        await this.failCreatedImport(importId, normalizedFailure.failureReason);
        this.logImportCreationFailure(
          importId,
          normalizedFailure.failureReason,
          error,
        );
        throw normalizedFailure.exception;
      }

      this.logImportCreationFailure(
        null,
        'Failed to initialize the import processing workflow.',
        error,
      );
      throw new InternalServerErrorException('Failed to store uploaded file.');
    } finally {
      await Promise.allSettled([
        this.safeRemovePath(dto.temporaryFilePath),
        importId
          ? this.safeRemovePath(this.getWorkspacePath(importId))
          : Promise.resolve(),
      ]);
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

  async exportImport(importId: string): Promise<ImportExportEntity> {
    const importRecord = await this.prisma.import.findUnique({
      where: { id: importId },
    });

    if (!importRecord) {
      throw new NotFoundException('Import not found.');
    }

    if (importRecord.status !== 'COMPLETED') {
      throw new ConflictException(
        this.buildImportExportUnavailableMessage(
          importRecord.status,
          importRecord.failureReason,
        ),
      );
    }

    const [decks, notes, cards, mediaFiles] = await Promise.all([
      this.prisma.deck.findMany({
        where: { importId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.note.findMany({
        where: { importId },
        orderBy: [{ ankiNoteId: 'asc' }, { id: 'asc' }],
        include: {
          model: {
            select: {
              id: true,
              ankiModelId: true,
              name: true,
            },
          },
          cards: {
            orderBy: [{ ordinal: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              ankiCardId: true,
              ordinal: true,
              cardType: true,
              queue: true,
              deck: {
                select: {
                  id: true,
                  ankiDeckId: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.card.findMany({
        where: { importId },
        orderBy: [{ ordinal: 'asc' }, { ankiCardId: 'asc' }, { id: 'asc' }],
        include: {
          deck: {
            select: {
              id: true,
              ankiDeckId: true,
              name: true,
            },
          },
          note: {
            select: {
              id: true,
              ankiNoteId: true,
              tags: true,
              fields: true,
              model: {
                select: {
                  id: true,
                  ankiModelId: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.mediaFile.findMany({
        where: { importId },
        orderBy: [{ ankiIndex: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const deckNotesCountByDeckId = new Map<string, number>();
    const deckCardsCountByDeckId = new Map<string, number>();

    for (const note of notes) {
      const noteDeckIds = new Set(note.cards.map(card => card.deck.id));

      for (const deckId of noteDeckIds) {
        deckNotesCountByDeckId.set(
          deckId,
          (deckNotesCountByDeckId.get(deckId) ?? 0) + 1,
        );
      }
    }

    for (const card of cards) {
      deckCardsCountByDeckId.set(
        card.deck.id,
        (deckCardsCountByDeckId.get(card.deck.id) ?? 0) + 1,
      );
    }

    return ImportExportEntity.create({
      import: ImportDetailsEntity.fromRecord(importRecord),
      decks: decks.map(deck =>
        DeckEntity.fromRecord({
          ...deck,
          notesCount: deckNotesCountByDeckId.get(deck.id) ?? 0,
          cardsCount: deckCardsCountByDeckId.get(deck.id) ?? 0,
        }),
      ),
      notes: notes.map(note =>
        NoteEntity.fromRecord({
          id: note.id,
          importId: note.importId,
          ankiNoteId: note.ankiNoteId,
          model: note.model,
          tags: note.tags,
          fields: this.parsePersistedNoteFields(note.fields),
          cards: note.cards.map(card => ({
            id: card.id,
            ankiCardId: card.ankiCardId,
            ordinal: card.ordinal,
            cardType: card.cardType,
            queue: card.queue,
            deck: card.deck,
          })),
          createdAt: note.createdAt,
        }),
      ),
      cards: cards.map(card =>
        CardSummaryEntity.fromRecord({
          id: card.id,
          importId: card.importId,
          ankiCardId: card.ankiCardId,
          ordinal: card.ordinal,
          cardType: card.cardType,
          queue: card.queue,
          dueDate: card.dueDate,
          interval: card.interval,
          easeFactor: card.easeFactor,
          repetitions: card.repetitions,
          lapses: card.lapses,
          deck: card.deck,
          note: {
            id: card.note.id,
            ankiNoteId: card.note.ankiNoteId,
            model: card.note.model,
            tags: card.note.tags,
            fieldPreviews: this.buildFieldPreviews(card.note.fields),
          },
          createdAt: card.createdAt,
        }),
      ),
      media: mediaFiles.map(mediaFile =>
        MediaEntity.fromRecord(this.toMediaShape(mediaFile)),
      ),
    });
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

  async findImportNotes(
    importId: string,
    query: ListImportNotesQueryDto,
  ): Promise<PaginatedNotesEntity> {
    await this.ensureImportExists(importId);

    const { page, limit, skip, take } = this.resolvePagination(query);
    const where = this.buildNoteWhereInput(importId, query);

    const [notes, totalItems] = await Promise.all([
      this.prisma.note.findMany({
        where,
        orderBy: [{ ankiNoteId: 'asc' }, { id: 'asc' }],
        skip,
        take,
        include: {
          model: {
            select: {
              id: true,
              ankiModelId: true,
              name: true,
            },
          },
          _count: {
            select: {
              cards: true,
            },
          },
        },
      }),
      this.prisma.note.count({ where }),
    ]);

    return PaginatedNotesEntity.create({
      items: notes.map(note =>
        NoteSummaryEntity.fromRecord({
          id: note.id,
          importId: note.importId,
          ankiNoteId: note.ankiNoteId,
          model: note.model,
          tags: note.tags,
          fieldPreviews: this.buildFieldPreviews(note.fields),
          cardsCount: note._count.cards,
          createdAt: note.createdAt,
        }),
      ),
      page,
      limit,
      totalItems,
    });
  }

  async findNote(id: string): Promise<NoteEntity> {
    const note = await this.prisma.note.findUnique({
      where: { id },
      include: {
        model: {
          select: {
            id: true,
            ankiModelId: true,
            name: true,
          },
        },
        cards: {
          orderBy: [{ ordinal: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            ankiCardId: true,
            ordinal: true,
            cardType: true,
            queue: true,
            deck: {
              select: {
                id: true,
                ankiDeckId: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!note) {
      throw new NotFoundException('Note not found.');
    }

    return NoteEntity.fromRecord({
      id: note.id,
      importId: note.importId,
      ankiNoteId: note.ankiNoteId,
      model: note.model,
      tags: note.tags,
      fields: this.parsePersistedNoteFields(note.fields),
      cards: note.cards.map(card => ({
        id: card.id,
        ankiCardId: card.ankiCardId,
        ordinal: card.ordinal,
        cardType: card.cardType,
        queue: card.queue,
        deck: card.deck,
      })),
      createdAt: note.createdAt,
    });
  }

  async findImportCards(
    importId: string,
    query: ListImportCardsQueryDto,
  ): Promise<PaginatedCardsEntity> {
    await this.ensureImportExists(importId);

    const { page, limit, skip, take } = this.resolvePagination(query);
    const where = this.buildCardWhereInput(importId, query);

    const [cards, totalItems] = await Promise.all([
      this.prisma.card.findMany({
        where,
        orderBy: [{ ordinal: 'asc' }, { ankiCardId: 'asc' }, { id: 'asc' }],
        skip,
        take,
        include: {
          deck: {
            select: {
              id: true,
              ankiDeckId: true,
              name: true,
            },
          },
          note: {
            select: {
              id: true,
              ankiNoteId: true,
              tags: true,
              fields: true,
              model: {
                select: {
                  id: true,
                  ankiModelId: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.card.count({ where }),
    ]);

    return PaginatedCardsEntity.create({
      items: cards.map(card =>
        CardSummaryEntity.fromRecord({
          id: card.id,
          importId: card.importId,
          ankiCardId: card.ankiCardId,
          ordinal: card.ordinal,
          cardType: card.cardType,
          queue: card.queue,
          dueDate: card.dueDate,
          interval: card.interval,
          easeFactor: card.easeFactor,
          repetitions: card.repetitions,
          lapses: card.lapses,
          deck: card.deck,
          note: {
            id: card.note.id,
            ankiNoteId: card.note.ankiNoteId,
            model: card.note.model,
            tags: card.note.tags,
            fieldPreviews: this.buildFieldPreviews(card.note.fields),
          },
          createdAt: card.createdAt,
        }),
      ),
      page,
      limit,
      totalItems,
    });
  }

  async findCard(id: string): Promise<CardEntity> {
    const card = await this.prisma.card.findUnique({
      where: { id },
      include: {
        deck: {
          select: {
            id: true,
            ankiDeckId: true,
            name: true,
          },
        },
        note: {
          select: {
            id: true,
            ankiNoteId: true,
            tags: true,
            fields: true,
            model: {
              select: {
                id: true,
                ankiModelId: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!card) {
      throw new NotFoundException('Card not found.');
    }

    return CardEntity.fromRecord({
      id: card.id,
      importId: card.importId,
      ankiCardId: card.ankiCardId,
      ordinal: card.ordinal,
      cardType: card.cardType,
      queue: card.queue,
      dueDate: card.dueDate,
      interval: card.interval,
      easeFactor: card.easeFactor,
      repetitions: card.repetitions,
      lapses: card.lapses,
      deck: card.deck,
      note: {
        id: card.note.id,
        ankiNoteId: card.note.ankiNoteId,
        model: card.note.model,
        tags: card.note.tags,
        fields: this.parsePersistedNoteFields(card.note.fields),
      },
      createdAt: card.createdAt,
    });
  }

  async findImportMedia(
    importId: string,
    query: ListImportMediaQueryDto,
  ): Promise<PaginatedMediaEntity> {
    await this.ensureImportExists(importId);

    const { page, limit, skip, take } = this.resolvePagination(query);
    const where: Prisma.MediaFileWhereInput = {
      importId,
      ...(query.type ? { type: query.type } : {}),
    };

    const [mediaFiles, totalItems] = await Promise.all([
      this.prisma.mediaFile.findMany({
        where,
        orderBy: [{ ankiIndex: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.mediaFile.count({ where }),
    ]);

    return PaginatedMediaEntity.create({
      items: mediaFiles.map(mediaFile =>
        MediaEntity.fromRecord(this.toMediaShape(mediaFile)),
      ),
      page,
      limit,
      totalItems,
    });
  }

  async findMediaInfo(id: string): Promise<MediaInfoEntity> {
    const mediaFile = await this.getMediaRecordOrThrow(id, 'Media not found.');

    return MediaInfoEntity.fromRecord({
      ...this.toMediaShape(mediaFile),
      fileAvailable: await this.isMediaFileAvailable(mediaFile),
    });
  }

  async readMediaFile(id: string): Promise<StreamableFile> {
    const mediaFile = await this.getMediaRecordOrThrow(
      id,
      'Media file not found.',
    );
    const mediaPath = this.resolveMediaFilePath(
      mediaFile.importId,
      mediaFile.storageUrl,
    );

    let mediaStats: Awaited<ReturnType<typeof stat>>;

    try {
      mediaStats = await stat(mediaPath);
    } catch {
      throw new NotFoundException('Media file not found.');
    }

    return new StreamableFile(createReadStream(mediaPath), {
      type: mediaFile.mimeType,
      disposition: `inline; filename="${this.sanitizeDispositionFileName(mediaFile.originalName)}"`,
      length: mediaStats.size,
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

  private buildNoteWhereInput(
    importId: string,
    query: ListImportNotesQueryDto,
  ): Prisma.NoteWhereInput {
    const tags = this.parseTagsFilter(query.tags);

    return {
      importId,
      ...(query.deckId
        ? {
            cards: {
              some: {
                deckId: query.deckId,
              },
            },
          }
        : {}),
      ...(tags.length > 0
        ? {
            tags: {
              hasEvery: tags,
            },
          }
        : {}),
    };
  }

  private buildCardWhereInput(
    importId: string,
    query: ListImportCardsQueryDto,
  ): Prisma.CardWhereInput {
    const tags = this.parseTagsFilter(query.tags);

    return {
      importId,
      ...(query.deckId ? { deckId: query.deckId } : {}),
      ...(tags.length > 0
        ? {
            note: {
              tags: {
                hasEvery: tags,
              },
            },
          }
        : {}),
    };
  }

  private parseTagsFilter(rawTags?: string): string[] {
    if (!rawTags) {
      return [];
    }

    return [
      ...new Set(
        rawTags
          .split(',')
          .map(tag => tag.trim())
          .filter(Boolean),
      ),
    ];
  }

  private buildImportExportUnavailableMessage(
    status: 'PROCESSING' | 'COMPLETED' | 'FAILED',
    failureReason: string | null,
  ): string {
    if (status === 'FAILED' && failureReason) {
      return `Import export is only available for COMPLETED imports. Current status: FAILED. Failure reason: ${failureReason}`;
    }

    return `Import export is only available for COMPLETED imports. Current status: ${status}.`;
  }

  private parsePersistedNoteFields(
    value: Prisma.JsonValue,
  ): Record<string, NoteFieldValueShape> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([fieldName, rawFieldValue]) => {
          const fieldValue =
            rawFieldValue &&
            typeof rawFieldValue === 'object' &&
            !Array.isArray(rawFieldValue)
              ? (rawFieldValue as Record<string, unknown>)
              : {};
          const mediaReferences = Array.isArray(fieldValue.mediaReferences)
            ? fieldValue.mediaReferences
                .map(reference => this.parsePersistedMediaReference(reference))
                .filter(
                  (
                    reference,
                  ): reference is NoteFieldValueShape['mediaReferences'][number] =>
                    reference !== null,
                )
            : [];

          return [
            fieldName,
            {
              value:
                typeof fieldValue.value === 'string' ? fieldValue.value : '',
              mediaReferences,
            },
          ];
        },
      ),
    );
  }

  private parsePersistedMediaReference(
    value: unknown,
  ): NoteFieldValueShape['mediaReferences'][number] | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const reference = value as Record<string, unknown>;

    if (
      (reference.type === 'IMAGE' || reference.type === 'AUDIO') &&
      typeof reference.reference === 'string'
    ) {
      return {
        type: reference.type,
        reference: reference.reference,
      };
    }

    return null;
  }

  private buildFieldPreviews(value: Prisma.JsonValue): NoteFieldPreviewShape[] {
    return Object.entries(this.parsePersistedNoteFields(value)).map(
      ([fieldName, fieldValue]) => ({
        name: fieldName,
        valuePreview: this.toPreviewValue(fieldValue.value),
        mediaReferencesCount: fieldValue.mediaReferences.length,
      }),
    );
  }

  private toPreviewValue(value: string): string {
    return value.length <= 120 ? value : `${value.slice(0, 117)}...`;
  }

  private async getMediaRecordOrThrow(
    id: string,
    message: string,
  ): Promise<{
    id: string;
    importId: string;
    ankiIndex: string;
    originalName: string;
    mimeType: string;
    sizeKb: number;
    storageUrl: string;
    type: MediaType;
    createdAt: Date;
  }> {
    const mediaFile = await this.prisma.mediaFile.findUnique({
      where: { id },
    });

    if (!mediaFile) {
      throw new NotFoundException(message);
    }

    return mediaFile;
  }

  private toMediaShape(mediaFile: {
    id: string;
    importId: string;
    ankiIndex: string;
    originalName: string;
    mimeType: string;
    sizeKb: number;
    type: MediaType;
    createdAt: Date;
  }): {
    id: string;
    importId: string;
    ankiIndex: string;
    originalName: string;
    mimeType: string;
    sizeKb: number;
    type: MediaType;
    downloadUrl: string;
    infoUrl: string;
    createdAt: Date;
  } {
    const basePath = `/${config.app.apiPrefix}/v${config.app.apiVersion}/media/${mediaFile.id}`;

    return {
      id: mediaFile.id,
      importId: mediaFile.importId,
      ankiIndex: mediaFile.ankiIndex,
      originalName: mediaFile.originalName,
      mimeType: mediaFile.mimeType,
      sizeKb: mediaFile.sizeKb,
      type: mediaFile.type,
      downloadUrl: basePath,
      infoUrl: `${basePath}/info`,
      createdAt: mediaFile.createdAt,
    };
  }

  private async isMediaFileAvailable(mediaFile: {
    importId: string;
    storageUrl: string;
  }): Promise<boolean> {
    try {
      await stat(
        this.resolveMediaFilePath(mediaFile.importId, mediaFile.storageUrl),
      );
      return true;
    } catch {
      return false;
    }
  }

  private resolveMediaFilePath(importId: string, storageUrl: string): string {
    const importMediaPath = resolve(config.storage.mediaDir, importId);
    const fileName = basename(storageUrl.replaceAll('\\', '/')).trim();

    if (fileName.length === 0) {
      throw new NotFoundException('Media file not found.');
    }

    const mediaPath = resolve(importMediaPath, fileName);

    if (!mediaPath.startsWith(`${importMediaPath}${sep}`)) {
      throw new NotFoundException('Media file not found.');
    }

    return mediaPath;
  }

  private sanitizeDispositionFileName(originalName: string): string {
    const fileName = basename(originalName.replaceAll('\\', '/')).trim();
    const sanitized = fileName.replaceAll('"', '_');

    return sanitized.length > 0 ? sanitized : 'media-file';
  }

  private getWorkspacePath(importId: string): string {
    return join(config.storage.importsTempDir, importId);
  }

  private getSourceArchivePath(importId: string): string {
    return join(this.getWorkspacePath(importId), 'source.apkg');
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

  private normalizeImportCreationError(error: unknown): {
    failureReason: string;
    exception: HttpException;
  } {
    if (error instanceof InvalidAnkiPackageError) {
      return {
        failureReason: error.message,
        exception: new UnprocessableEntityException(error.message),
      };
    }

    if (error instanceof HttpException) {
      return {
        failureReason: this.extractHttpExceptionMessage(error),
        exception: error,
      };
    }

    return {
      failureReason: 'The import failed due to an unexpected internal error.',
      exception: new InternalServerErrorException(
        'Failed to process the uploaded .apkg file.',
      ),
    };
  }

  private extractHttpExceptionMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    const message = (response as { message?: string | string[] }).message;

    if (Array.isArray(message)) {
      return message[0] ?? exception.message;
    }

    return typeof message === 'string' ? message : exception.message;
  }

  private logImportCreationFailure(
    importId: string | null,
    failureReason: string,
    error: unknown,
  ): void {
    const context = importId
      ? `Import ${importId} failed: ${failureReason}`
      : failureReason;

    if (error instanceof InvalidAnkiPackageError) {
      this.logger.warn(context);
      return;
    }

    this.logger.error(
      context,
      error instanceof Error ? error.stack : undefined,
    );
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
