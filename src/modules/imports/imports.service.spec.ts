import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    findMany: jest.Mock;
  };
  noteModel: {
    createMany: jest.Mock;
    findMany: jest.Mock;
  };
  note: {
    count: jest.Mock;
    createMany: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
  card: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    createMany: jest.Mock;
    count: jest.Mock;
    groupBy: jest.Mock;
  };
  mediaFile: {
    count: jest.Mock;
    createMany: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
};

describe('ImportsService', () => {
  let service: ImportsService;
  let ankiPackageService: AnkiPackageService;
  let prisma: {
    $transaction: jest.Mock;
    import: {
      create: jest.Mock;
      count: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    deck: {
      count: jest.Mock;
      createMany: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    noteModel: {
      createMany: jest.Mock;
      findMany: jest.Mock;
    };
    note: {
      count: jest.Mock;
      createMany: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    card: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      createMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
    mediaFile: {
      count: jest.Mock;
      createMany: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      import: {
        create: jest.fn(),
        count: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      deck: {
        count: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      noteModel: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
      note: {
        count: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      card: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        createMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      mediaFile: {
        count: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
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

  it('creates a processing import, persists parsed notes and cards, and removes the workspace', async () => {
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
    prisma.deck.findMany.mockResolvedValue([
      {
        id: 'deck-1',
        ankiDeckId: '200',
      },
    ]);
    prisma.noteModel.findMany.mockResolvedValue([
      {
        id: 'note-model-1',
        ankiModelId: '20',
      },
    ]);
    prisma.note.findMany.mockResolvedValue([
      {
        id: 'note-1',
        ankiNoteId: '1',
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
    expect(prisma.card.createMany).toHaveBeenCalledWith({
      data: [
        {
          importId: 'import-1',
          ankiCardId: '10',
          noteId: 'note-1',
          deckId: 'deck-1',
          ordinal: 0,
          cardType: 0,
          queue: 0,
          dueDate: 0,
          interval: 0,
          easeFactor: 0,
          repetitions: 0,
          lapses: 0,
        },
        {
          importId: 'import-1',
          ankiCardId: '11',
          noteId: 'note-1',
          deckId: 'deck-1',
          ordinal: 1,
          cardType: 2,
          queue: 2,
          dueDate: 42,
          interval: 7,
          easeFactor: 2500,
          repetitions: 3,
          lapses: 1,
        },
      ],
    });
    expect(prisma.mediaFile.createMany).toHaveBeenCalledWith({
      data: [
        {
          importId: 'import-1',
          ankiIndex: '0',
          originalName: 'front.png',
          mimeType: 'image/png',
          sizeKb: 1,
          storageUrl: 'import-1/0-front.png',
          type: 'IMAGE',
        },
        {
          importId: 'import-1',
          ankiIndex: '1',
          originalName: 'audio.mp3',
          mimeType: 'audio/mpeg',
          sizeKb: 1,
          storageUrl: 'import-1/1-audio.mp3',
          type: 'AUDIO',
        },
      ],
    });
    expect(prisma.import.update).toHaveBeenCalledWith({
      where: { id: 'import-1' },
      data: {
        status: 'COMPLETED',
        failureReason: null,
        decksCount: 1,
        notesCount: 1,
        cardsCount: 2,
        mediaCount: 2,
      },
    });

    expect(existsSync(join(config.storage.importsTempDir, 'import-1'))).toBe(
      false,
    );
    expect(
      existsSync(join(config.storage.mediaDir, 'import-1', 'source.apkg')),
    ).toBe(false);
    expect(
      existsSync(join(config.storage.mediaDir, 'import-1', '0-front.png')),
    ).toBe(true);
    expect(
      existsSync(join(config.storage.mediaDir, 'import-1', '1-audio.mp3')),
    ).toBe(true);
  });

  it('skips mapped media files that are missing from the package without failing the import', async () => {
    await mkdir(config.storage.importsIncomingDir, { recursive: true });

    const stagedFilePath = join(
      config.storage.importsIncomingDir,
      'missing-media-file.upload',
    );

    await writeApkgArchive(stagedFilePath, {
      omitMediaFileIndexes: ['1'],
    });

    prisma.import.create.mockResolvedValue({
      id: 'import-8',
      originalName: 'missing-media-file.apkg',
      status: 'PROCESSING',
    });
    prisma.deck.findMany.mockResolvedValue([
      {
        id: 'deck-1',
        ankiDeckId: '200',
      },
    ]);
    prisma.noteModel.findMany.mockResolvedValue([
      {
        id: 'note-model-1',
        ankiModelId: '20',
      },
    ]);
    prisma.note.findMany.mockResolvedValue([
      {
        id: 'note-1',
        ankiNoteId: '1',
      },
    ]);

    await expect(
      service.create({
        originalName: 'missing-media-file.apkg',
        size: 512,
        temporaryFilePath: stagedFilePath,
      }),
    ).resolves.toEqual({
      importId: 'import-8',
      originalName: 'missing-media-file.apkg',
      status: 'PROCESSING',
    });

    expect(prisma.mediaFile.createMany).toHaveBeenCalledWith({
      data: [
        {
          importId: 'import-8',
          ankiIndex: '0',
          originalName: 'front.png',
          mimeType: 'image/png',
          sizeKb: 1,
          storageUrl: 'import-8/0-front.png',
          type: 'IMAGE',
        },
      ],
    });
    expect(prisma.import.update).toHaveBeenCalledWith({
      where: { id: 'import-8' },
      data: {
        status: 'COMPLETED',
        failureReason: null,
        decksCount: 1,
        notesCount: 1,
        cardsCount: 2,
        mediaCount: 1,
      },
    });
    expect(
      existsSync(join(config.storage.mediaDir, 'import-8', '0-front.png')),
    ).toBe(true);
    expect(
      existsSync(join(config.storage.mediaDir, 'import-8', '1-audio.mp3')),
    ).toBe(false);
    expect(existsSync(join(config.storage.importsTempDir, 'import-8'))).toBe(
      false,
    );
  });

  it('marks unexpected processing failures as failed and removes partial artifacts', async () => {
    await mkdir(config.storage.importsIncomingDir, { recursive: true });

    const stagedFilePath = join(
      config.storage.importsIncomingDir,
      'unexpected-failure.upload',
    );

    await writeApkgArchive(stagedFilePath);

    prisma.import.create.mockResolvedValue({
      id: 'import-unexpected',
      originalName: 'unexpected-failure.apkg',
      status: 'PROCESSING',
    });
    prisma.import.update.mockResolvedValue({
      id: 'import-unexpected',
      originalName: 'unexpected-failure.apkg',
      status: 'FAILED',
      failureReason: 'The import failed due to an unexpected internal error.',
    });
    prisma.$transaction.mockRejectedValueOnce(new Error('database offline'));

    await expect(
      service.create({
        originalName: 'unexpected-failure.apkg',
        size: 512,
        temporaryFilePath: stagedFilePath,
      }),
    ).rejects.toThrow('Failed to process the uploaded .apkg file.');

    expect(prisma.import.update).toHaveBeenCalledWith({
      where: { id: 'import-unexpected' },
      data: {
        status: 'FAILED',
        failureReason: 'The import failed due to an unexpected internal error.',
      },
    });
    expect(prisma.import.delete).not.toHaveBeenCalled();
    expect(
      existsSync(join(config.storage.importsTempDir, 'import-unexpected')),
    ).toBe(false);
    expect(existsSync(join(config.storage.mediaDir, 'import-unexpected'))).toBe(
      false,
    );
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

  it('marks the import as failed when a card references a missing note', async () => {
    await mkdir(config.storage.importsIncomingDir, { recursive: true });

    const stagedFilePath = join(
      config.storage.importsIncomingDir,
      'missing-card-note.upload',
    );

    await writeApkgArchive(stagedFilePath, {
      missingCardNoteReference: true,
    });

    prisma.import.create.mockResolvedValue({
      id: 'import-6',
      originalName: 'missing-card-note.apkg',
      status: 'PROCESSING',
    });
    prisma.deck.findMany.mockResolvedValue([
      {
        id: 'deck-1',
        ankiDeckId: '200',
      },
    ]);
    prisma.noteModel.findMany.mockResolvedValue([
      {
        id: 'note-model-1',
        ankiModelId: '20',
      },
    ]);
    prisma.note.findMany.mockResolvedValue([
      {
        id: 'note-1',
        ankiNoteId: '1',
      },
    ]);
    prisma.import.update.mockResolvedValue({
      id: 'import-6',
      originalName: 'missing-card-note.apkg',
      status: 'FAILED',
      failureReason: 'The Anki card 11 references missing note 999.',
    });

    await expect(
      service.create({
        originalName: 'missing-card-note.apkg',
        size: 256,
        temporaryFilePath: stagedFilePath,
      }),
    ).rejects.toThrow('The Anki card 11 references missing note 999.');

    expect(prisma.card.createMany).not.toHaveBeenCalled();
    expect(prisma.import.update).toHaveBeenCalledWith({
      where: { id: 'import-6' },
      data: {
        status: 'FAILED',
        failureReason: 'The Anki card 11 references missing note 999.',
      },
    });
    expect(existsSync(join(config.storage.importsTempDir, 'import-6'))).toBe(
      false,
    );
  });

  it('marks the import as failed when a card references a missing deck', async () => {
    await mkdir(config.storage.importsIncomingDir, { recursive: true });

    const stagedFilePath = join(
      config.storage.importsIncomingDir,
      'missing-card-deck.upload',
    );

    await writeApkgArchive(stagedFilePath, {
      missingCardDeckReference: true,
    });

    prisma.import.create.mockResolvedValue({
      id: 'import-7',
      originalName: 'missing-card-deck.apkg',
      status: 'PROCESSING',
    });
    prisma.deck.findMany.mockResolvedValue([
      {
        id: 'deck-1',
        ankiDeckId: '200',
      },
    ]);
    prisma.noteModel.findMany.mockResolvedValue([
      {
        id: 'note-model-1',
        ankiModelId: '20',
      },
    ]);
    prisma.note.findMany.mockResolvedValue([
      {
        id: 'note-1',
        ankiNoteId: '1',
      },
    ]);
    prisma.import.update.mockResolvedValue({
      id: 'import-7',
      originalName: 'missing-card-deck.apkg',
      status: 'FAILED',
      failureReason: 'The Anki card 11 references missing deck 999.',
    });

    await expect(
      service.create({
        originalName: 'missing-card-deck.apkg',
        size: 256,
        temporaryFilePath: stagedFilePath,
      }),
    ).rejects.toThrow('The Anki card 11 references missing deck 999.');

    expect(prisma.card.createMany).not.toHaveBeenCalled();
    expect(prisma.import.update).toHaveBeenCalledWith({
      where: { id: 'import-7' },
      data: {
        status: 'FAILED',
        failureReason: 'The Anki card 11 references missing deck 999.',
      },
    });
    expect(existsSync(join(config.storage.importsTempDir, 'import-7'))).toBe(
      false,
    );
  });

  it('lists imports with audit metadata and pagination', async () => {
    const createdAt = new Date('2026-03-16T12:00:00.000Z');
    const updatedAt = new Date('2026-03-16T12:05:00.000Z');

    prisma.import.findMany.mockResolvedValue([
      {
        id: 'import-1',
        originalName: 'english.apkg',
        fileSize: 1024,
        status: 'COMPLETED',
        failureReason: null,
        decksCount: 1,
        notesCount: 1,
        cardsCount: 2,
        mediaCount: 2,
        createdAt,
        updatedAt,
      },
    ]);
    prisma.import.count.mockResolvedValue(1);

    await expect(service.findAll({ page: 2, limit: 1 })).resolves.toEqual({
      items: [
        {
          importId: 'import-1',
          originalName: 'english.apkg',
          fileSize: 1024,
          status: 'COMPLETED',
          failureReason: null,
          decksCount: 1,
          notesCount: 1,
          cardsCount: 2,
          mediaCount: 2,
          createdAt,
          updatedAt,
        },
      ],
      page: 2,
      limit: 1,
      totalItems: 1,
      totalPages: 1,
    });

    expect(prisma.import.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 1,
      take: 1,
    });
    expect(prisma.import.count).toHaveBeenCalledWith();
  });

  it('returns import details and fails for a missing import', async () => {
    const createdAt = new Date('2026-03-16T12:00:00.000Z');
    const updatedAt = new Date('2026-03-16T12:05:00.000Z');

    prisma.import.findUnique.mockResolvedValueOnce({
      id: 'import-1',
      originalName: 'english.apkg',
      fileSize: 1024,
      status: 'COMPLETED',
      failureReason: null,
      decksCount: 1,
      notesCount: 1,
      cardsCount: 2,
      mediaCount: 2,
      createdAt,
      updatedAt,
    });

    await expect(service.findOne('import-1')).resolves.toEqual({
      importId: 'import-1',
      originalName: 'english.apkg',
      fileSize: 1024,
      status: 'COMPLETED',
      failureReason: null,
      decksCount: 1,
      notesCount: 1,
      cardsCount: 2,
      mediaCount: 2,
      createdAt,
      updatedAt,
    });

    prisma.import.findUnique.mockResolvedValueOnce(null);

    await expect(service.findOne('missing-import')).rejects.toThrow(
      'Import not found.',
    );
  });

  it('exports a completed import as structured JSON and blocks unfinished imports', async () => {
    const createdAt = new Date('2026-03-16T12:00:00.000Z');
    const updatedAt = new Date('2026-03-16T12:05:00.000Z');
    const deckId = 'deck-1';
    const noteId = 'note-1';

    prisma.import.findUnique
      .mockResolvedValueOnce({
        id: 'import-1',
        originalName: 'english.apkg',
        fileSize: 1024,
        status: 'COMPLETED',
        failureReason: null,
        decksCount: 1,
        notesCount: 1,
        cardsCount: 2,
        mediaCount: 2,
        createdAt,
        updatedAt,
      })
      .mockResolvedValueOnce({
        id: 'import-processing',
        originalName: 'processing.apkg',
        fileSize: 256,
        status: 'PROCESSING',
        failureReason: null,
        decksCount: 0,
        notesCount: 0,
        cardsCount: 0,
        mediaCount: 0,
        createdAt,
        updatedAt,
      })
      .mockResolvedValueOnce({
        id: 'import-failed',
        originalName: 'failed.apkg',
        fileSize: 256,
        status: 'FAILED',
        failureReason: 'The Anki collection has invalid JSON in col.decks.',
        decksCount: 0,
        notesCount: 0,
        cardsCount: 0,
        mediaCount: 0,
        createdAt,
        updatedAt,
      });
    prisma.deck.findMany.mockResolvedValueOnce([
      {
        id: deckId,
        importId: 'import-1',
        ankiDeckId: '200',
        name: 'English::Vocabulary::Advanced',
        description: 'Advanced deck',
        createdAt,
      },
    ]);
    prisma.note.findMany.mockResolvedValueOnce([
      {
        id: noteId,
        importId: 'import-1',
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
        createdAt,
        model: {
          id: 'model-1',
          ankiModelId: '20',
          name: 'Basic (and reversed card)',
        },
        cards: [
          {
            id: 'card-1',
            ankiCardId: '10',
            ordinal: 0,
            cardType: 0,
            queue: 0,
            deck: {
              id: deckId,
              ankiDeckId: '200',
              name: 'English::Vocabulary::Advanced',
            },
          },
          {
            id: 'card-2',
            ankiCardId: '11',
            ordinal: 1,
            cardType: 2,
            queue: 2,
            deck: {
              id: deckId,
              ankiDeckId: '200',
              name: 'English::Vocabulary::Advanced',
            },
          },
        ],
      },
    ]);
    prisma.card.findMany.mockResolvedValueOnce([
      {
        id: 'card-1',
        importId: 'import-1',
        ankiCardId: '10',
        ordinal: 0,
        cardType: 0,
        queue: 0,
        dueDate: 0,
        interval: 0,
        easeFactor: 0,
        repetitions: 0,
        lapses: 0,
        createdAt,
        deck: {
          id: deckId,
          ankiDeckId: '200',
          name: 'English::Vocabulary::Advanced',
        },
        note: {
          id: noteId,
          ankiNoteId: '1',
          tags: ['anki', 'imported'],
          fields: {
            Front: {
              value: 'Front text <img src="front.png">',
              mediaReferences: [{ type: 'IMAGE', reference: 'front.png' }],
            },
          },
          model: {
            id: 'model-1',
            ankiModelId: '20',
            name: 'Basic (and reversed card)',
          },
        },
      },
      {
        id: 'card-2',
        importId: 'import-1',
        ankiCardId: '11',
        ordinal: 1,
        cardType: 2,
        queue: 2,
        dueDate: 42,
        interval: 7,
        easeFactor: 2500,
        repetitions: 3,
        lapses: 1,
        createdAt,
        deck: {
          id: deckId,
          ankiDeckId: '200',
          name: 'English::Vocabulary::Advanced',
        },
        note: {
          id: noteId,
          ankiNoteId: '1',
          tags: ['anki', 'imported'],
          fields: {
            Front: {
              value: 'Front text <img src="front.png">',
              mediaReferences: [{ type: 'IMAGE', reference: 'front.png' }],
            },
          },
          model: {
            id: 'model-1',
            ankiModelId: '20',
            name: 'Basic (and reversed card)',
          },
        },
      },
    ]);
    prisma.mediaFile.findMany.mockResolvedValueOnce([
      {
        id: 'media-1',
        importId: 'import-1',
        ankiIndex: '0',
        originalName: 'front.png',
        mimeType: 'image/png',
        sizeKb: 1,
        storageUrl: 'import-1/0-front.png',
        type: 'IMAGE',
        createdAt,
      },
      {
        id: 'media-2',
        importId: 'import-1',
        ankiIndex: '1',
        originalName: 'audio.mp3',
        mimeType: 'audio/mpeg',
        sizeKb: 1,
        storageUrl: 'import-1/1-audio.mp3',
        type: 'AUDIO',
        createdAt,
      },
    ]);

    await expect(service.exportImport('import-1')).resolves.toEqual({
      import: {
        importId: 'import-1',
        originalName: 'english.apkg',
        fileSize: 1024,
        status: 'COMPLETED',
        failureReason: null,
        decksCount: 1,
        notesCount: 1,
        cardsCount: 2,
        mediaCount: 2,
        createdAt,
        updatedAt,
      },
      decks: [
        {
          deckId,
          importId: 'import-1',
          ankiDeckId: '200',
          name: 'English::Vocabulary::Advanced',
          description: 'Advanced deck',
          notesCount: 1,
          cardsCount: 2,
          createdAt,
        },
      ],
      notes: [
        {
          noteId,
          importId: 'import-1',
          ankiNoteId: '1',
          model: {
            modelId: 'model-1',
            ankiModelId: '20',
            name: 'Basic (and reversed card)',
          },
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
          cards: [
            {
              cardId: 'card-1',
              ankiCardId: '10',
              ordinal: 0,
              cardType: 0,
              queue: 0,
              deck: {
                deckId,
                ankiDeckId: '200',
                name: 'English::Vocabulary::Advanced',
              },
            },
            {
              cardId: 'card-2',
              ankiCardId: '11',
              ordinal: 1,
              cardType: 2,
              queue: 2,
              deck: {
                deckId,
                ankiDeckId: '200',
                name: 'English::Vocabulary::Advanced',
              },
            },
          ],
          createdAt,
        },
      ],
      cards: [
        {
          cardId: 'card-1',
          importId: 'import-1',
          ankiCardId: '10',
          ordinal: 0,
          cardType: 0,
          queue: 0,
          dueDate: 0,
          interval: 0,
          easeFactor: 0,
          repetitions: 0,
          lapses: 0,
          deck: {
            deckId,
            ankiDeckId: '200',
            name: 'English::Vocabulary::Advanced',
          },
          note: {
            noteId,
            ankiNoteId: '1',
            model: {
              modelId: 'model-1',
              ankiModelId: '20',
              name: 'Basic (and reversed card)',
            },
            tags: ['anki', 'imported'],
            fieldPreviews: [
              {
                name: 'Front',
                valuePreview: 'Front text <img src="front.png">',
                mediaReferencesCount: 1,
              },
            ],
          },
          createdAt,
        },
        {
          cardId: 'card-2',
          importId: 'import-1',
          ankiCardId: '11',
          ordinal: 1,
          cardType: 2,
          queue: 2,
          dueDate: 42,
          interval: 7,
          easeFactor: 2500,
          repetitions: 3,
          lapses: 1,
          deck: {
            deckId,
            ankiDeckId: '200',
            name: 'English::Vocabulary::Advanced',
          },
          note: {
            noteId,
            ankiNoteId: '1',
            model: {
              modelId: 'model-1',
              ankiModelId: '20',
              name: 'Basic (and reversed card)',
            },
            tags: ['anki', 'imported'],
            fieldPreviews: [
              {
                name: 'Front',
                valuePreview: 'Front text <img src="front.png">',
                mediaReferencesCount: 1,
              },
            ],
          },
          createdAt,
        },
      ],
      media: [
        {
          mediaId: 'media-1',
          importId: 'import-1',
          ankiIndex: '0',
          originalName: 'front.png',
          mimeType: 'image/png',
          sizeKb: 1,
          type: 'IMAGE',
          downloadUrl: '/api/v1/media/media-1',
          infoUrl: '/api/v1/media/media-1/info',
          createdAt,
        },
        {
          mediaId: 'media-2',
          importId: 'import-1',
          ankiIndex: '1',
          originalName: 'audio.mp3',
          mimeType: 'audio/mpeg',
          sizeKb: 1,
          type: 'AUDIO',
          downloadUrl: '/api/v1/media/media-2',
          infoUrl: '/api/v1/media/media-2/info',
          createdAt,
        },
      ],
    });

    await expect(service.exportImport('import-processing')).rejects.toThrow(
      'Import export is only available for COMPLETED imports. Current status: PROCESSING.',
    );
    await expect(service.exportImport('import-failed')).rejects.toThrow(
      'Import export is only available for COMPLETED imports. Current status: FAILED. Failure reason: The Anki collection has invalid JSON in col.decks.',
    );
  });

  it('lists decks for an import with aggregate counts', async () => {
    const createdAt = new Date('2026-03-16T12:00:00.000Z');

    prisma.import.findUnique.mockResolvedValue({
      id: 'import-1',
    });
    prisma.deck.findMany.mockResolvedValue([
      {
        id: 'deck-1',
        importId: 'import-1',
        ankiDeckId: '200',
        name: 'English::Vocabulary::Advanced',
        description: 'Advanced deck',
        createdAt,
      },
    ]);
    prisma.deck.count.mockResolvedValue(1);
    prisma.card.groupBy
      .mockResolvedValueOnce([
        {
          deckId: 'deck-1',
          _count: { _all: 2 },
        },
      ])
      .mockResolvedValueOnce([
        {
          deckId: 'deck-1',
          noteId: 'note-1',
        },
      ]);

    await expect(
      service.findImportDecks('import-1', { page: 1, limit: 20 }),
    ).resolves.toEqual({
      items: [
        {
          deckId: 'deck-1',
          importId: 'import-1',
          ankiDeckId: '200',
          name: 'English::Vocabulary::Advanced',
          description: 'Advanced deck',
          notesCount: 1,
          cardsCount: 2,
          createdAt,
        },
      ],
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    });

    expect(prisma.deck.findMany).toHaveBeenCalledWith({
      where: { importId: 'import-1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 20,
    });
    expect(prisma.deck.count).toHaveBeenCalledWith({
      where: { importId: 'import-1' },
    });
  });

  it('returns deck details and fails for a missing deck', async () => {
    const createdAt = new Date('2026-03-16T12:00:00.000Z');

    prisma.deck.findUnique.mockResolvedValueOnce({
      id: 'deck-1',
      importId: 'import-1',
      ankiDeckId: '200',
      name: 'English::Vocabulary::Advanced',
      description: 'Advanced deck',
      createdAt,
    });
    prisma.card.count.mockResolvedValueOnce(2);
    prisma.card.groupBy.mockResolvedValueOnce([{ noteId: 'note-1' }]);

    await expect(service.findDeck('deck-1')).resolves.toEqual({
      deckId: 'deck-1',
      importId: 'import-1',
      ankiDeckId: '200',
      name: 'English::Vocabulary::Advanced',
      description: 'Advanced deck',
      notesCount: 1,
      cardsCount: 2,
      createdAt,
    });

    prisma.deck.findUnique.mockResolvedValueOnce(null);

    await expect(service.findDeck('missing-deck')).rejects.toThrow(
      'Deck not found.',
    );
  });

  it('lists notes with deck and tag filters and returns note details', async () => {
    const createdAt = new Date('2026-03-16T12:00:00.000Z');
    const deckId = '49768756-6369-4f37-a4dc-c427f2c91381';

    prisma.import.findUnique.mockResolvedValueOnce({
      id: 'import-1',
    });
    prisma.note.findMany.mockResolvedValueOnce([
      {
        id: 'note-1',
        importId: 'import-1',
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
        },
        createdAt,
        model: {
          id: 'model-1',
          ankiModelId: '20',
          name: 'Basic (and reversed card)',
        },
        _count: {
          cards: 2,
        },
      },
    ]);
    prisma.note.count.mockResolvedValueOnce(1);

    await expect(
      service.findImportNotes('import-1', {
        page: 1,
        limit: 20,
        deckId,
        tags: 'anki,imported',
      }),
    ).resolves.toEqual({
      items: [
        {
          noteId: 'note-1',
          importId: 'import-1',
          ankiNoteId: '1',
          model: {
            modelId: 'model-1',
            ankiModelId: '20',
            name: 'Basic (and reversed card)',
          },
          tags: ['anki', 'imported'],
          fieldPreviews: [
            {
              name: 'Front',
              valuePreview: 'Front text <img src="front.png">',
              mediaReferencesCount: 1,
            },
            {
              name: 'Back',
              valuePreview: 'Back text with <b>HTML</b>',
              mediaReferencesCount: 0,
            },
          ],
          cardsCount: 2,
          createdAt,
        },
      ],
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    });

    expect(prisma.note.findMany).toHaveBeenCalledWith({
      where: {
        importId: 'import-1',
        cards: {
          some: {
            deckId,
          },
        },
        tags: {
          hasEvery: ['anki', 'imported'],
        },
      },
      orderBy: [{ ankiNoteId: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 20,
      include: {
        model: {
          select: {
            id: true,
            ankiModelId: true,
            name: true,
          },
        },
        _count: {
          select: {
            cards: true,
          },
        },
      },
    });

    prisma.note.findUnique.mockResolvedValueOnce({
      id: 'note-1',
      importId: 'import-1',
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
      },
      createdAt,
      model: {
        id: 'model-1',
        ankiModelId: '20',
        name: 'Basic (and reversed card)',
      },
      cards: [
        {
          id: 'card-1',
          ankiCardId: '10',
          ordinal: 0,
          cardType: 0,
          queue: 0,
          deck: {
            id: deckId,
            ankiDeckId: '200',
            name: 'English::Vocabulary::Advanced',
          },
        },
      ],
    });

    await expect(service.findNote('note-1')).resolves.toEqual({
      noteId: 'note-1',
      importId: 'import-1',
      ankiNoteId: '1',
      model: {
        modelId: 'model-1',
        ankiModelId: '20',
        name: 'Basic (and reversed card)',
      },
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
      },
      cards: [
        {
          cardId: 'card-1',
          ankiCardId: '10',
          ordinal: 0,
          cardType: 0,
          queue: 0,
          deck: {
            deckId,
            ankiDeckId: '200',
            name: 'English::Vocabulary::Advanced',
          },
        },
      ],
      createdAt,
    });

    prisma.note.findUnique.mockResolvedValueOnce(null);

    await expect(service.findNote('missing-note')).rejects.toThrow(
      'Note not found.',
    );
  });

  it('lists cards with deck and tag filters and returns card details', async () => {
    const createdAt = new Date('2026-03-16T12:00:00.000Z');
    const deckId = '49768756-6369-4f37-a4dc-c427f2c91381';

    prisma.import.findUnique.mockResolvedValueOnce({
      id: 'import-1',
    });
    prisma.card.findMany.mockResolvedValueOnce([
      {
        id: 'card-1',
        importId: 'import-1',
        ankiCardId: '10',
        ordinal: 0,
        cardType: 0,
        queue: 0,
        dueDate: 0,
        interval: 0,
        easeFactor: 0,
        repetitions: 0,
        lapses: 0,
        createdAt,
        deck: {
          id: deckId,
          ankiDeckId: '200',
          name: 'English::Vocabulary::Advanced',
        },
        note: {
          id: 'note-1',
          ankiNoteId: '1',
          tags: ['anki', 'imported'],
          fields: {
            Front: {
              value: 'Front text <img src="front.png">',
              mediaReferences: [{ type: 'IMAGE', reference: 'front.png' }],
            },
          },
          model: {
            id: 'model-1',
            ankiModelId: '20',
            name: 'Basic (and reversed card)',
          },
        },
      },
    ]);
    prisma.card.count.mockResolvedValueOnce(1);

    await expect(
      service.findImportCards('import-1', {
        page: 1,
        limit: 20,
        deckId,
        tags: 'anki,imported',
      }),
    ).resolves.toEqual({
      items: [
        {
          cardId: 'card-1',
          importId: 'import-1',
          ankiCardId: '10',
          ordinal: 0,
          cardType: 0,
          queue: 0,
          dueDate: 0,
          interval: 0,
          easeFactor: 0,
          repetitions: 0,
          lapses: 0,
          deck: {
            deckId,
            ankiDeckId: '200',
            name: 'English::Vocabulary::Advanced',
          },
          note: {
            noteId: 'note-1',
            ankiNoteId: '1',
            model: {
              modelId: 'model-1',
              ankiModelId: '20',
              name: 'Basic (and reversed card)',
            },
            tags: ['anki', 'imported'],
            fieldPreviews: [
              {
                name: 'Front',
                valuePreview: 'Front text <img src="front.png">',
                mediaReferencesCount: 1,
              },
            ],
          },
          createdAt,
        },
      ],
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    });

    expect(prisma.card.findMany).toHaveBeenCalledWith({
      where: {
        importId: 'import-1',
        deckId,
        note: {
          tags: {
            hasEvery: ['anki', 'imported'],
          },
        },
      },
      orderBy: [{ ordinal: 'asc' }, { ankiCardId: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 20,
      include: {
        deck: {
          select: {
            id: true,
            ankiDeckId: true,
            name: true,
          },
        },
        note: {
          select: {
            id: true,
            ankiNoteId: true,
            tags: true,
            fields: true,
            model: {
              select: {
                id: true,
                ankiModelId: true,
                name: true,
              },
            },
          },
        },
      },
    });

    prisma.card.findUnique.mockResolvedValueOnce({
      id: 'card-1',
      importId: 'import-1',
      ankiCardId: '10',
      ordinal: 0,
      cardType: 0,
      queue: 0,
      dueDate: 0,
      interval: 0,
      easeFactor: 0,
      repetitions: 0,
      lapses: 0,
      createdAt,
      deck: {
        id: deckId,
        ankiDeckId: '200',
        name: 'English::Vocabulary::Advanced',
      },
      note: {
        id: 'note-1',
        ankiNoteId: '1',
        tags: ['anki', 'imported'],
        fields: {
          Front: {
            value: 'Front text <img src="front.png">',
            mediaReferences: [{ type: 'IMAGE', reference: 'front.png' }],
          },
        },
        model: {
          id: 'model-1',
          ankiModelId: '20',
          name: 'Basic (and reversed card)',
        },
      },
    });

    await expect(service.findCard('card-1')).resolves.toEqual({
      cardId: 'card-1',
      importId: 'import-1',
      ankiCardId: '10',
      ordinal: 0,
      cardType: 0,
      queue: 0,
      dueDate: 0,
      interval: 0,
      easeFactor: 0,
      repetitions: 0,
      lapses: 0,
      deck: {
        deckId,
        ankiDeckId: '200',
        name: 'English::Vocabulary::Advanced',
      },
      note: {
        noteId: 'note-1',
        ankiNoteId: '1',
        model: {
          modelId: 'model-1',
          ankiModelId: '20',
          name: 'Basic (and reversed card)',
        },
        tags: ['anki', 'imported'],
        fields: {
          Front: {
            value: 'Front text <img src="front.png">',
            mediaReferences: [{ type: 'IMAGE', reference: 'front.png' }],
          },
        },
      },
      createdAt,
    });

    prisma.card.findUnique.mockResolvedValueOnce(null);

    await expect(service.findCard('missing-card')).rejects.toThrow(
      'Card not found.',
    );
  });

  it('lists media, returns metadata, and hides missing binary paths', async () => {
    const createdAt = new Date('2026-03-16T12:00:00.000Z');
    const mediaDirectory = join(config.storage.mediaDir, 'import-1');
    const mediaPath = join(mediaDirectory, '0-front.png');

    await mkdir(mediaDirectory, { recursive: true });
    await writeFile(mediaPath, Buffer.from('image-bytes'));

    prisma.import.findUnique.mockResolvedValueOnce({
      id: 'import-1',
    });
    prisma.mediaFile.findMany.mockResolvedValueOnce([
      {
        id: 'media-1',
        importId: 'import-1',
        ankiIndex: '0',
        originalName: 'front.png',
        mimeType: 'image/png',
        sizeKb: 1,
        storageUrl: 'import-1/0-front.png',
        type: 'IMAGE',
        createdAt,
      },
    ]);
    prisma.mediaFile.count.mockResolvedValueOnce(1);

    await expect(
      service.findImportMedia('import-1', {
        page: 1,
        limit: 20,
        type: 'IMAGE',
      }),
    ).resolves.toEqual({
      items: [
        {
          mediaId: 'media-1',
          importId: 'import-1',
          ankiIndex: '0',
          originalName: 'front.png',
          mimeType: 'image/png',
          sizeKb: 1,
          type: 'IMAGE',
          downloadUrl: '/api/v1/media/media-1',
          infoUrl: '/api/v1/media/media-1/info',
          createdAt,
        },
      ],
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    });

    prisma.mediaFile.findUnique.mockResolvedValueOnce({
      id: 'media-1',
      importId: 'import-1',
      ankiIndex: '0',
      originalName: 'front.png',
      mimeType: 'image/png',
      sizeKb: 1,
      storageUrl: 'import-1/0-front.png',
      type: 'IMAGE',
      createdAt,
    });

    await expect(service.findMediaInfo('media-1')).resolves.toEqual({
      mediaId: 'media-1',
      importId: 'import-1',
      ankiIndex: '0',
      originalName: 'front.png',
      mimeType: 'image/png',
      sizeKb: 1,
      type: 'IMAGE',
      downloadUrl: '/api/v1/media/media-1',
      infoUrl: '/api/v1/media/media-1/info',
      fileAvailable: true,
      createdAt,
    });

    prisma.mediaFile.findUnique.mockResolvedValueOnce({
      id: 'media-1',
      importId: 'import-1',
      ankiIndex: '0',
      originalName: 'front.png',
      mimeType: 'image/png',
      sizeKb: 1,
      storageUrl: 'import-1/0-front.png',
      type: 'IMAGE',
      createdAt,
    });

    const streamableFile = await service.readMediaFile('media-1');

    expect(streamableFile.getHeaders()).toMatchObject({
      type: 'image/png',
      disposition: 'inline; filename="front.png"',
      length: 11,
    });

    await rm(mediaPath, { force: true });

    prisma.mediaFile.findUnique.mockResolvedValueOnce({
      id: 'media-1',
      importId: 'import-1',
      ankiIndex: '0',
      originalName: 'front.png',
      mimeType: 'image/png',
      sizeKb: 1,
      storageUrl: 'import-1/0-front.png',
      type: 'IMAGE',
      createdAt,
    });

    await expect(service.readMediaFile('media-1')).rejects.toThrow(
      'Media file not found.',
    );
  });

  it('deletes an import and removes stored artifacts', async () => {
    const workspacePath = join(config.storage.importsTempDir, 'import-9');
    const mediaPath = join(config.storage.mediaDir, 'import-9');

    await mkdir(workspacePath, { recursive: true });
    await mkdir(mediaPath, { recursive: true });
    await writeFile(join(workspacePath, 'source.apkg'), Buffer.from('archive'));
    await writeFile(join(mediaPath, '0-front.png'), Buffer.from('image'));

    prisma.import.findUnique.mockResolvedValue({
      id: 'import-9',
    });
    prisma.import.delete.mockResolvedValue({
      id: 'import-9',
    });

    await expect(service.remove('import-9')).resolves.toBeUndefined();

    expect(prisma.import.delete).toHaveBeenCalledWith({
      where: { id: 'import-9' },
    });
    expect(existsSync(workspacePath)).toBe(false);
    expect(existsSync(mediaPath)).toBe(false);
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
    missingCardNoteReference?: boolean;
    missingCardDeckReference?: boolean;
    omitMediaFileIndexes?: string[];
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
          missingCardNoteReference: options.missingCardNoteReference,
          missingCardDeckReference: options.missingCardDeckReference,
        });
      }

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
    missingCardNoteReference?: boolean;
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
        options.missingCardNoteReference ? 999 : 1,
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
