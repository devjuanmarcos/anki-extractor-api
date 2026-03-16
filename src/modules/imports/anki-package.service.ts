import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import { config } from '../../config/config';

const COLLECTION_FILENAMES = ['collection.anki21', 'collection.anki2'] as const;
const EXTRACTED_DIRNAME = 'extracted';
const MEDIA_MAP_FILENAME = 'media';

export type CollectionFileName = (typeof COLLECTION_FILENAMES)[number];

type ExtractedArchiveFile = {
  absolutePath: string;
  relativePath: string;
  baseName: string;
  sizeBytes: number;
};

export type RawAnkiCollectionRow = {
  id: number;
  crt: number;
  mod: number;
  scm: number;
  ver: number;
  dty: number;
  usn: number;
  ls: number;
  conf: string;
  models: string;
  decks: string;
  dconf: string;
  tags: string;
};

export type RawAnkiNoteRow = {
  id: number;
  guid: string;
  mid: number;
  mod: number;
  usn: number;
  tags: string;
  flds: string;
  sfld: string | number | null;
  csum: number;
  flags: number;
  data: string;
};

export type RawAnkiCardRow = {
  id: number;
  nid: number;
  did: number;
  ord: number;
  mod: number;
  usn: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  left: number;
  odue: number;
  odid: number;
  flags: number;
  data: string;
};

export type PreparedImportArchive = {
  importId: string;
  workspacePath: string;
  sourceArchivePath: string;
  extractedPath: string;
  collectionFile: {
    fileName: CollectionFileName;
    filePath: string;
    relativePath: string;
  };
  mediaMapPath?: string;
  mediaMapRelativePath?: string;
  mediaFiles: Array<{
    index: string;
    filePath: string;
    relativePath: string;
    sizeBytes: number;
  }>;
};

export type PreparedImportSource = PreparedImportArchive & {
  raw: {
    collection: RawAnkiCollectionRow | null;
    notes: RawAnkiNoteRow[];
    cards: RawAnkiCardRow[];
  };
};

export class InvalidAnkiPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = InvalidAnkiPackageError.name;
  }
}

@Injectable()
export class AnkiPackageService {
  async prepareWorkspace(importId: string): Promise<PreparedImportArchive> {
    const sourceArchivePath = this.getSourceArchivePath(importId);
    const workspacePath = this.getWorkspacePath(importId);
    const extractedPath = this.getExtractedPath(importId);

    if (!existsSync(sourceArchivePath)) {
      throw new InvalidAnkiPackageError(
        'The uploaded .apkg file is missing from the import workspace.',
      );
    }

    await rm(extractedPath, { recursive: true, force: true });
    await mkdir(extractedPath, { recursive: true });

    const extractedFiles = await this.extractArchive(
      sourceArchivePath,
      extractedPath,
    );
    const preparedArchive = this.resolvePreparedArchive(
      importId,
      workspacePath,
      sourceArchivePath,
      extractedPath,
      extractedFiles,
    );

    this.assertCollectionReadable(preparedArchive.collectionFile.filePath);

    return preparedArchive;
  }

  async readPreparedImportSource(
    importId: string,
  ): Promise<PreparedImportSource> {
    const extractedPath = this.getExtractedPath(importId);
    const preparedArchive = existsSync(extractedPath)
      ? await this.resolvePreparedArchiveFromWorkspace(importId)
      : await this.prepareWorkspace(importId);

    return {
      ...preparedArchive,
      raw: this.loadRawSqliteData(preparedArchive.collectionFile.filePath),
    };
  }

  private async resolvePreparedArchiveFromWorkspace(
    importId: string,
  ): Promise<PreparedImportArchive> {
    const workspacePath = this.getWorkspacePath(importId);
    const sourceArchivePath = this.getSourceArchivePath(importId);
    const extractedPath = this.getExtractedPath(importId);
    const extractedFiles = await this.listExtractedFiles(extractedPath);

    return this.resolvePreparedArchive(
      importId,
      workspacePath,
      sourceArchivePath,
      extractedPath,
      extractedFiles,
    );
  }

  private async extractArchive(
    sourceArchivePath: string,
    extractedPath: string,
  ): Promise<ExtractedArchiveFile[]> {
    let archive: AdmZip;

    try {
      archive = new AdmZip(sourceArchivePath);
    } catch {
      throw new InvalidAnkiPackageError(
        'Failed to extract the uploaded .apkg archive.',
      );
    }

    const rootPath = `${resolve(extractedPath)}${sep}`;
    const extractedFiles: ExtractedArchiveFile[] = [];

    for (const entry of archive.getEntries()) {
      const relativePath = entry.entryName.replaceAll('\\', '/');
      const destinationPath = resolve(extractedPath, relativePath);

      if (!destinationPath.startsWith(rootPath)) {
        throw new InvalidAnkiPackageError(
          'The uploaded .apkg archive contains an unsafe path.',
        );
      }

      if (entry.isDirectory) {
        await mkdir(destinationPath, { recursive: true });
        continue;
      }

      const fileContents = entry.getData();

      await mkdir(dirname(destinationPath), { recursive: true });
      await writeFile(destinationPath, fileContents);

      extractedFiles.push({
        absolutePath: destinationPath,
        relativePath,
        baseName: basename(relativePath),
        sizeBytes: fileContents.length,
      });
    }

    return extractedFiles;
  }

  private async listExtractedFiles(
    extractedPath: string,
  ): Promise<ExtractedArchiveFile[]> {
    if (!existsSync(extractedPath)) {
      throw new InvalidAnkiPackageError(
        'The import workspace does not contain an extracted .apkg archive.',
      );
    }

    const entries: ExtractedArchiveFile[] = [];
    const queue = [''];

    while (queue.length > 0) {
      const relativeDir = queue.shift()!;
      const absoluteDir = relativeDir
        ? join(extractedPath, relativeDir)
        : extractedPath;
      const children = await readdir(absoluteDir, { withFileTypes: true });

      for (const child of children) {
        const childRelativePath = relativeDir
          ? `${relativeDir}/${child.name}`
          : child.name;
        const childAbsolutePath = join(extractedPath, childRelativePath);

        if (child.isDirectory()) {
          queue.push(childRelativePath);
          continue;
        }

        const childStat = await stat(childAbsolutePath);

        entries.push({
          absolutePath: childAbsolutePath,
          relativePath: childRelativePath.replaceAll('\\', '/'),
          baseName: child.name,
          sizeBytes: childStat.size,
        });
      }
    }

    return entries;
  }

  private resolvePreparedArchive(
    importId: string,
    workspacePath: string,
    sourceArchivePath: string,
    extractedPath: string,
    extractedFiles: ExtractedArchiveFile[],
  ): PreparedImportArchive {
    const collectionFile = this.findCollectionFile(extractedFiles);

    if (!collectionFile) {
      throw new InvalidAnkiPackageError(
        'The .apkg package does not contain collection.anki2 or collection.anki21.',
      );
    }

    const mediaMapFile = this.findFirstByBaseName(
      extractedFiles,
      MEDIA_MAP_FILENAME,
    );
    const mediaFiles = extractedFiles
      .filter(file => /^\d+$/.test(file.baseName))
      .sort((left, right) => {
        const numericDifference =
          Number(left.baseName) - Number(right.baseName);
        return (
          numericDifference ||
          left.relativePath.localeCompare(right.relativePath)
        );
      })
      .map(file => ({
        index: file.baseName,
        filePath: file.absolutePath,
        relativePath: file.relativePath,
        sizeBytes: file.sizeBytes,
      }));

    return {
      importId,
      workspacePath,
      sourceArchivePath,
      extractedPath,
      collectionFile: {
        fileName: collectionFile.baseName as CollectionFileName,
        filePath: collectionFile.absolutePath,
        relativePath: collectionFile.relativePath,
      },
      mediaMapPath: mediaMapFile?.absolutePath,
      mediaMapRelativePath: mediaMapFile?.relativePath,
      mediaFiles,
    };
  }

  private findCollectionFile(
    extractedFiles: ExtractedArchiveFile[],
  ): ExtractedArchiveFile | undefined {
    for (const fileName of COLLECTION_FILENAMES) {
      const matchingFile = extractedFiles
        .filter(file => file.baseName === fileName)
        .sort((left, right) =>
          left.relativePath.localeCompare(right.relativePath),
        )[0];

      if (matchingFile) {
        return matchingFile;
      }
    }

    return undefined;
  }

  private findFirstByBaseName(
    extractedFiles: ExtractedArchiveFile[],
    fileName: string,
  ): ExtractedArchiveFile | undefined {
    return extractedFiles
      .filter(file => file.baseName === fileName)
      .sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath),
      )[0];
  }

  private assertCollectionReadable(collectionPath: string): void {
    this.withReadonlyDatabase(collectionPath, database => {
      database.prepare('SELECT * FROM col LIMIT 1').get();
      database.prepare('SELECT * FROM notes LIMIT 1').all();
      database.prepare('SELECT * FROM cards LIMIT 1').all();
    });
  }

  private loadRawSqliteData(
    collectionPath: string,
  ): PreparedImportSource['raw'] {
    return this.withReadonlyDatabase(collectionPath, database => ({
      collection:
        database
          .prepare<[], RawAnkiCollectionRow>('SELECT * FROM col LIMIT 1')
          .get() ?? null,
      notes: database
        .prepare<[], RawAnkiNoteRow>('SELECT * FROM notes ORDER BY id')
        .all(),
      cards: database
        .prepare<[], RawAnkiCardRow>('SELECT * FROM cards ORDER BY id')
        .all(),
    }));
  }

  private withReadonlyDatabase<T>(
    collectionPath: string,
    action: (database: Database.Database) => T,
  ): T {
    let database: Database.Database | undefined;

    try {
      database = new Database(collectionPath, {
        readonly: true,
        fileMustExist: true,
      });
      database.pragma('query_only = ON');

      return action(database);
    } catch {
      throw new InvalidAnkiPackageError(
        'The .apkg package does not contain a readable Anki SQLite collection.',
      );
    } finally {
      database?.close();
    }
  }

  private getWorkspacePath(importId: string): string {
    return join(config.storage.importsTempDir, importId);
  }

  private getSourceArchivePath(importId: string): string {
    return join(this.getWorkspacePath(importId), 'source.apkg');
  }

  private getExtractedPath(importId: string): string {
    return join(this.getWorkspacePath(importId), EXTRACTED_DIRNAME);
  }
}
