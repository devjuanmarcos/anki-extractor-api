import { ApiProperty } from '@nestjs/swagger';
import { MediaEntity } from './media.entity';

export class PaginatedMediaEntity {
  @ApiProperty({ type: [MediaEntity] })
  items!: MediaEntity[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  totalItems!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;

  static create(input: {
    items: MediaEntity[];
    page: number;
    limit: number;
    totalItems: number;
  }): PaginatedMediaEntity {
    return {
      ...input,
      totalPages: Math.max(1, Math.ceil(input.totalItems / input.limit)),
    };
  }
}
