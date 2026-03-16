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

type CardNoteSummaryShape = {
  id: string;
  ankiNoteId: string;
  model: NoteModelSummaryShape;
  tags: string[];
  fieldPreviews: NoteFieldPreviewShape[];
};

type CardNoteDetailShape = {
  id: string;
  ankiNoteId: string;
  model: NoteModelSummaryShape;
  tags: string[];
  fields: Record<string, NoteFieldValueShape>;
};

type CardSummaryShape = {
  id: string;
  importId: string;
  ankiCardId: string;
  ordinal: number;
  cardType: number;
  queue: number;
  dueDate: number | null;
  interval: number | null;
  easeFactor: number | null;
  repetitions: number;
  lapses: number;
  deck: DeckSummaryShape;
  note: CardNoteSummaryShape;
  createdAt: Date;
};

type CardShape = {
  id: string;
  importId: string;
  ankiCardId: string;
  ordinal: number;
  cardType: number;
  queue: number;
  dueDate: number | null;
  interval: number | null;
  easeFactor: number | null;
  repetitions: number;
  lapses: number;
  deck: DeckSummaryShape;
  note: CardNoteDetailShape;
  createdAt: Date;
};

export class CardNoteSummaryEntity {
  @ApiProperty({
    example: '2c7e3383-e8f0-4778-a558-e4da8087b806',
  })
  noteId!: string;

  @ApiProperty({ example: '1' })
  ankiNoteId!: string;

  @ApiProperty({ type: NoteModelSummaryEntity })
  model!: NoteModelSummaryEntity;

  @ApiProperty({ type: [String], example: ['anki', 'imported'] })
  tags!: string[];

  @ApiProperty({ type: [NoteFieldPreviewEntity] })
  fieldPreviews!: NoteFieldPreviewEntity[];

  static fromRecord(record: CardNoteSummaryShape): CardNoteSummaryEntity {
    return {
      noteId: record.id,
      ankiNoteId: record.ankiNoteId,
      model: NoteModelSummaryEntity.fromRecord(record.model),
      tags: record.tags,
      fieldPreviews: record.fieldPreviews.map(field =>
        NoteFieldPreviewEntity.fromRecord(field),
      ),
    };
  }
}

export class CardNoteDetailEntity {
  @ApiProperty({
    example: '2c7e3383-e8f0-4778-a558-e4da8087b806',
  })
  noteId!: string;

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

  static fromRecord(record: CardNoteDetailShape): CardNoteDetailEntity {
    return {
      noteId: record.id,
      ankiNoteId: record.ankiNoteId,
      model: NoteModelSummaryEntity.fromRecord(record.model),
      tags: record.tags,
      fields: Object.fromEntries(
        Object.entries(record.fields).map(([fieldName, fieldValue]) => [
          fieldName,
          NoteFieldValueEntity.fromRecord(fieldValue),
        ]),
      ),
    };
  }
}

export class CardSummaryEntity {
  @ApiProperty({
    example: '8f8e62c1-baf2-4f37-a14d-18d7af92b48c',
  })
  cardId!: string;

  @ApiProperty({
    example: 'd5cc7d43-1483-4e4a-a520-77dfc4cbe010',
  })
  importId!: string;

  @ApiProperty({ example: '10' })
  ankiCardId!: string;

  @ApiProperty({ example: 0 })
  ordinal!: number;

  @ApiProperty({ example: 0 })
  cardType!: number;

  @ApiProperty({ example: 0 })
  queue!: number;

  @ApiProperty({ example: 42, nullable: true })
  dueDate!: number | null;

  @ApiProperty({ example: 7, nullable: true })
  interval!: number | null;

  @ApiProperty({ example: 2500, nullable: true })
  easeFactor!: number | null;

  @ApiProperty({ example: 3 })
  repetitions!: number;

  @ApiProperty({ example: 1 })
  lapses!: number;

  @ApiProperty({ type: DeckSummaryEntity })
  deck!: DeckSummaryEntity;

  @ApiProperty({ type: CardNoteSummaryEntity })
  note!: CardNoteSummaryEntity;

  @ApiProperty()
  createdAt!: Date;

  static fromRecord(record: CardSummaryShape): CardSummaryEntity {
    return {
      cardId: record.id,
      importId: record.importId,
      ankiCardId: record.ankiCardId,
      ordinal: record.ordinal,
      cardType: record.cardType,
      queue: record.queue,
      dueDate: record.dueDate,
      interval: record.interval,
      easeFactor: record.easeFactor,
      repetitions: record.repetitions,
      lapses: record.lapses,
      deck: DeckSummaryEntity.fromRecord(record.deck),
      note: CardNoteSummaryEntity.fromRecord(record.note),
      createdAt: record.createdAt,
    };
  }
}

export class CardEntity {
  @ApiProperty({
    example: '8f8e62c1-baf2-4f37-a14d-18d7af92b48c',
  })
  cardId!: string;

  @ApiProperty({
    example: 'd5cc7d43-1483-4e4a-a520-77dfc4cbe010',
  })
  importId!: string;

  @ApiProperty({ example: '10' })
  ankiCardId!: string;

  @ApiProperty({ example: 0 })
  ordinal!: number;

  @ApiProperty({ example: 0 })
  cardType!: number;

  @ApiProperty({ example: 0 })
  queue!: number;

  @ApiProperty({ example: 42, nullable: true })
  dueDate!: number | null;

  @ApiProperty({ example: 7, nullable: true })
  interval!: number | null;

  @ApiProperty({ example: 2500, nullable: true })
  easeFactor!: number | null;

  @ApiProperty({ example: 3 })
  repetitions!: number;

  @ApiProperty({ example: 1 })
  lapses!: number;

  @ApiProperty({ type: DeckSummaryEntity })
  deck!: DeckSummaryEntity;

  @ApiProperty({ type: CardNoteDetailEntity })
  note!: CardNoteDetailEntity;

  @ApiProperty()
  createdAt!: Date;

  static fromRecord(record: CardShape): CardEntity {
    return {
      cardId: record.id,
      importId: record.importId,
      ankiCardId: record.ankiCardId,
      ordinal: record.ordinal,
      cardType: record.cardType,
      queue: record.queue,
      dueDate: record.dueDate,
      interval: record.interval,
      easeFactor: record.easeFactor,
      repetitions: record.repetitions,
      lapses: record.lapses,
      deck: DeckSummaryEntity.fromRecord(record.deck),
      note: CardNoteDetailEntity.fromRecord(record.note),
      createdAt: record.createdAt,
    };
  }
}
