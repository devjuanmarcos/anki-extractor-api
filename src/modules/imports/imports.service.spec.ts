import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { config } from '../../config/config';
import { PrismaService } from '../../common/services/prisma.service';
import { ImportsService } from './imports.service';

describe('ImportsService', () => {
  let service: ImportsService;
  let prisma: {
    import: {
      create: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      import: {
        create: jest.fn(),
        delete: jest.fn(),
      },
    };

    service = new ImportsService(prisma as unknown as PrismaService);

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

  it('creates a processing import and moves the uploaded archive to its workspace', async () => {
    await mkdir(config.storage.importsIncomingDir, { recursive: true });

    const stagedFilePath = join(
      config.storage.importsIncomingDir,
      'english.upload',
    );
    const payload = Buffer.from('anki-package');

    await writeFile(stagedFilePath, payload);

    prisma.import.create.mockResolvedValue({
      id: 'import-1',
      originalName: 'english.apkg',
      status: 'PROCESSING',
    });

    const result = await service.create({
      originalName: 'english.apkg',
      size: payload.length,
      temporaryFilePath: stagedFilePath,
    });

    expect(prisma.import.create).toHaveBeenCalledWith({
      data: {
        originalName: 'english.apkg',
        fileSize: payload.length,
        status: 'PROCESSING',
      },
    });
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

    await expect(readFile(storedFilePath)).resolves.toEqual(payload);
    expect(existsSync(stagedFilePath)).toBe(false);
    expect(
      existsSync(join(config.storage.mediaDir, 'import-1', 'source.apkg')),
    ).toBe(false);
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
