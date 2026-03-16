import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import { config } from '../../config/config';
import { PrismaService } from '../../common/services/prisma.service';
import { AnkiPackageService } from './anki-package.service';
import { ImportsService } from './imports.service';

type MockTransactionClient = {
  import: {
    update: jest.Mock;
  };
  deck: {
    createMany: jest.Mock;
  };
  noteModel: {
    createMany: jest.Mock;
    findMany: jest.Mock;
  };
  note: {
    createMany: jest.Mock;
  };
};

describe('ImportsService', () => {
  let service: ImportsService;
  let ankiPackageService: AnkiPackageService;
  let prisma: {
    $transaction: jest.Mock;
    import: {
      create: jest.Mock;
      delete: jest.Mock;
      update: jest.Mock;
    };
    deck: {
      createMany: jest.Mock;
    };
    noteModel: {
      createMany: jest.Mock;
      findMany: jest.Mock;
    };
    note: {
      createMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      import: {
        create: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      },
      deck: {
        createMany: jest.fn(),
      },
      noteModel: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
      note: {
        createMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (client: MockTransactionClient) => Promise<unknown>) =>
        callback(prisma),
    );

    ankiPackageService = new AnkiPackageService();
    service = new ImportsService(
      prisma as unknown as PrismaService,
      ankiPackageService,
    );

    await Promise.all([
      rm(config.storage.importsTempDir, { recursive: true, force: true }),
      rm(config.storage.mediaDir, { recursive: true, force: true }),
    ]);
  });

  afterEach(async () => {
    await Promise.all([
      rm(config.storage.importsTempDir, { recursive: true, force: true }),
      rm(config.storage.mediaDir, { recursive: true, force: true }),
    ]);
  });

  it('creates a processing import, extracts the archive, and persists parsed notes', async () => {
    await mkdir(config.storage.importsIncomingDir, { recursive: true });

    const stagedFilePath = join(
      config.storage.importsIncomingDir,
      'english.upload',
    );

    await writeApkgArchive(stagedFilePath);

    prisma.import.create.mockResolvedValue({
      id: 'import-1',
      originalName: 'english.apkg',
      status: 'PROCESSING',
    });
    prisma.noteModel.findMany.mockResolvedValue([
      {
        id: 'note-model-1',
        ankiModelId: '20',
      },
    ]);

    const result = await service.create({
      originalName: 'english.apkg',
      size: 1_024,
      temporaryFilePath: stagedFilePath,
    });

    expect(prisma.import.create).toHaveBeenCalledWith({
      data: {
        originalName: 'english.apkg',
        fileSize: 1_024,
        status: 'PROCESSING',
      },
    });
    expect(result).toEqual({
      importId: 'import-1',
      originalName: 'english.apkg',
      status: 'PROCESSING',
    });
    expect(prisma.deck.createMany).toHaveBeenCalledWith({
      data: [
        {
          importId: 'import-1',
          ankiDeckId: '200',
          name: 'English::Vocabulary::Advanced',
          description: 'Advanced deck',
        },
      ],
    });
    expect(prisma.noteModel.createMany).toHaveBeenCalledWith({
      data: [
        {
          importId: 'import-1',
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
              answerFormat: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
            },
            {
              ordinal: 1,
              name: 'Card 2',
              questionFormat: '{{Back}}',
              answerFormat: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}',
            },
          ],
        },
      ],
    });
    expect(prisma.note.createMany).toHaveBeenCalledWith({
      data: [
        {
          importId: 'import-1',
          ankiNoteId: '1',
          modelId: 'note-model-1',
          fields: {
            Front: {
              value: 'Front text <img src="front.png">',
              mediaReferences: [{ type: 'IMAGE', reference: 'front.png' }],
            },
            Back: {
              value: 'Back text with <b>HTML</b>',
              mediaReferences: [],
            },
            Audio: {
              value: '[sound:audio.mp3]',
              mediaReferences: [{ type: 'AUDIO', reference: 'audio.mp3' }],
            },
          },
          tags: ['anki', 'imported'],
        },
      ],
    });
    expect(prisma.import.update).toHaveBeenCalledWith({
      where: { id: 'import-1' },
      data: {
        decksCount: 1,
        notesCount: 1,
      },
    });

    const storedFilePath = join(
      config.storage.importsTempDir,
      'import-1',
      'source.apkg',
    );
    const extractedPath = join(
      config.storage.importsTempDir,
      'import-1',
      'extracted',
    );

    expect(existsSync(storedFilePath)).toBe(true);
    expect(existsSync(join(extractedPath, 'collection.anki2'))).toBe(true);
    expect(existsSync(join(extractedPath, 'media'))).toBe(true);
    expect(existsSync(join(extractedPath, '0'))).toBe(true);
    expect(existsSync(join(extractedPath, '1'))).toBe(true);
    expect(
      existsSync(join(config.storage.mediaDir, 'import-1', 'source.apkg')),
    ).toBe(false);

    const preparedSource =
      await ankiPackageService.readPreparedImportSource('import-1');

    expect(preparedSource.collectionFile.fileName).toBe('collection.anki2');
    expect(basename(preparedSource.mediaMapPath!)).toBe('media');
    expect(preparedSource.mediaFiles.map(file => file.index)).toEqual([
      '0',
      '1',
    ]);
    expect(preparedSource.raw.collection?.models).toContain(
      'Basic (and reversed card)',
    );
    expect(preparedSource.raw.collection?.decks).toContain(
      'English::Vocabulary::Advanced',
    );
    expect(preparedSource.raw.notes).toEqual([
      expect.objectContaining({
        id: 1,
        mid: 20,
        flds: 'Front text <img src="front.png">\x1fBack text with <b>HTML</b>\x1f[sound:audio.mp3]',
      }),
    ]);
    expect(preparedSource.raw.cards).toEqual([
      expect.objectContaining({
        id: 10,
        nid: 1,
        did: 200,
      }),
    ]);
  });

  it('marks the import as failed and removes the workspace when the archive has no collection file', async () => {
    await mkdir(config.storage.importsIncomingDir, { recursive: true });

    const stagedFilePath = join(
      config.storage.importsIncomingDir,
      'missing-collection.upload',
    );

    await writeApkgArchive(stagedFilePath, { withCollection: false });

    prisma.import.create.mockResolvedValue({
      id: 'import-2',
      originalName: 'missing-collection.apkg',
      status: 'PROCESSING',
    });
    prisma.import.update.mockResolvedValue({
      id: 'import-2',
      originalName: 'missing-collection.apkg',
      status: 'FAILED',
      failureReason:
        'The .apkg package does not contain collection.anki2 or collection.anki21.',
    });

    await expect(
      service.create({
        originalName: 'missing-collection.apkg',
        size: 256,
        temporaryFilePath: stagedFilePath,
      }),
    ).rejects.toThrow(
      'The .apkg package does not contain collection.anki2 or collection.anki21.',
    );

    expect(prisma.import.update).toHaveBeenCalledWith({
      where: { id: 'import-2' },
      data: {
        status: 'FAILED',
        failureReason:
          'The .apkg package does not contain collection.anki2 or collection.anki21.',
      },
    });
    expect(prisma.deck.createMany).not.toHaveBeenCalled();
    expect(prisma.noteModel.createMany).not.toHaveBeenCalled();
    expect(prisma.import.delete).not.toHaveBeenCalled();
    expect(existsSync(join(config.storage.importsTempDir, 'import-2'))).toBe(
      false,
    );
  });

  it('marks the import as failed when the SQLite collection cannot be opened', async () => {
    await mkdir(config.storage.importsIncomingDir, { recursive: true });

    const stagedFilePath = join(
      config.storage.importsIncomingDir,
      'corrupt-collection.upload',
    );

    await writeApkgArchive(stagedFilePath, { corruptCollection: true });

    prisma.import.create.mockResolvedValue({
      id: 'import-3',
      originalName: 'corrupt-collection.apkg',
      status: 'PROCESSING',
    });
    prisma.import.update.mockResolvedValue({
      id: 'import-3',
      originalName: 'corrupt-collection.apkg',
      status: 'FAILED',
      failureReason:
        'The .apkg package does not contain a readable Anki SQLite collection.',
    });

    await expect(
      service.create({
        originalName: 'corrupt-collection.apkg',
        size: 256,
        temporaryFilePath: stagedFilePath,
      }),
    ).rejects.toThrow(
      'The .apkg package does not contain a readable Anki SQLite collection.',
    );

    expect(prisma.import.update).toHaveBeenCalledWith({
      where: { id: 'import-3' },
      data: {
        status: 'FAILED',
        failureReason:
          'The .apkg package does not contain a readable Anki SQLite collection.',
      },
    });
    expect(prisma.deck.createMany).not.toHaveBeenCalled();
    expect(prisma.noteModel.createMany).not.toHaveBeenCalled();
    expect(existsSync(join(config.storage.importsTempDir, 'import-3'))).toBe(
      false,
    );
  });

  it('marks the import as failed without persisting metadata when col.models JSON is invalid', async () => {
    await mkdir(config.storage.importsIncomingDir, { recursive: true });

    const stagedFilePath = join(
      config.storage.importsIncomingDir,
      'invalid-models.upload',
    );

    await writeApkgArchive(stagedFilePath, { invalidModelsJson: true });

    prisma.import.create.mockResolvedValue({
      id: 'import-4',
      originalName: 'invalid-models.apkg',
      status: 'PROCESSING',
    });
    prisma.import.update.mockResolvedValue({
      id: 'import-4',
      originalName: 'invalid-models.apkg',
      status: 'FAILED',
      failureReason: 'The Anki collection has invalid JSON in col.models.',
    });

    await expect(
      service.create({
        originalName: 'invalid-models.apkg',
        size: 256,
        temporaryFilePath: stagedFilePath,
      }),
    ).rejects.toThrow('The Anki collection has invalid JSON in col.models.');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.deck.createMany).not.toHaveBeenCalled();
    expect(prisma.noteModel.createMany).not.toHaveBeenCalled();
    expect(prisma.import.update).toHaveBeenCalledWith({
      where: { id: 'import-4' },
      data: {
        status: 'FAILED',
        failureReason: 'The Anki collection has invalid JSON in col.models.',
      },
    });
    expect(existsSync(join(config.storage.importsTempDir, 'import-4'))).toBe(
      false,
    );
  });

  it('marks the import as failed when a note references a missing note model', async () => {
    await mkdir(config.storage.importsIncomingDir, { recursive: true });

    const stagedFilePath = join(
      config.storage.importsIncomingDir,
      'missing-note-model.upload',
    );

    await writeApkgArchive(stagedFilePath, {
      missingNoteModelReference: true,
    });

    prisma.import.create.mockResolvedValue({
      id: 'import-5',
      originalName: 'missing-note-model.apkg',
      status: 'PROCESSING',
    });
    prisma.import.update.mockResolvedValue({
      id: 'import-5',
      originalName: 'missing-note-model.apkg',
      status: 'FAILED',
      failureReason: 'The Anki note 1 references missing note model 999.',
    });

    await expect(
      service.create({
        originalName: 'missing-note-model.apkg',
        size: 256,
        temporaryFilePath: stagedFilePath,
      }),
    ).rejects.toThrow('The Anki note 1 references missing note model 999.');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.noteModel.createMany).not.toHaveBeenCalled();
    expect(prisma.note.createMany).not.toHaveBeenCalled();
    expect(prisma.import.update).toHaveBeenCalledWith({
      where: { id: 'import-5' },
      data: {
        status: 'FAILED',
        failureReason: 'The Anki note 1 references missing note model 999.',
      },
    });
    expect(existsSync(join(config.storage.importsTempDir, 'import-5'))).toBe(
      false,
    );
  });

  it('rejects invalid uploads before creating an import record', async () => {
    await mkdir(config.storage.importsIncomingDir, { recursive: true });

    const stagedFilePath = join(
      config.storage.importsIncomingDir,
      'archive.upload',
    );
    await writeFile(stagedFilePath, Buffer.from('zip-data'));

    await expect(
      service.create({
        originalName: 'archive.zip',
        size: 8,
        temporaryFilePath: stagedFilePath,
      }),
    ).rejects.toThrow(
      new BadRequestException('Only .apkg files are supported.'),
    );

    expect(prisma.import.create).not.toHaveBeenCalled();
    expect(existsSync(stagedFilePath)).toBe(false);
  });
});

async function writeApkgArchive(
  targetFilePath: string,
  options: {
    withCollection?: boolean;
    corruptCollection?: boolean;
    invalidModelsJson?: boolean;
    invalidDecksJson?: boolean;
    missingNoteModelReference?: boolean;
  } = {},
): Promise<void> {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'anki-package-fixture-'));

  try {
    const zip = new AdmZip();

    if (options.withCollection !== false) {
      const collectionPath = join(fixtureRoot, 'collection.anki2');

      if (options.corruptCollection) {
        await writeFile(collectionPath, Buffer.from('not-a-sqlite-file'));
      } else {
        createSqliteCollection(collectionPath, {
          invalidModelsJson: options.invalidModelsJson,
          invalidDecksJson: options.invalidDecksJson,
          missingNoteModelReference: options.missingNoteModelReference,
        });
      }

      zip.addLocalFile(collectionPath);
    }

    zip.addFile(
      'media',
      Buffer.from(JSON.stringify({ '0': 'front.png', '1': 'audio.mp3' })),
    );
    zip.addFile('0', Buffer.from('image-bytes'));
    zip.addFile('1', Buffer.from('audio-bytes'));

    await writeFile(targetFilePath, zip.toBuffer());
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

function createSqliteCollection(
  collectionPath: string,
  options: {
    invalidModelsJson?: boolean;
    invalidDecksJson?: boolean;
    missingNoteModelReference?: boolean;
  } = {},
): void {
  const database = new Database(collectionPath);

  try {
    database.exec(`
      CREATE TABLE col (
        id INTEGER PRIMARY KEY,
        crt INTEGER NOT NULL,
        mod INTEGER NOT NULL,
        scm INTEGER NOT NULL,
        ver INTEGER NOT NULL,
        dty INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        ls INTEGER NOT NULL,
        conf TEXT NOT NULL,
        models TEXT NOT NULL,
        decks TEXT NOT NULL,
        dconf TEXT NOT NULL,
        tags TEXT NOT NULL
      );

      CREATE TABLE notes (
        id INTEGER PRIMARY KEY,
        guid TEXT NOT NULL,
        mid INTEGER NOT NULL,
        mod INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        tags TEXT NOT NULL,
        flds TEXT NOT NULL,
        sfld INTEGER NOT NULL,
        csum INTEGER NOT NULL,
        flags INTEGER NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE cards (
        id INTEGER PRIMARY KEY,
        nid INTEGER NOT NULL,
        did INTEGER NOT NULL,
        ord INTEGER NOT NULL,
        mod INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        type INTEGER NOT NULL,
        queue INTEGER NOT NULL,
        due INTEGER NOT NULL,
        ivl INTEGER NOT NULL,
        factor INTEGER NOT NULL,
        reps INTEGER NOT NULL,
        lapses INTEGER NOT NULL,
        left INTEGER NOT NULL,
        odue INTEGER NOT NULL,
        odid INTEGER NOT NULL,
        flags INTEGER NOT NULL,
        data TEXT NOT NULL
      );
    `);

    database
      .prepare(
        `
          INSERT INTO col (
            id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        1,
        0,
        1,
        1,
        11,
        0,
        0,
        0,
        JSON.stringify({ nextPos: 1 }),
        options.invalidModelsJson
          ? '{"20":'
          : JSON.stringify({
              '20': {
                id: 20,
                name: 'Basic (and reversed card)',
                flds: [{ name: 'Front' }, { name: 'Back' }, { name: 'Audio' }],
                tmpls: [
                  {
                    name: 'Card 1',
                    ord: 0,
                    qfmt: '{{Front}}',
                    afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
                  },
                  {
                    name: 'Card 2',
                    ord: 1,
                    qfmt: '{{Back}}',
                    afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}',
                  },
                ],
              },
            }),
        options.invalidDecksJson
          ? '{"200":'
          : JSON.stringify({
              '200': {
                id: 200,
                name: 'English::Vocabulary::Advanced',
                desc: 'Advanced deck',
              },
            }),
        JSON.stringify({}),
        JSON.stringify({}),
      );

    database
      .prepare(
        `
          INSERT INTO notes (
            id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        1,
        'note-guid',
        options.missingNoteModelReference ? 999 : 20,
        1,
        0,
        ' anki imported ',
        'Front text <img src="front.png">\x1fBack text with <b>HTML</b>\x1f[sound:audio.mp3]',
        0,
        123,
        0,
        '',
      );

    database
      .prepare(
        `
          INSERT INTO cards (
            id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(10, 1, 200, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '');
  } finally {
    database.close();
  }
}
