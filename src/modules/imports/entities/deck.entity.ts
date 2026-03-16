import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

type DeckShape = {
  id: string;
  importId: string;
  ankiDeckId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  notesCount: number;
  cardsCount: number;
};

export class DeckEntity {
  @ApiProperty({
    example: '49768756-6369-4f37-a4dc-c427f2c91381',
  })
  deckId!: string;

  @ApiProperty({
    example: 'd5cc7d43-1483-4e4a-a520-77dfc4cbe010',
  })
  importId!: string;

  @ApiProperty({ example: '200' })
  ankiDeckId!: string;

  @ApiProperty({ example: 'English::Vocabulary::Advanced' })
  name!: string;

  @ApiPropertyOptional({ nullable: true, example: 'Advanced deck' })
  description!: string | null;

  @ApiProperty({ example: 1 })
  notesCount!: number;

  @ApiProperty({ example: 2 })
  cardsCount!: number;

  @ApiProperty()
  createdAt!: Date;

  static fromRecord(record: DeckShape): DeckEntity {
    return {
      deckId: record.id,
      importId: record.importId,
      ankiDeckId: record.ankiDeckId,
      name: record.name,
      description: record.description,
      notesCount: record.notesCount,
      cardsCount: record.cardsCount,
      createdAt: record.createdAt,
    };
  }
}
