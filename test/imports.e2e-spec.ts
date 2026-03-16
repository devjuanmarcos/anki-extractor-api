import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_REQUIRED = 'true';
process.env.DATABASE_URL =
  'postgresql://postgres:2611@localhost:5432/anki_extractor_local?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.ENABLE_REQUEST_LOGGING = 'false';

const storageRoot = mkdtempSync(join(tmpdir(), 'anki-imports-e2e-'));

process.env.IMPORTS_TEMP_DIR = join(storageRoot, 'imports-temp');
process.env.MEDIA_STORAGE_DIR = join(storageRoot, 'media');

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import { PrismaService } from '../src/common/services/prisma.service';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.setup';

describe('Imports API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let registeredEmail: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    await configureApplication(app as NestExpressApplication);
    await app.init();

    prisma = app.get(PrismaService);
    registeredEmail = `imports-e2e-${Date.now()}@example.com`;

    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const authResponse = await request(server)
      .post('/api/v1/auth/register')
      .send({
        name: 'Imports E2E',
        email: registeredEmail,
        password: 'Import@123',
      })
      .expect(201);

    accessToken = (authResponse.body as { accessToken: string }).accessToken;
  });

  beforeEach(async () => {
    await prisma.import.deleteMany();
    rmSync(process.env.IMPORTS_TEMP_DIR!, { recursive: true, force: true });
    rmSync(process.env.MEDIA_STORAGE_DIR!, { recursive: true, force: true });
  });

  afterAll(async () => {
    await prisma.import.deleteMany();
    await prisma.user.deleteMany({
      where: { email: registeredEmail },
    });

    rmSync(storageRoot, { recursive: true, force: true });
    await app.close();
  });

  it('creates a processing import for an authenticated .apkg upload and extracts its internal files', async () => {
    const fileContents = await createApkgBuffer();
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(server)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', fileContents, 'english.apkg')
      .expect(201);

    const body = response.body as {
      importId: string;
      originalName: string;
      status: string;
    };

    expect(body.originalName).toBe('english.apkg');
    expect(body.status).toBe('PROCESSING');

    const createdImport = await prisma.import.findUnique({
      where: { id: body.importId },
    });

    expect(createdImport).toMatchObject({
      id: body.importId,
      originalName: 'english.apkg',
      status: 'PROCESSING',
      fileSize: fileContents.length,
      failureReason: null,
    });

    const workspacePath = join(process.env.IMPORTS_TEMP_DIR!, body.importId);
    const storedFilePath = join(workspacePath, 'source.apkg');
    const extractedPath = join(workspacePath, 'extracted');

    expect(existsSync(storedFilePath)).toBe(true);
    expect(readFileSync(storedFilePath)).toEqual(fileContents);
    expect(existsSync(join(extractedPath, 'collection.anki2'))).toBe(true);
    expect(existsSync(join(extractedPath, 'media'))).toBe(true);
    expect(existsSync(join(extractedPath, '0'))).toBe(true);
    expect(existsSync(join(extractedPath, '1'))).toBe(true);
    expect(
      existsSync(
        join(process.env.MEDIA_STORAGE_DIR!, body.importId, 'source.apkg'),
      ),
    ).toBe(false);
  });

  it('marks the import as failed and cleans the workspace when the .apkg has no collection', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const fileContents = await createApkgBuffer({ withCollection: false });

    const response = await request(server)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', fileContents, 'missing-collection.apkg')
      .expect(422);

    expect((response.body as { message: string }).message).toBe(
      'The .apkg package does not contain collection.anki2 or collection.anki21.',
    );

    const failedImport = await prisma.import.findFirst({
      where: { originalName: 'missing-collection.apkg' },
      orderBy: { createdAt: 'desc' },
    });

    expect(failedImport).toMatchObject({
      originalName: 'missing-collection.apkg',
      status: 'FAILED',
      failureReason:
        'The .apkg package does not contain collection.anki2 or collection.anki21.',
    });
    expect(
      existsSync(join(process.env.IMPORTS_TEMP_DIR!, failedImport!.id)),
    ).toBe(false);

    await expect(prisma.deck.count()).resolves.toBe(0);
    await expect(prisma.note.count()).resolves.toBe(0);
    await expect(prisma.card.count()).resolves.toBe(0);
    await expect(prisma.mediaFile.count()).resolves.toBe(0);
  });

  it('returns 400 when the multipart payload does not contain file', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const beforeCount = await prisma.import.count();

    const response = await request(server)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('note', 'missing file')
      .expect(400);

    expect((response.body as { message: string }).message).toBe(
      'File is required.',
    );
    await expect(prisma.import.count()).resolves.toBe(beforeCount);
  });

  it('returns 400 when the uploaded file is empty', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const beforeCount = await prisma.import.count();

    const response = await request(server)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.alloc(0), 'empty.apkg')
      .expect(400);

    expect((response.body as { message: string }).message).toBe(
      'Uploaded file cannot be empty.',
    );
    await expect(prisma.import.count()).resolves.toBe(beforeCount);
  });

  it('returns 400 when the uploaded file extension is not .apkg', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const beforeCount = await prisma.import.count();

    const response = await request(server)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('zip-data'), 'archive.zip')
      .expect(400);

    expect((response.body as { message: string }).message).toBe(
      'Only .apkg files are supported.',
    );
    await expect(prisma.import.count()).resolves.toBe(beforeCount);
  });
});

async function createApkgBuffer(
  options: {
    withCollection?: boolean;
  } = {},
): Promise<Buffer> {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'anki-package-fixture-'));

  try {
    const zip = new AdmZip();

    if (options.withCollection !== false) {
      const collectionPath = join(fixtureRoot, 'collection.anki2');
      createSqliteCollection(collectionPath);
      zip.addLocalFile(collectionPath);
    }

    zip.addFile(
      'media',
      Buffer.from(JSON.stringify({ '0': 'front.png', '1': 'audio.mp3' })),
    );
    zip.addFile('0', Buffer.from('image-bytes'));
    zip.addFile('1', Buffer.from('audio-bytes'));

    return zip.toBuffer();
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
