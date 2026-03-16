import { ImportStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

type ImportShape = {
  id: string;
  originalName: string;
  status: ImportStatus;
};

export class ImportEntity {
  @ApiProperty({
    example: 'd5cc7d43-1483-4e4a-a520-77dfc4cbe010',
  })
  importId!: string;

  @ApiProperty({ example: 'english.apkg' })
  originalName!: string;

  @ApiProperty({ enum: ImportStatus, enumName: 'ImportStatus' })
  status!: ImportStatus;

  static fromRecord(record: ImportShape): ImportEntity {
    return {
      importId: record.id,
      originalName: record.originalName,
      status: record.status,
    };
  }
}
