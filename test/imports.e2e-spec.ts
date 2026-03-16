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

jest.setTimeout(20_000);

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

  it('creates a processing import, extracts its files, and persists parsed notes and cards', async () => {
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
      status: 'COMPLETED',
      fileSize: fileContents.length,
      failureReason: null,
      decksCount: 1,
      notesCount: 1,
      cardsCount: 2,
      mediaCount: 2,
    });

    const persistedDecks = await prisma.deck.findMany({
      where: { importId: body.importId },
      orderBy: { ankiDeckId: 'asc' },
    });
    const persistedNoteModels = await prisma.noteModel.findMany({
      where: { importId: body.importId },
      orderBy: { ankiModelId: 'asc' },
    });
    const persistedNotes = await prisma.note.findMany({
      where: { importId: body.importId },
      include: {
        model: true,
      },
      orderBy: { ankiNoteId: 'asc' },
    });
    const persistedCards = await prisma.card.findMany({
      where: { importId: body.importId },
      include: {
        note: true,
        deck: true,
      },
      orderBy: { ordinal: 'asc' },
    });
    const persistedMediaFiles = await prisma.mediaFile.findMany({
      where: { importId: body.importId },
      orderBy: { ankiIndex: 'asc' },
    });

    expect(persistedDecks).toEqual([
      expect.objectContaining({
        importId: body.importId,
        ankiDeckId: '200',
        name: 'English::Vocabulary::Advanced',
        description: 'Advanced deck',
      }),
    ]);
    expect(persistedNoteModels).toEqual([
      expect.objectContaining({
        importId: body.importId,
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
      }),
    ]);
    expect(persistedNotes).toHaveLength(1);
    expect(persistedNotes[0]).toMatchObject({
      importId: body.importId,
      ankiNoteId: '1',
      tags: ['anki', 'imported'],
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
    });
    expect(persistedNotes[0]?.model).toMatchObject({
      importId: body.importId,
      ankiModelId: '20',
    });
    expect(persistedCards).toHaveLength(2);
    expect(persistedCards[0]).toMatchObject({
      importId: body.importId,
      ankiCardId: '10',
      ordinal: 0,
      cardType: 0,
      queue: 0,
      dueDate: 0,
      interval: 0,
      easeFactor: 0,
      repetitions: 0,
      lapses: 0,
    });
    expect(persistedCards[0]?.note.ankiNoteId).toBe('1');
    expect(persistedCards[0]?.deck.ankiDeckId).toBe('200');
    expect(persistedCards[1]).toMatchObject({
      importId: body.importId,
      ankiCardId: '11',
      ordinal: 1,
      cardType: 2,
      queue: 2,
      dueDate: 42,
      interval: 7,
      easeFactor: 2500,
      repetitions: 3,
      lapses: 1,
    });
    expect(persistedCards[1]?.note.ankiNoteId).toBe('1');
    expect(persistedCards[1]?.deck.ankiDeckId).toBe('200');
    expect(persistedMediaFiles).toEqual([
      expect.objectContaining({
        importId: body.importId,
        ankiIndex: '0',
        originalName: 'front.png',
        mimeType: 'image/png',
        sizeKb: 1,
        storageUrl: `${body.importId}/0-front.png`,
        type: 'IMAGE',
      }),
      expect.objectContaining({
        importId: body.importId,
        ankiIndex: '1',
        originalName: 'audio.mp3',
        mimeType: 'audio/mpeg',
        sizeKb: 1,
        storageUrl: `${body.importId}/1-audio.mp3`,
        type: 'AUDIO',
      }),
    ]);

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
    expect(
      existsSync(
        join(process.env.MEDIA_STORAGE_DIR!, body.importId, '0-front.png'),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(process.env.MEDIA_STORAGE_DIR!, body.importId, '1-audio.mp3'),
      ),
    ).toBe(true);
  });

  it('lists imports, decks, notes, cards, and media, then deletes an import with cleanup', async () => {
    const fileContents = await createApkgBuffer();
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const createResponse = await request(server)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', fileContents, 'english.apkg')
      .expect(201);

    const createdImport = createResponse.body as {
      importId: string;
      originalName: string;
      status: string;
    };

    const importsResponse = await request(server)
      .get('/api/v1/imports?page=1&limit=10')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(importsResponse.body).toMatchObject({
      items: [
        {
          importId: createdImport.importId,
          originalName: 'english.apkg',
          fileSize: fileContents.length,
          status: 'COMPLETED',
          failureReason: null,
          decksCount: 1,
          notesCount: 1,
          cardsCount: 2,
          mediaCount: 2,
        },
      ],
      page: 1,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
    });

    const importResponse = await request(server)
      .get(`/api/v1/imports/${createdImport.importId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(importResponse.body).toMatchObject({
      importId: createdImport.importId,
      originalName: 'english.apkg',
      fileSize: fileContents.length,
      status: 'COMPLETED',
      failureReason: null,
      decksCount: 1,
      notesCount: 1,
      cardsCount: 2,
      mediaCount: 2,
    });

    const importDecksResponse = await request(server)
      .get(`/api/v1/imports/${createdImport.importId}/decks?page=1&limit=10`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(importDecksResponse.body).toMatchObject({
      items: [
        {
          importId: createdImport.importId,
          ankiDeckId: '200',
          name: 'English::Vocabulary::Advanced',
          description: 'Advanced deck',
          notesCount: 1,
          cardsCount: 2,
        },
      ],
      page: 1,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
    });

    const deckId = (
      importDecksResponse.body as { items: Array<{ deckId: string }> }
    ).items[0].deckId;

    const deckResponse = await request(server)
      .get(`/api/v1/decks/${deckId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(deckResponse.body).toMatchObject({
      deckId,
      importId: createdImport.importId,
      ankiDeckId: '200',
      name: 'English::Vocabulary::Advanced',
      description: 'Advanced deck',
      notesCount: 1,
      cardsCount: 2,
    });

    const notesResponse = await request(server)
      .get(
        `/api/v1/imports/${createdImport.importId}/notes?page=1&limit=10&deckId=${deckId}&tags=anki,imported`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const notesListBody = notesResponse.body as unknown as {
      items: Array<{
        noteId: string;
        importId: string;
        ankiNoteId: string;
        tags: string[];
        model: {
          ankiModelId: string;
          name: string;
        };
        fieldPreviews: Array<{
          name: string;
          mediaReferencesCount: number;
        }>;
        cardsCount: number;
      }>;
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };

    expect(notesListBody).toMatchObject({
      page: 1,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
    });
    expect(notesListBody.items[0]).toMatchObject({
      importId: createdImport.importId,
      ankiNoteId: '1',
      tags: ['anki', 'imported'],
      model: {
        ankiModelId: '20',
        name: 'Basic (and reversed card)',
      },
      cardsCount: 2,
    });
    expect(notesListBody.items[0]?.fieldPreviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Front',
          mediaReferencesCount: 1,
        }),
        expect.objectContaining({
          name: 'Back',
          mediaReferencesCount: 0,
        }),
        expect.objectContaining({
          name: 'Audio',
          mediaReferencesCount: 1,
        }),
      ]),
    );

    const noteId = notesListBody.items[0].noteId;

    const noteResponse = await request(server)
      .get(`/api/v1/notes/${noteId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(noteResponse.body).toMatchObject({
      noteId,
      importId: createdImport.importId,
      ankiNoteId: '1',
      tags: ['anki', 'imported'],
      model: {
        ankiModelId: '20',
        name: 'Basic (and reversed card)',
      },
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
      cards: [
        {
          ankiCardId: '10',
          deck: {
            deckId,
            ankiDeckId: '200',
            name: 'English::Vocabulary::Advanced',
          },
        },
        {
          ankiCardId: '11',
          deck: {
            deckId,
            ankiDeckId: '200',
            name: 'English::Vocabulary::Advanced',
          },
        },
      ],
    });

    const cardsResponse = await request(server)
      .get(
        `/api/v1/imports/${createdImport.importId}/cards?deckId=${deckId}&page=1&limit=20`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const cardsListBody = cardsResponse.body as unknown as {
      items: Array<{
        cardId: string;
        importId: string;
        ankiCardId: string;
        deck: {
          deckId: string;
          ankiDeckId: string;
          name: string;
        };
        note: {
          noteId: string;
          ankiNoteId: string;
          tags: string[];
          model: {
            ankiModelId: string;
            name: string;
          };
          fieldPreviews: Array<{
            name: string;
            mediaReferencesCount: number;
          }>;
        };
      }>;
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };

    expect(cardsListBody).toMatchObject({
      page: 1,
      limit: 20,
      totalItems: 2,
      totalPages: 1,
    });
    expect(cardsListBody.items[0]).toMatchObject({
      importId: createdImport.importId,
      ankiCardId: '10',
      deck: {
        deckId,
        ankiDeckId: '200',
        name: 'English::Vocabulary::Advanced',
      },
      note: {
        noteId,
        ankiNoteId: '1',
        tags: ['anki', 'imported'],
        model: {
          ankiModelId: '20',
          name: 'Basic (and reversed card)',
        },
      },
    });
    expect(cardsListBody.items[0]?.note.fieldPreviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Front',
          mediaReferencesCount: 1,
        }),
      ]),
    );
    expect(cardsListBody.items[1]).toMatchObject({
      importId: createdImport.importId,
      ankiCardId: '11',
      deck: {
        deckId,
        ankiDeckId: '200',
        name: 'English::Vocabulary::Advanced',
      },
    });

    const cardId = cardsListBody.items[0].cardId;

    const cardResponse = await request(server)
      .get(`/api/v1/cards/${cardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(cardResponse.body).toMatchObject({
      cardId,
      importId: createdImport.importId,
      ankiCardId: '10',
      deck: {
        deckId,
        ankiDeckId: '200',
        name: 'English::Vocabulary::Advanced',
      },
      note: {
        noteId,
        ankiNoteId: '1',
        tags: ['anki', 'imported'],
        model: {
          ankiModelId: '20',
          name: 'Basic (and reversed card)',
        },
        fields: {
          Front: {
            value: 'Front text <img src="front.png">',
            mediaReferences: [{ type: 'IMAGE', reference: 'front.png' }],
          },
        },
      },
    });

    const mediaResponse = await request(server)
      .get(
        `/api/v1/imports/${createdImport.importId}/media?type=IMAGE&page=1&limit=10`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const mediaListBody = mediaResponse.body as unknown as {
      items: Array<{
        mediaId: string;
        importId: string;
        ankiIndex: string;
        originalName: string;
        mimeType: string;
        sizeKb: number;
        type: string;
        downloadUrl: string;
        infoUrl: string;
      }>;
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };

    expect(mediaListBody).toMatchObject({
      items: [
        {
          importId: createdImport.importId,
          ankiIndex: '0',
          originalName: 'front.png',
          mimeType: 'image/png',
          sizeKb: 1,
          type: 'IMAGE',
        },
      ],
      page: 1,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
    });
    expect(mediaListBody.items[0]?.downloadUrl).toContain('/api/v1/media/');
    expect(mediaListBody.items[0]?.infoUrl).toContain('/api/v1/media/');

    const mediaId = mediaListBody.items[0].mediaId;

    const mediaInfoResponse = await request(server)
      .get(`/api/v1/media/${mediaId}/info`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(mediaInfoResponse.body).toMatchObject({
      mediaId,
      importId: createdImport.importId,
      ankiIndex: '0',
      originalName: 'front.png',
      mimeType: 'image/png',
      sizeKb: 1,
      type: 'IMAGE',
      fileAvailable: true,
    });

    const mediaFileResponse = await request(server)
      .get(`/api/v1/media/${mediaId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(mediaFileResponse.headers['content-type']).toContain('image/png');
    expect(mediaFileResponse.body).toEqual(Buffer.from('image-bytes'));

    const workspacePath = join(
      process.env.IMPORTS_TEMP_DIR!,
      createdImport.importId,
    );
    const mediaPath = join(
      process.env.MEDIA_STORAGE_DIR!,
      createdImport.importId,
    );

    expect(existsSync(workspacePath)).toBe(true);
    expect(existsSync(mediaPath)).toBe(true);

    await request(server)
      .delete(`/api/v1/imports/${createdImport.importId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await expect(
      prisma.import.findUnique({
        where: { id: createdImport.importId },
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.deck.count({
        where: { importId: createdImport.importId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.note.count({
        where: { importId: createdImport.importId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.card.count({
        where: { importId: createdImport.importId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.mediaFile.count({
        where: { importId: createdImport.importId },
      }),
    ).resolves.toBe(0);
    expect(existsSync(workspacePath)).toBe(false);
    expect(existsSync(mediaPath)).toBe(false);
  });

  it('exports a completed import as structured JSON and rejects unfinished imports', async () => {
    const fileContents = await createApkgBuffer();
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const createResponse = await request(server)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', fileContents, 'english.apkg')
      .expect(201);

    const createdImport = createResponse.body as {
      importId: string;
    };

    const exportResponse = await request(server)
      .get(`/api/v1/imports/${createdImport.importId}/export`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const exportBody = exportResponse.body as {
      import: {
        importId: string;
        originalName: string;
        status: string;
        decksCount: number;
        notesCount: number;
        cardsCount: number;
        mediaCount: number;
      };
      decks: Array<{
        deckId: string;
        ankiDeckId: string;
        name: string;
        notesCount: number;
        cardsCount: number;
      }>;
      notes: Array<{
        noteId: string;
        ankiNoteId: string;
        fields: {
          Front: {
            value: string;
            mediaReferences: Array<{ type: string; reference: string }>;
          };
        };
        cards: Array<{ ankiCardId: string }>;
      }>;
      cards: Array<{
        cardId: string;
        ankiCardId: string;
        ordinal: number;
        cardType: number;
        queue: number;
        note: {
          noteId: string;
          ankiNoteId: string;
        };
      }>;
      media: Array<{
        mediaId: string;
        originalName: string;
        type: string;
      }>;
    };

    expect(exportBody.import).toMatchObject({
      importId: createdImport.importId,
      originalName: 'english.apkg',
      status: 'COMPLETED',
      decksCount: 1,
      notesCount: 1,
      cardsCount: 2,
      mediaCount: 2,
    });
    expect(exportBody.decks).toEqual([
      expect.objectContaining({
        importId: createdImport.importId,
        ankiDeckId: '200',
        name: 'English::Vocabulary::Advanced',
        notesCount: 1,
        cardsCount: 2,
      }),
    ]);
    expect(exportBody.notes).toHaveLength(1);
    expect(exportBody.notes[0]).toMatchObject({
      importId: createdImport.importId,
      ankiNoteId: '1',
      tags: ['anki', 'imported'],
      model: {
        ankiModelId: '20',
        name: 'Basic (and reversed card)',
      },
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
    });
    expect(exportBody.notes[0]?.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ankiCardId: '10' }),
        expect.objectContaining({ ankiCardId: '11' }),
      ]),
    );
    expect(exportBody.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          importId: createdImport.importId,
          ankiCardId: '10',
          ordinal: 0,
          cardType: 0,
          queue: 0,
        }),
        expect.objectContaining({
          importId: createdImport.importId,
          ankiCardId: '11',
          ordinal: 1,
          cardType: 2,
          queue: 2,
          dueDate: 42,
          interval: 7,
          easeFactor: 2500,
          repetitions: 3,
          lapses: 1,
        }),
      ]),
    );
    expect(
      exportBody.cards.find(card => card.ankiCardId === '10'),
    ).toMatchObject({
      note: {
        ankiNoteId: '1',
      },
    });
    expect(exportBody.media).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          importId: createdImport.importId,
          originalName: 'front.png',
          type: 'IMAGE',
        }),
        expect.objectContaining({
          importId: createdImport.importId,
          originalName: 'audio.mp3',
          type: 'AUDIO',
        }),
      ]),
    );

    const processingImport = await prisma.import.create({
      data: {
        originalName: 'processing.apkg',
        fileSize: 1,
        status: 'PROCESSING',
      },
    });
    const failedImport = await prisma.import.create({
      data: {
        originalName: 'failed.apkg',
        fileSize: 1,
        status: 'FAILED',
        failureReason: 'The Anki collection has invalid JSON in col.decks.',
      },
    });

    const processingExportResponse = await request(server)
      .get(`/api/v1/imports/${processingImport.id}/export`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409);

    expect(processingExportResponse.body).toMatchObject({
      statusCode: 409,
      message:
        'Import export is only available for COMPLETED imports. Current status: PROCESSING.',
      error: 'Conflict',
      path: `/api/v1/imports/${processingImport.id}/export`,
      method: 'GET',
    });

    const failedExportResponse = await request(server)
      .get(`/api/v1/imports/${failedImport.id}/export`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(409);

    expect(failedExportResponse.body).toMatchObject({
      statusCode: 409,
      message:
        'Import export is only available for COMPLETED imports. Current status: FAILED. Failure reason: The Anki collection has invalid JSON in col.decks.',
      error: 'Conflict',
      path: `/api/v1/imports/${failedImport.id}/export`,
      method: 'GET',
    });
  });

  it('returns the standardized 404 payload when an import does not exist', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const missingImportId = 'missing-import';
    const missingNoteId = 'missing-note';
    const missingCardId = 'missing-card';
    const missingMediaId = 'missing-media';

    const detailResponse = await request(server)
      .get(`/api/v1/imports/${missingImportId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(detailResponse.body).toMatchObject({
      statusCode: 404,
      message: 'Import not found.',
      error: 'Not Found',
      path: `/api/v1/imports/${missingImportId}`,
      method: 'GET',
    });

    const decksResponse = await request(server)
      .get(`/api/v1/imports/${missingImportId}/decks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(decksResponse.body).toMatchObject({
      statusCode: 404,
      message: 'Import not found.',
      error: 'Not Found',
      path: `/api/v1/imports/${missingImportId}/decks`,
      method: 'GET',
    });

    const notesResponse = await request(server)
      .get(`/api/v1/imports/${missingImportId}/notes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(notesResponse.body).toMatchObject({
      statusCode: 404,
      message: 'Import not found.',
      error: 'Not Found',
      path: `/api/v1/imports/${missingImportId}/notes`,
      method: 'GET',
    });

    const cardsResponse = await request(server)
      .get(`/api/v1/imports/${missingImportId}/cards`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(cardsResponse.body).toMatchObject({
      statusCode: 404,
      message: 'Import not found.',
      error: 'Not Found',
      path: `/api/v1/imports/${missingImportId}/cards`,
      method: 'GET',
    });

    const mediaResponse = await request(server)
      .get(`/api/v1/imports/${missingImportId}/media`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(mediaResponse.body).toMatchObject({
      statusCode: 404,
      message: 'Import not found.',
      error: 'Not Found',
      path: `/api/v1/imports/${missingImportId}/media`,
      method: 'GET',
    });

    const exportResponse = await request(server)
      .get(`/api/v1/imports/${missingImportId}/export`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(exportResponse.body).toMatchObject({
      statusCode: 404,
      message: 'Import not found.',
      error: 'Not Found',
      path: `/api/v1/imports/${missingImportId}/export`,
      method: 'GET',
    });

    const deleteResponse = await request(server)
      .delete(`/api/v1/imports/${missingImportId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(deleteResponse.body).toMatchObject({
      statusCode: 404,
      message: 'Import not found.',
      error: 'Not Found',
      path: `/api/v1/imports/${missingImportId}`,
      method: 'DELETE',
    });

    const noteDetailResponse = await request(server)
      .get(`/api/v1/notes/${missingNoteId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(noteDetailResponse.body).toMatchObject({
      statusCode: 404,
      message: 'Note not found.',
      error: 'Not Found',
      path: `/api/v1/notes/${missingNoteId}`,
      method: 'GET',
    });

    const cardDetailResponse = await request(server)
      .get(`/api/v1/cards/${missingCardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(cardDetailResponse.body).toMatchObject({
      statusCode: 404,
      message: 'Card not found.',
      error: 'Not Found',
      path: `/api/v1/cards/${missingCardId}`,
      method: 'GET',
    });

    const mediaInfoResponse = await request(server)
      .get(`/api/v1/media/${missingMediaId}/info`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(mediaInfoResponse.body).toMatchObject({
      statusCode: 404,
      message: 'Media not found.',
      error: 'Not Found',
      path: `/api/v1/media/${missingMediaId}/info`,
      method: 'GET',
    });
  });

  it('returns 404 for a removed media binary without exposing filesystem paths', async () => {
    const fileContents = await createApkgBuffer();
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const createResponse = await request(server)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', fileContents, 'english.apkg')
      .expect(201);

    const createdImport = createResponse.body as {
      importId: string;
    };

    const mediaResponse = await request(server)
      .get(
        `/api/v1/imports/${createdImport.importId}/media?type=IMAGE&page=1&limit=10`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const mediaListBody = mediaResponse.body as unknown as {
      items: Array<{ mediaId: string }>;
    };
    const mediaId = mediaListBody.items[0].mediaId;
    const storedMediaPath = join(
      process.env.MEDIA_STORAGE_DIR!,
      createdImport.importId,
      '0-front.png',
    );

    rmSync(storedMediaPath, { force: true });

    const missingMediaResponse = await request(server)
      .get(`/api/v1/media/${mediaId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(missingMediaResponse.body).toMatchObject({
      statusCode: 404,
      message: 'Media file not found.',
      error: 'Not Found',
      path: `/api/v1/media/${mediaId}`,
      method: 'GET',
    });
    expect(JSON.stringify(missingMediaResponse.body)).not.toContain(
      process.env.MEDIA_STORAGE_DIR!,
    );
    expect(JSON.stringify(missingMediaResponse.body)).not.toContain(
      storedMediaPath,
    );
  });

  it('skips media mapped in the media file when the binary is missing from the package', async () => {
    const fileContents = await createApkgBuffer({
      omitMediaFileIndexes: ['1'],
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(server)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', fileContents, 'missing-media-file.apkg')
      .expect(201);

    const body = response.body as {
      importId: string;
      originalName: string;
      status: string;
    };

    expect(body.originalName).toBe('missing-media-file.apkg');
    expect(body.status).toBe('PROCESSING');

    const createdImport = await prisma.import.findUnique({
      where: { id: body.importId },
    });
    const persistedMediaFiles = await prisma.mediaFile.findMany({
      where: { importId: body.importId },
      orderBy: { ankiIndex: 'asc' },
    });

    expect(createdImport).toMatchObject({
      id: body.importId,
      originalName: 'missing-media-file.apkg',
      status: 'COMPLETED',
      mediaCount: 1,
    });
    expect(persistedMediaFiles).toEqual([
      expect.objectContaining({
        importId: body.importId,
        ankiIndex: '0',
        originalName: 'front.png',
        mimeType: 'image/png',
        sizeKb: 1,
        storageUrl: `${body.importId}/0-front.png`,
        type: 'IMAGE',
      }),
    ]);
    expect(
      existsSync(
        join(process.env.MEDIA_STORAGE_DIR!, body.importId, '0-front.png'),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(process.env.MEDIA_STORAGE_DIR!, body.importId, '1-audio.mp3'),
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
    await expect(prisma.noteModel.count()).resolves.toBe(0);
    await expect(prisma.note.count()).resolves.toBe(0);
    await expect(prisma.card.count()).resolves.toBe(0);
    await expect(prisma.mediaFile.count()).resolves.toBe(0);
  });

  it('marks the import as failed without persisting metadata when col.decks JSON is invalid', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const fileContents = await createApkgBuffer({ invalidDecksJson: true });

    const response = await request(server)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', fileContents, 'invalid-decks.apkg')
      .expect(422);

    expect((response.body as { message: string }).message).toBe(
      'The Anki collection has invalid JSON in col.decks.',
    );

    const failedImport = await prisma.import.findFirst({
      where: { originalName: 'invalid-decks.apkg' },
      orderBy: { createdAt: 'desc' },
    });

    expect(failedImport).toMatchObject({
      originalName: 'invalid-decks.apkg',
      status: 'FAILED',
      failureReason: 'The Anki collection has invalid JSON in col.decks.',
    });
    expect(
      existsSync(join(process.env.IMPORTS_TEMP_DIR!, failedImport!.id)),
    ).toBe(false);

    await expect(
      prisma.deck.count({ where: { importId: failedImport!.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.noteModel.count({ where: { importId: failedImport!.id } }),
    ).resolves.toBe(0);
  });

  it('marks the import as failed when a note references a missing note model', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const fileContents = await createApkgBuffer({
      missingNoteModelReference: true,
    });

    const response = await request(server)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', fileContents, 'missing-note-model.apkg')
      .expect(422);

    expect((response.body as { message: string }).message).toBe(
      'The Anki note 1 references missing note model 999.',
    );

    const failedImport = await prisma.import.findFirst({
      where: { originalName: 'missing-note-model.apkg' },
      orderBy: { createdAt: 'desc' },
    });

    expect(failedImport).toMatchObject({
      originalName: 'missing-note-model.apkg',
      status: 'FAILED',
      failureReason: 'The Anki note 1 references missing note model 999.',
    });
    expect(
      existsSync(join(process.env.IMPORTS_TEMP_DIR!, failedImport!.id)),
    ).toBe(false);

    await expect(prisma.note.count()).resolves.toBe(0);
    await expect(
      prisma.noteModel.count({ where: { importId: failedImport!.id } }),
    ).resolves.toBe(0);
  });

  it('marks the import as failed when a card references a missing deck', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const fileContents = await createApkgBuffer({
      missingCardDeckReference: true,
    });

    const response = await request(server)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', fileContents, 'missing-card-deck.apkg')
      .expect(422);

    expect((response.body as { message: string }).message).toBe(
      'The Anki card 11 references missing deck 999.',
    );

    const failedImport = await prisma.import.findFirst({
      where: { originalName: 'missing-card-deck.apkg' },
      orderBy: { createdAt: 'desc' },
    });

    expect(failedImport).toMatchObject({
      originalName: 'missing-card-deck.apkg',
      status: 'FAILED',
      failureReason: 'The Anki card 11 references missing deck 999.',
    });
    expect(
      existsSync(join(process.env.IMPORTS_TEMP_DIR!, failedImport!.id)),
    ).toBe(false);

    await expect(prisma.deck.count()).resolves.toBe(0);
    await expect(prisma.noteModel.count()).resolves.toBe(0);
    await expect(prisma.note.count()).resolves.toBe(0);
    await expect(prisma.card.count()).resolves.toBe(0);
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
    invalidModelsJson?: boolean;
    invalidDecksJson?: boolean;
    missingNoteModelReference?: boolean;
    missingCardDeckReference?: boolean;
    omitMediaFileIndexes?: string[];
  } = {},
): Promise<Buffer> {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'anki-package-fixture-'));

  try {
    const zip = new AdmZip();

    if (options.withCollection !== false) {
      const collectionPath = join(fixtureRoot, 'collection.anki2');
      createSqliteCollection(collectionPath, {
        invalidModelsJson: options.invalidModelsJson,
        invalidDecksJson: options.invalidDecksJson,
        missingNoteModelReference: options.missingNoteModelReference,
        missingCardDeckReference: options.missingCardDeckReference,
      });
      zip.addLocalFile(collectionPath);
    }

    zip.addFile(
      'media',
      Buffer.from(JSON.stringify({ '0': 'front.png', '1': 'audio.mp3' })),
    );
    if (!options.omitMediaFileIndexes?.includes('0')) {
      zip.addFile('0', Buffer.from('image-bytes'));
    }
    if (!options.omitMediaFileIndexes?.includes('1')) {
      zip.addFile('1', Buffer.from('audio-bytes'));
    }

    return zip.toBuffer();
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

function binaryParser(
  response: NodeJS.ReadableStream,
  callback: (error: Error | null, body?: Buffer) => void,
): void {
  const chunks: Buffer[] = [];

  response.on('data', (chunk: Buffer | string) => {
    const bufferChunk =
      typeof chunk === 'string' ? Buffer.from(chunk, 'binary') : chunk;

    chunks.push(bufferChunk);
  });
  response.on('end', () => {
    callback(null, Buffer.concat(chunks));
  });
  response.on('error', (error: Error) => {
    callback(error);
  });
}

function createSqliteCollection(
  collectionPath: string,
  options: {
    invalidModelsJson?: boolean;
    invalidDecksJson?: boolean;
    missingNoteModelReference?: boolean;
    missingCardDeckReference?: boolean;
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

    database
      .prepare(
        `
          INSERT INTO cards (
            id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        11,
        1,
        options.missingCardDeckReference ? 999 : 200,
        1,
        1,
        0,
        2,
        2,
        42,
        7,
        2500,
        3,
        1,
        0,
        0,
        0,
        0,
        '',
      );
  } finally {
    database.close();
  }
}
