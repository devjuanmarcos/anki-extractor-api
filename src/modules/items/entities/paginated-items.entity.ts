import { ApiProperty } from '@nestjs/swagger';
import { ItemEntity } from './item.entity';

export class PaginatedItemsEntity {
  @ApiProperty({ type: [ItemEntity] })
  items!: ItemEntity[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  totalItems!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;

  static create(input: {
    items: ItemEntity[];
    page: number;
    limit: number;
    totalItems: number;
  }): PaginatedItemsEntity {
    return {
      ...input,
      totalPages: Math.max(1, Math.ceil(input.totalItems / input.limit)),
    };
  }
}
