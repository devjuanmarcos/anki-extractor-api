import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { diskStorage } from 'multer';
import {
  Controller,
  Post,
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
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { config } from '../../config/config';
import {
  createImportDtoFromUploadedFile,
  CreateImportDto,
} from './dto/create-import.dto';
import { UploadImportFileDto } from './dto/upload-import-file.dto';
import { ImportEntity } from './entities/import.entity';
import { ImportsService } from './imports.service';

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
}
