import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

  it('creates a processing import for an authenticated .apkg upload', async () => {
    const fileContents = Buffer.from('anki-package');
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
    });

    const storedFilePath = join(
      process.env.IMPORTS_TEMP_DIR!,
      body.importId,
      'source.apkg',
    );

    expect(existsSync(storedFilePath)).toBe(true);
    expect(readFileSync(storedFilePath)).toEqual(fileContents);
    expect(
      existsSync(
        join(process.env.MEDIA_STORAGE_DIR!, body.importId, 'source.apkg'),
      ),
    ).toBe(false);
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
