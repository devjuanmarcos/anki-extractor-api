import { ApiProperty } from '@nestjs/swagger';
import { CardSummaryEntity } from './card.entity';

export class PaginatedCardsEntity {
  @ApiProperty({ type: [CardSummaryEntity] })
  items!: CardSummaryEntity[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 5 })
  totalItems!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;

  static create(input: {
    items: CardSummaryEntity[];
    page: number;
    limit: number;
    totalItems: number;
  }): PaginatedCardsEntity {
    return {
      ...input,
      totalPages: Math.max(1, Math.ceil(input.totalItems / input.limit)),
    };
  }
}
