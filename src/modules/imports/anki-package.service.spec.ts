import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AnkiPackageService,
  InvalidAnkiPackageError,
  PreparedImportArchive,
  RawAnkiCollectionRow,
  RawAnkiNoteRow,
} from './anki-package.service';

describe('AnkiPackageService', () => {
  let service: AnkiPackageService;
  let temporaryDirectories: string[];

  beforeEach(() => {
    service = new AnkiPackageService();
    temporaryDirectories = [];
  });

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.map(directory =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it('parses collection metadata preserving deck hierarchy and note templates', () => {
    const metadata = service.parseCollectionMetadata(
      createCollectionRow({
        models: JSON.stringify({
          '20': {
            id: 20,
            name: 'Basic (and reversed card)',
            flds: [{ name: 'Front' }, { name: 'Back' }, { name: 'Audio' }],
            tmpls: [
              {
                ord: 0,
                name: 'Card 1',
                qfmt: '{{Front}}',
                afmt: '{{Back}}',
              },
              {
                ord: 1,
                name: 'Card 2',
                qfmt: '{{Back}}',
                afmt: '{{Front}}',
              },
            ],
          },
        }),
        decks: JSON.stringify({
          '200': {
            id: 200,
            name: 'English::Vocabulary::Advanced',
            desc: 'Advanced deck',
          },
        }),
      }),
    );

    expect(metadata).toEqual({
      noteModels: [
        {
          ankiModelId: '20',
          name: 'Basic (and reversed card)',
          fields: [
            { ordinal: 0, name: 'Front' },
            { ordinal: 1, name: 'Back' },
            { ordinal: 2, name: 'Audio' },
          ],
          templates: [
            {
              ordinal: 0,
              name: 'Card 1',
              questionFormat: '{{Front}}',
              answerFormat: '{{Back}}',
            },
            {
              ordinal: 1,
              name: 'Card 2',
              questionFormat: '{{Back}}',
              answerFormat: '{{Front}}',
            },
          ],
        },
      ],
      decks: [
        {
          ankiDeckId: '200',
          name: 'English::Vocabulary::Advanced',
          description: 'Advanced deck',
        },
      ],
    });
  });

  it('maps note fields by model order, tags, and media references', () => {
    const parsedNotes = service.parseNotes(
      [
        createNoteRow({
          tags: ' anki imported ',
          flds: 'Front text <img src="front.png">\x1fBack text\x1f[sound:audio.mp3]',
        }),
      ],
      [
        {
          ankiModelId: '20',
          name: 'Basic (and reversed card)',
          fields: [
            { ordinal: 0, name: 'Front' },
            { ordinal: 1, name: 'Back' },
            { ordinal: 2, name: 'Audio' },
          ],
          templates: [],
        },
      ],
    );

    expect(parsedNotes).toEqual([
      {
        ankiNoteId: '1',
        ankiModelId: '20',
        tags: ['anki', 'imported'],
        fields: {
          Front: {
            value: 'Front text <img src="front.png">',
            mediaReferences: [{ type: 'IMAGE', reference: 'front.png' }],
          },
          Back: {
            value: 'Back text',
            mediaReferences: [],
          },
          Audio: {
            value: '[sound:audio.mp3]',
            mediaReferences: [{ type: 'AUDIO', reference: 'audio.mp3' }],
          },
        },
      },
    ]);
  });

  it('rejects notes whose field count does not match the note model', () => {
    expect(() =>
      service.parseNotes(
        [createNoteRow({ flds: 'only-one-field' })],
        [
          {
            ankiModelId: '20',
            name: 'Basic (and reversed card)',
            fields: [
              { ordinal: 0, name: 'Front' },
              { ordinal: 1, name: 'Back' },
            ],
            templates: [],
          },
        ],
      ),
    ).toThrow(
      new InvalidAnkiPackageError(
        'The Anki note 1 field count does not match note model 20.',
      ),
    );
  });

  it('parses media metadata and reports media mapped but missing from the package', async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), 'anki-package-media-'));
    temporaryDirectories.push(workspacePath);

    const mediaMapPath = join(workspacePath, 'media');
    const mediaFilePath = join(workspacePath, '0');

    await writeFile(
      mediaMapPath,
      JSON.stringify({ '0': 'front.png', '1': 'audio.mp3' }),
    );
    await writeFile(mediaFilePath, Buffer.from('image-bytes'));

    const preparedArchive: PreparedImportArchive = {
      importId: 'import-1',
      workspacePath,
      sourceArchivePath: join(workspacePath, 'source.apkg'),
      extractedPath: workspacePath,
      collectionFile: {
        fileName: 'collection.anki2',
        filePath: join(workspacePath, 'collection.anki2'),
        relativePath: 'collection.anki2',
      },
      mediaMapPath,
      mediaMapRelativePath: 'media',
      mediaFiles: [
        {
          index: '0',
          filePath: mediaFilePath,
          relativePath: '0',
          sizeBytes: 11,
        },
      ],
    };

    await expect(service.parseMediaFiles(preparedArchive)).resolves.toEqual({
      files: [
        {
          ankiIndex: '0',
          originalName: 'front.png',
          filePath: mediaFilePath,
          relativePath: '0',
          sizeBytes: 11,
          mimeType: 'image/png',
          type: 'IMAGE',
        },
      ],
      missingFiles: [
        {
          ankiIndex: '1',
          originalName: 'audio.mp3',
        },
      ],
    });
  });
});

function createCollectionRow(
  overrides: Partial<Pick<RawAnkiCollectionRow, 'models' | 'decks'>> = {},
): RawAnkiCollectionRow {
  return {
    id: 1,
    crt: 0,
    mod: 1,
    scm: 1,
    ver: 11,
    dty: 0,
    usn: 0,
    ls: 0,
    conf: '{}',
    models: '{}',
    decks: '{}',
    dconf: '{}',
    tags: '{}',
    ...overrides,
  };
}

function createNoteRow(
  overrides: Partial<Pick<RawAnkiNoteRow, 'mid' | 'tags' | 'flds'>> = {},
): RawAnkiNoteRow {
  return {
    id: 1,
    guid: 'note-guid',
    mid: 20,
    mod: 1,
    usn: 0,
    tags: '',
    flds: 'Front\x1fBack\x1fAudio',
    sfld: 0,
    csum: 123,
    flags: 0,
    data: '',
    ...overrides,
  };
}
