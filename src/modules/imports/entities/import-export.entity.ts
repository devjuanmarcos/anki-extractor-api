import { ApiProperty } from '@nestjs/swagger';
import { CardSummaryEntity } from './card.entity';
import { DeckEntity } from './deck.entity';
import { ImportDetailsEntity } from './import-details.entity';
import { MediaEntity } from './media.entity';
import { NoteEntity } from './note.entity';

type ImportExportShape = {
  import: ImportDetailsEntity;
  decks: DeckEntity[];
  notes: NoteEntity[];
  cards: CardSummaryEntity[];
  media: MediaEntity[];
};

export class ImportExportEntity {
  @ApiProperty({ type: ImportDetailsEntity })
  import!: ImportDetailsEntity;

  @ApiProperty({ type: [DeckEntity] })
  decks!: DeckEntity[];

  @ApiProperty({ type: [NoteEntity] })
  notes!: NoteEntity[];

  @ApiProperty({ type: [CardSummaryEntity] })
  cards!: CardSummaryEntity[];

  @ApiProperty({ type: [MediaEntity] })
  media!: MediaEntity[];

  static create(record: ImportExportShape): ImportExportEntity {
    return {
      import: record.import,
      decks: record.decks,
      notes: record.notes,
      cards: record.cards,
      media: record.media,
    };
  }
}
