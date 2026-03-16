import { ApiProperty } from '@nestjs/swagger';
import {
  DeckSummaryEntity,
  DeckSummaryShape,
  NoteFieldPreviewEntity,
  NoteFieldPreviewShape,
  NoteFieldValueEntity,
  NoteFieldValueShape,
  NoteModelSummaryEntity,
  NoteModelSummaryShape,
} from './shared-content.entity';

type NoteCardSummaryShape = {
  id: string;
  ankiCardId: string;
  ordinal: number;
  cardType: number;
  queue: number;
  deck: DeckSummaryShape;
};

type NoteSummaryShape = {
  id: string;
  importId: string;
  ankiNoteId: string;
  model: NoteModelSummaryShape;
  tags: string[];
  fieldPreviews: NoteFieldPreviewShape[];
  cardsCount: number;
  createdAt: Date;
};

type NoteShape = {
  id: string;
  importId: string;
  ankiNoteId: string;
  model: NoteModelSummaryShape;
  tags: string[];
  fields: Record<string, NoteFieldValueShape>;
  cards: NoteCardSummaryShape[];
  createdAt: Date;
};

export class NoteCardSummaryEntity {
  @ApiProperty({
    example: '8f8e62c1-baf2-4f37-a14d-18d7af92b48c',
  })
  cardId!: string;

  @ApiProperty({ example: '10' })
  ankiCardId!: string;

  @ApiProperty({ example: 0 })
  ordinal!: number;

  @ApiProperty({ example: 0 })
  cardType!: number;

  @ApiProperty({ example: 0 })
  queue!: number;

  @ApiProperty({ type: DeckSummaryEntity })
  deck!: DeckSummaryEntity;

  static fromRecord(record: NoteCardSummaryShape): NoteCardSummaryEntity {
    return {
      cardId: record.id,
      ankiCardId: record.ankiCardId,
      ordinal: record.ordinal,
      cardType: record.cardType,
      queue: record.queue,
      deck: DeckSummaryEntity.fromRecord(record.deck),
    };
  }
}

export class NoteSummaryEntity {
  @ApiProperty({
    example: '2c7e3383-e8f0-4778-a558-e4da8087b806',
  })
  noteId!: string;

  @ApiProperty({
    example: 'd5cc7d43-1483-4e4a-a520-77dfc4cbe010',
  })
  importId!: string;

  @ApiProperty({ example: '1' })
  ankiNoteId!: string;

  @ApiProperty({ type: NoteModelSummaryEntity })
  model!: NoteModelSummaryEntity;

  @ApiProperty({ type: [String], example: ['anki', 'imported'] })
  tags!: string[];

  @ApiProperty({ type: [NoteFieldPreviewEntity] })
  fieldPreviews!: NoteFieldPreviewEntity[];

  @ApiProperty({ example: 2 })
  cardsCount!: number;

  @ApiProperty()
  createdAt!: Date;

  static fromRecord(record: NoteSummaryShape): NoteSummaryEntity {
    return {
      noteId: record.id,
      importId: record.importId,
      ankiNoteId: record.ankiNoteId,
      model: NoteModelSummaryEntity.fromRecord(record.model),
      tags: record.tags,
      fieldPreviews: record.fieldPreviews.map(field =>
        NoteFieldPreviewEntity.fromRecord(field),
      ),
      cardsCount: record.cardsCount,
      createdAt: record.createdAt,
    };
  }
}

export class NoteEntity {
  @ApiProperty({
    example: '2c7e3383-e8f0-4778-a558-e4da8087b806',
  })
  noteId!: string;

  @ApiProperty({
    example: 'd5cc7d43-1483-4e4a-a520-77dfc4cbe010',
  })
  importId!: string;

  @ApiProperty({ example: '1' })
  ankiNoteId!: string;

  @ApiProperty({ type: NoteModelSummaryEntity })
  model!: NoteModelSummaryEntity;

  @ApiProperty({ type: [String], example: ['anki', 'imported'] })
  tags!: string[];

  @ApiProperty({
    example: {
      Front: {
        value: 'Front text <img src="front.png">',
        mediaReferences: [{ type: 'IMAGE', reference: 'front.png' }],
      },
      Back: {
        value: 'Back text with <b>HTML</b>',
        mediaReferences: [],
      },
    },
  })
  fields!: Record<string, NoteFieldValueEntity>;

  @ApiProperty({ type: [NoteCardSummaryEntity] })
  cards!: NoteCardSummaryEntity[];

  @ApiProperty()
  createdAt!: Date;

  static fromRecord(record: NoteShape): NoteEntity {
    return {
      noteId: record.id,
      importId: record.importId,
      ankiNoteId: record.ankiNoteId,
      model: NoteModelSummaryEntity.fromRecord(record.model),
      tags: record.tags,
      fields: Object.fromEntries(
        Object.entries(record.fields).map(([fieldName, fieldValue]) => [
          fieldName,
          NoteFieldValueEntity.fromRecord(fieldValue),
        ]),
      ),
      cards: record.cards.map(card => NoteCardSummaryEntity.fromRecord(card)),
      createdAt: record.createdAt,
    };
  }
}
