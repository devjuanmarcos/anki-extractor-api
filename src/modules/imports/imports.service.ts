import { basename, join } from 'node:path';
import { mkdir, rename, rm } from 'node:fs/promises';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../common/services/prisma.service';
import { config } from '../../config/config';
import {
  ParsedAnkiCollectionMetadata,
  AnkiPackageService,
  InvalidAnkiPackageError,
} from './anki-package.service';
import { CreateImportDto } from './dto/create-import.dto';
import { ImportEntity } from './entities/import.entity';
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
        await this.ankiPackageService.readPreparedImportCollection(importId);
      const collectionMetadata =
        this.ankiPackageService.parseCollectionMetadata(
          preparedCollection.raw.collection,
        );

      await this.persistCollectionMetadata(importId, collectionMetadata);

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

      await transaction.import.update({
        where: { id: importId },
        data: {
          decksCount: collectionMetadata.decks.length,
        },
      });
    });
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
    ]);
  }

  private async safeRemovePath(path?: string): Promise<void> {
    if (!path) {
      return;
    }

    await rm(path, { recursive: true, force: true }).catch(() => undefined);
  }
}
