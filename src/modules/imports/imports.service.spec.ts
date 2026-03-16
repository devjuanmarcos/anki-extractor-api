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

describe('ImportsService', () => {
  let service: ImportsService;
  let ankiPackageService: AnkiPackageService;
  let prisma: {
    import: {
      create: jest.Mock;
      delete: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      import: {
        create: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      },
    };

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

  it('creates a processing import, extracts the archive, and exposes raw package sources', async () => {
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
    expect(prisma.import.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      importId: 'import-1',
      originalName: 'english.apkg',
      status: 'PROCESSING',
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
    expect(preparedSource.raw.collection?.models).toContain('Basic');
    expect(preparedSource.raw.collection?.decks).toContain('Default');
    expect(preparedSource.raw.notes).toEqual([
      expect.objectContaining({
        id: 1,
        flds: 'Front text\x1fBack text',
      }),
    ]);
    expect(preparedSource.raw.cards).toEqual([
      expect.objectContaining({
        id: 10,
        nid: 1,
        did: 100,
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
    expect(existsSync(join(config.storage.importsTempDir, 'import-3'))).toBe(
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
        createSqliteCollection(collectionPath);
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

function createSqliteCollection(collectionPath: string): void {
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
        JSON.stringify({
          '10': {
            id: 10,
            name: 'Basic',
            flds: [{ name: 'Front' }, { name: 'Back' }],
            tmpls: [{ name: 'Card 1' }],
          },
        }),
        JSON.stringify({
          '100': {
            id: 100,
            name: 'Default',
            desc: 'Default deck',
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
        10,
        1,
        0,
        'anki imported',
        'Front text\x1fBack text',
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
      .run(10, 1, 100, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '');
  } finally {
    database.close();
  }
}
