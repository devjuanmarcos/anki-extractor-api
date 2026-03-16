import { ApiProperty } from '@nestjs/swagger';
import { ImportDetailsEntity } from './import-details.entity';

export class PaginatedImportsEntity {
  @ApiProperty({ type: [ImportDetailsEntity] })
  items!: ImportDetailsEntity[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  totalItems!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;

  static create(input: {
    items: ImportDetailsEntity[];
    page: number;
    limit: number;
    totalItems: number;
  }): PaginatedImportsEntity {
    return {
      ...input,
      totalPages: Math.max(1, Math.ceil(input.totalItems / input.limit)),
    };
  }
}
