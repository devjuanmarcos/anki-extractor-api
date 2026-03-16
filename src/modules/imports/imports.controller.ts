import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { diskStorage } from 'multer';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ZodValidationPipe } from '../../common/pipes/zod.validation.pipe';
import { config } from '../../config/config';
import {
  createImportDtoFromUploadedFile,
  CreateImportDto,
} from './dto/create-import.dto';
import { ListImportCardsQueryDto } from './dto/list-import-cards-query.dto';
import { ListImportMediaQueryDto } from './dto/list-import-media-query.dto';
import { ListImportNotesQueryDto } from './dto/list-import-notes-query.dto';
import { PaginatedCardsEntity } from './entities/paginated-cards.entity';
import { UploadImportFileDto } from './dto/upload-import-file.dto';
import { PaginatedMediaEntity } from './entities/paginated-media.entity';
import { PaginatedNotesEntity } from './entities/paginated-notes.entity';
import { ImportDetailsEntity } from './entities/import-details.entity';
import { ImportEntity } from './entities/import.entity';
import { PaginatedDecksEntity } from './entities/paginated-decks.entity';
import { PaginatedImportsEntity } from './entities/paginated-imports.entity';
import { ImportsService } from './imports.service';
import {
  listImportCardsQuerySchema,
  listImportDecksQuerySchema,
  listImportMediaQuerySchema,
  listImportNotesQuerySchema,
  listImportsQuerySchema,
} from './schemas/import-query.schema';

const importUploadInterceptor = FileInterceptor('file', {
  storage: diskStorage({
    destination: (_req, _file, callback) => {
      try {
        mkdirSync(config.storage.importsIncomingDir, { recursive: true });
        callback(null, config.storage.importsIncomingDir);
      } catch (error) {
        callback(
          error instanceof Error
            ? error
            : new Error('Unable to prepare upload directory.'),
          '',
        );
      }
    },
    filename: (_req, _file, callback) => {
      callback(null, `${Date.now()}-${randomUUID()}.upload`);
    },
  }),
  limits: {
    files: 1,
  },
});

const importNotFoundExamples = {
  notes: {
    statusCode: 404,
    timestamp: '2026-03-16T15:30:00.000Z',
    message: 'Import not found.',
    error: 'Not Found',
    path: '/api/v1/imports/d5cc7d43-1483-4e4a-a520-77dfc4cbe010/notes',
    method: 'GET',
  },
  cards: {
    statusCode: 404,
    timestamp: '2026-03-16T15:30:00.000Z',
    message: 'Import not found.',
    error: 'Not Found',
    path: '/api/v1/imports/d5cc7d43-1483-4e4a-a520-77dfc4cbe010/cards',
    method: 'GET',
  },
  media: {
    statusCode: 404,
    timestamp: '2026-03-16T15:30:00.000Z',
    message: 'Import not found.',
    error: 'Not Found',
    path: '/api/v1/imports/d5cc7d43-1483-4e4a-a520-77dfc4cbe010/media',
    method: 'GET',
  },
};

@ApiTags('Imports')
@ApiBearerAuth('bearer')
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post()
  @UseInterceptors(importUploadInterceptor)
  @ApiOperation({
    summary: 'Upload a .apkg package and create an import in processing state.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    type: UploadImportFileDto,
    description:
      'Send a single authenticated multipart/form-data request with the Anki package in the `file` field.',
  })
  @ApiCreatedResponse({
    description: 'Import created with PROCESSING status.',
    type: ImportEntity,
  })
  @ApiBadRequestResponse({
    description:
      'File is required, cannot be empty, and must use the .apkg extension.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  async create(
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ImportEntity> {
    const dto: CreateImportDto = createImportDtoFromUploadedFile(file);
    return this.importsService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List imports with status, counts, and audit metadata.',
  })
  @ApiOkResponse({ type: PaginatedImportsEntity })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  async findAll(
    @Query(new ZodValidationPipe(listImportsQuerySchema))
    query: PaginationDto,
  ): Promise<PaginatedImportsEntity> {
    return this.importsService.findAll(query);
  }

  @Get(':importId/decks')
  @ApiOperation({
    summary: 'List decks extracted for a specific import.',
  })
  @ApiOkResponse({ type: PaginatedDecksEntity })
  @ApiNotFoundResponse({ description: 'Import not found.' })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  async findDecks(
    @Param('importId') importId: string,
    @Query(new ZodValidationPipe(listImportDecksQuerySchema))
    query: PaginationDto,
  ): Promise<PaginatedDecksEntity> {
    return this.importsService.findImportDecks(importId, query);
  }

  @Get(':importId/notes')
  @ApiOperation({
    summary: 'List notes extracted for a specific import.',
  })
  @ApiOkResponse({ type: PaginatedNotesEntity })
  @ApiNotFoundResponse({
    description: 'Import not found.',
    schema: { example: importNotFoundExamples.notes },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  async findNotes(
    @Param('importId') importId: string,
    @Query(new ZodValidationPipe(listImportNotesQuerySchema))
    query: ListImportNotesQueryDto,
  ): Promise<PaginatedNotesEntity> {
    return this.importsService.findImportNotes(importId, query);
  }

  @Get(':importId/cards')
  @ApiOperation({
    summary:
      'List cards extracted for a specific import, including note summaries.',
  })
  @ApiOkResponse({ type: PaginatedCardsEntity })
  @ApiNotFoundResponse({
    description: 'Import not found.',
    schema: { example: importNotFoundExamples.cards },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  async findCards(
    @Param('importId') importId: string,
    @Query(new ZodValidationPipe(listImportCardsQuerySchema))
    query: ListImportCardsQueryDto,
  ): Promise<PaginatedCardsEntity> {
    return this.importsService.findImportCards(importId, query);
  }

  @Get(':importId/media')
  @ApiOperation({
    summary: 'List extracted media for a specific import.',
  })
  @ApiOkResponse({ type: PaginatedMediaEntity })
  @ApiNotFoundResponse({
    description: 'Import not found.',
    schema: { example: importNotFoundExamples.media },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  async findMedia(
    @Param('importId') importId: string,
    @Query(new ZodValidationPipe(listImportMediaQuerySchema))
    query: ListImportMediaQueryDto,
  ): Promise<PaginatedMediaEntity> {
    return this.importsService.findImportMedia(importId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an import with status, counts, and audit metadata.',
  })
  @ApiOkResponse({ type: ImportDetailsEntity })
  @ApiNotFoundResponse({ description: 'Import not found.' })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  async findOne(@Param('id') id: string): Promise<ImportDetailsEntity> {
    return this.importsService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete an import, its related records, and any locally stored media.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Import not found.' })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  async remove(@Param('id') id: string): Promise<void> {
    await this.importsService.remove(id);
  }
}
