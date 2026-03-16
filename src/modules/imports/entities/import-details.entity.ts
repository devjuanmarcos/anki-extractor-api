import { ImportStatus } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

type ImportDetailsShape = {
  id: string;
  originalName: string;
  fileSize: number;
  status: ImportStatus;
  failureReason: string | null;
  decksCount: number;
  notesCount: number;
  cardsCount: number;
  mediaCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export class ImportDetailsEntity {
  @ApiProperty({
    example: 'd5cc7d43-1483-4e4a-a520-77dfc4cbe010',
  })
  importId!: string;

  @ApiProperty({ example: 'english.apkg' })
  originalName!: string;

  @ApiProperty({ example: 1024 })
  fileSize!: number;

  @ApiProperty({ enum: ImportStatus, enumName: 'ImportStatus' })
  status!: ImportStatus;

  @ApiPropertyOptional({
    nullable: true,
    example:
      'The .apkg package does not contain collection.anki2 or collection.anki21.',
  })
  failureReason!: string | null;

  @ApiProperty({ example: 1 })
  decksCount!: number;

  @ApiProperty({ example: 10 })
  notesCount!: number;

  @ApiProperty({ example: 20 })
  cardsCount!: number;

  @ApiProperty({ example: 3 })
  mediaCount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromRecord(record: ImportDetailsShape): ImportDetailsEntity {
    return {
      importId: record.id,
      originalName: record.originalName,
      fileSize: record.fileSize,
      status: record.status,
      failureReason: record.failureReason,
      decksCount: record.decksCount,
      notesCount: record.notesCount,
      cardsCount: record.cardsCount,
      mediaCount: record.mediaCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
