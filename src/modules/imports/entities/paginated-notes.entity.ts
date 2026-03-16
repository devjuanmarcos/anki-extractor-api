import { ApiProperty } from '@nestjs/swagger';
import { NoteSummaryEntity } from './note.entity';

export class PaginatedNotesEntity {
  @ApiProperty({ type: [NoteSummaryEntity] })
  items!: NoteSummaryEntity[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  totalItems!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;

  static create(input: {
    items: NoteSummaryEntity[];
    page: number;
    limit: number;
    totalItems: number;
  }): PaginatedNotesEntity {
    return {
      ...input,
      totalPages: Math.max(1, Math.ceil(input.totalItems / input.limit)),
    };
  }
}
