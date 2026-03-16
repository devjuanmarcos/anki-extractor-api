import { MediaType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

type MediaShape = {
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
};

type MediaInfoShape = MediaShape & {
  fileAvailable: boolean;
};

export class MediaEntity {
  @ApiProperty({
    example: '1ebeb9d3-9225-4fc6-8dcf-ef8bc0709f85',
  })
  mediaId!: string;

  @ApiProperty({
    example: 'd5cc7d43-1483-4e4a-a520-77dfc4cbe010',
  })
  importId!: string;

  @ApiProperty({ example: '0' })
  ankiIndex!: string;

  @ApiProperty({ example: 'front.png' })
  originalName!: string;

  @ApiProperty({ example: 'image/png' })
  mimeType!: string;

  @ApiProperty({ example: 1 })
  sizeKb!: number;

  @ApiProperty({ enum: MediaType, enumName: 'MediaType' })
  type!: MediaType;

  @ApiProperty({
    example: '/api/v1/media/1ebeb9d3-9225-4fc6-8dcf-ef8bc0709f85',
  })
  downloadUrl!: string;

  @ApiProperty({
    example: '/api/v1/media/1ebeb9d3-9225-4fc6-8dcf-ef8bc0709f85/info',
  })
  infoUrl!: string;

  @ApiProperty()
  createdAt!: Date;

  static fromRecord(record: MediaShape): MediaEntity {
    return {
      mediaId: record.id,
      importId: record.importId,
      ankiIndex: record.ankiIndex,
      originalName: record.originalName,
      mimeType: record.mimeType,
      sizeKb: record.sizeKb,
      type: record.type,
      downloadUrl: record.downloadUrl,
      infoUrl: record.infoUrl,
      createdAt: record.createdAt,
    };
  }
}

export class MediaInfoEntity extends MediaEntity {
  @ApiProperty({ example: true })
  fileAvailable!: boolean;

  static fromRecord(record: MediaInfoShape): MediaInfoEntity {
    return {
      ...MediaEntity.fromRecord(record),
      fileAvailable: record.fileAvailable,
    };
  }
}
