import { ApiProperty } from '@nestjs/swagger';
import { DeckEntity } from './deck.entity';

export class PaginatedDecksEntity {
  @ApiProperty({ type: [DeckEntity] })
  items!: DeckEntity[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  totalItems!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;

  static create(input: {
    items: DeckEntity[];
    page: number;
    limit: number;
    totalItems: number;
  }): PaginatedDecksEntity {
    return {
      ...input,
      totalPages: Math.max(1, Math.ceil(input.totalItems / input.limit)),
    };
  }
}
