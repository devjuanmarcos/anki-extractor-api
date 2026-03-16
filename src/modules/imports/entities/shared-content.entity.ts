import { ApiProperty } from '@nestjs/swagger';

export type NoteModelSummaryShape = {
  id: string;
  ankiModelId: string;
  name: string;
};

export type DeckSummaryShape = {
  id: string;
  ankiDeckId: string;
  name: string;
};

export type NoteFieldMediaReferenceShape = {
  type: 'IMAGE' | 'AUDIO';
  reference: string;
};

export type NoteFieldValueShape = {
  value: string;
  mediaReferences: NoteFieldMediaReferenceShape[];
};

export type NoteFieldPreviewShape = {
  name: string;
  valuePreview: string;
  mediaReferencesCount: number;
};

export class NoteModelSummaryEntity {
  @ApiProperty({
    example: 'b13f5d1b-b03d-4fcb-82ff-dcb2e1b34db1',
  })
  modelId!: string;

  @ApiProperty({ example: '20' })
  ankiModelId!: string;

  @ApiProperty({ example: 'Basic (and reversed card)' })
  name!: string;

  static fromRecord(record: NoteModelSummaryShape): NoteModelSummaryEntity {
    return {
      modelId: record.id,
      ankiModelId: record.ankiModelId,
      name: record.name,
    };
  }
}

export class DeckSummaryEntity {
  @ApiProperty({
    example: '49768756-6369-4f37-a4dc-c427f2c91381',
  })
  deckId!: string;

  @ApiProperty({ example: '200' })
  ankiDeckId!: string;

  @ApiProperty({ example: 'English::Vocabulary::Advanced' })
  name!: string;

  static fromRecord(record: DeckSummaryShape): DeckSummaryEntity {
    return {
      deckId: record.id,
      ankiDeckId: record.ankiDeckId,
      name: record.name,
    };
  }
}

export class NoteFieldMediaReferenceEntity {
  @ApiProperty({ example: 'IMAGE', enum: ['IMAGE', 'AUDIO'] })
  type!: 'IMAGE' | 'AUDIO';

  @ApiProperty({ example: 'front.png' })
  reference!: string;

  static fromRecord(
    record: NoteFieldMediaReferenceShape,
  ): NoteFieldMediaReferenceEntity {
    return {
      type: record.type,
      reference: record.reference,
    };
  }
}

export class NoteFieldValueEntity {
  @ApiProperty({ example: 'Front text <img src="front.png">' })
  value!: string;

  @ApiProperty({ type: [NoteFieldMediaReferenceEntity] })
  mediaReferences!: NoteFieldMediaReferenceEntity[];

  static fromRecord(record: NoteFieldValueShape): NoteFieldValueEntity {
    return {
      value: record.value,
      mediaReferences: record.mediaReferences.map(reference =>
        NoteFieldMediaReferenceEntity.fromRecord(reference),
      ),
    };
  }
}

export class NoteFieldPreviewEntity {
  @ApiProperty({ example: 'Front' })
  name!: string;

  @ApiProperty({ example: 'Front text <img src="front.png">' })
  valuePreview!: string;

  @ApiProperty({ example: 1 })
  mediaReferencesCount!: number;

  static fromRecord(record: NoteFieldPreviewShape): NoteFieldPreviewEntity {
    return {
      name: record.name,
      valuePreview: record.valuePreview,
      mediaReferencesCount: record.mediaReferencesCount,
    };
  }
}
