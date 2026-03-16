import { existsSync } from 'node:fs';
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import { lookup as lookupMimeType } from 'mime-types';
import { config } from '../../config/config';

const COLLECTION_FILENAMES = ['collection.anki21', 'collection.anki2'] as const;
const EXTRACTED_DIRNAME = 'extracted';
const MEDIA_MAP_FILENAME = 'media';
const ANKI_FIELD_SEPARATOR = '\x1f';
const IMAGE_SOURCE_PATTERN =
  /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
const SOUND_REFERENCE_PATTERN = /\[sound:([^\]\r\n]+)\]/gi;

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

export type PreparedImportCollection = PreparedImportArchive & {
  raw: {
    collection: RawAnkiCollectionRow | null;
  };
};

export type PreparedImportNotes = PreparedImportArchive & {
  raw: {
    collection: RawAnkiCollectionRow | null;
    notes: RawAnkiNoteRow[];
  };
};

export type ParsedAnkiDeck = {
  ankiDeckId: string;
  name: string;
  description: string | null;
};

export type ParsedAnkiNoteModelField = {
  ordinal: number;
  name: string;
};

export type ParsedAnkiNoteModelTemplate = {
  ordinal: number;
  name: string;
  questionFormat: string | null;
  answerFormat: string | null;
};

export type ParsedAnkiNoteModel = {
  ankiModelId: string;
  name: string;
  fields: ParsedAnkiNoteModelField[];
  templates: ParsedAnkiNoteModelTemplate[];
};

export type ParsedAnkiCollectionMetadata = {
  decks: ParsedAnkiDeck[];
  noteModels: ParsedAnkiNoteModel[];
};

export type ParsedAnkiNoteMediaReference = {
  type: 'IMAGE' | 'AUDIO';
  reference: string;
};

export type ParsedAnkiNoteField = {
  value: string;
  mediaReferences: ParsedAnkiNoteMediaReference[];
};

export type ParsedAnkiNote = {
  ankiNoteId: string;
  ankiModelId: string;
  tags: string[];
  fields: Record<string, ParsedAnkiNoteField>;
};

export type ParsedAnkiCard = {
  ankiCardId: string;
  ankiNoteId: string;
  ankiDeckId: string;
  ordinal: number;
  type: number;
  queue: number;
  due: number | null;
  ivl: number | null;
  factor: number | null;
  reps: number;
  lapses: number;
};

export type ParsedAnkiMediaFile = {
  ankiIndex: string;
  originalName: string;
  filePath: string;
  relativePath: string;
  sizeBytes: number;
  mimeType: string;
  type: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'OTHER';
};

export type ParsedAnkiMediaCollection = {
  files: ParsedAnkiMediaFile[];
  missingFiles: Array<{
    ankiIndex: string;
    originalName: string;
  }>;
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

  async readPreparedImportCollection(
    importId: string,
  ): Promise<PreparedImportCollection> {
    const preparedArchive =
      await this.resolvePreparedArchiveOrPrepare(importId);

    return {
      ...preparedArchive,
      raw: {
        collection: this.loadRawCollectionData(
          preparedArchive.collectionFile.filePath,
        ),
      },
    };
  }

  async readPreparedImportNotes(
    importId: string,
  ): Promise<PreparedImportNotes> {
    const preparedArchive =
      await this.resolvePreparedArchiveOrPrepare(importId);

    return {
      ...preparedArchive,
      raw: this.loadRawCollectionAndNotes(
        preparedArchive.collectionFile.filePath,
      ),
    };
  }

  async readPreparedImportSource(
    importId: string,
  ): Promise<PreparedImportSource> {
    const preparedArchive =
      await this.resolvePreparedArchiveOrPrepare(importId);

    return {
      ...preparedArchive,
      raw: this.loadRawSqliteData(preparedArchive.collectionFile.filePath),
    };
  }

  parseCollectionMetadata(
    collection: RawAnkiCollectionRow | null,
  ): ParsedAnkiCollectionMetadata {
    if (!collection) {
      throw new InvalidAnkiPackageError(
        'The Anki collection does not contain collection metadata.',
      );
    }

    return {
      noteModels: this.parseNoteModels(collection.models),
      decks: this.parseDecks(collection.decks),
    };
  }

  parseNotes(
    rawNotes: RawAnkiNoteRow[],
    noteModels: ParsedAnkiNoteModel[],
  ): ParsedAnkiNote[] {
    const noteModelsById = new Map(
      noteModels.map(noteModel => [noteModel.ankiModelId, noteModel]),
    );

    return rawNotes.map(rawNote => {
      const noteModel = noteModelsById.get(String(rawNote.mid));

      if (!noteModel) {
        throw new InvalidAnkiPackageError(
          `The Anki note ${rawNote.id} references missing note model ${rawNote.mid}.`,
        );
      }

      const orderedFields = noteModel.fields
        .map((field, index) => ({ ...field, index }))
        .sort(
          (left, right) =>
            left.ordinal - right.ordinal || left.index - right.index,
        );
      const fieldValues = rawNote.flds.split(ANKI_FIELD_SEPARATOR);

      if (fieldValues.length !== orderedFields.length) {
        throw new InvalidAnkiPackageError(
          `The Anki note ${rawNote.id} field count does not match note model ${noteModel.ankiModelId}.`,
        );
      }

      const fields = Object.fromEntries(
        orderedFields.map((field, index) => {
          const value = fieldValues[index] ?? '';

          return [
            field.name,
            {
              value,
              mediaReferences: this.detectMediaReferences(value),
            },
          ];
        }),
      );

      return {
        ankiNoteId: String(rawNote.id),
        ankiModelId: noteModel.ankiModelId,
        tags: this.parseTags(rawNote.tags),
        fields,
      };
    });
  }

  parseCards(rawCards: RawAnkiCardRow[]): ParsedAnkiCard[] {
    return rawCards.map(rawCard => ({
      ankiCardId: String(rawCard.id),
      ankiNoteId: String(rawCard.nid),
      ankiDeckId: String(rawCard.did),
      ordinal: rawCard.ord,
      type: rawCard.type,
      queue: rawCard.queue,
      due: this.resolveOptionalInteger(rawCard.due),
      ivl: this.resolveOptionalInteger(rawCard.ivl),
      factor: this.resolveOptionalInteger(rawCard.factor),
      reps: rawCard.reps,
      lapses: rawCard.lapses,
    }));
  }

  async parseMediaFiles(
    preparedArchive: PreparedImportArchive,
  ): Promise<ParsedAnkiMediaCollection> {
    const mediaMap = await this.readMediaMap(preparedArchive.mediaMapPath);
    const physicalFilesByIndex = new Map(
      preparedArchive.mediaFiles.map(file => [file.index, file]),
    );

    return {
      files: preparedArchive.mediaFiles.map(file => {
        const originalName = mediaMap.get(file.index) ?? file.index;
        const mimeType = this.detectMimeType(originalName);

        return {
          ankiIndex: file.index,
          originalName,
          filePath: file.filePath,
          relativePath: file.relativePath,
          sizeBytes: file.sizeBytes,
          mimeType,
          type: this.classifyMediaType(mimeType),
        };
      }),
      missingFiles: [...mediaMap.entries()]
        .filter(([ankiIndex]) => !physicalFilesByIndex.has(ankiIndex))
        .sort(([leftIndex], [rightIndex]) =>
          this.compareAnkiIdentifiers(leftIndex, rightIndex),
        )
        .map(([ankiIndex, originalName]) => ({
          ankiIndex,
          originalName,
        })),
    };
  }

  private async resolvePreparedArchiveOrPrepare(
    importId: string,
  ): Promise<PreparedImportArchive> {
    const extractedPath = this.getExtractedPath(importId);

    return existsSync(extractedPath)
      ? this.resolvePreparedArchiveFromWorkspace(importId)
      : this.prepareWorkspace(importId);
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

  private loadRawCollectionAndNotes(
    collectionPath: string,
  ): PreparedImportNotes['raw'] {
    return this.withReadonlyDatabase(collectionPath, database => ({
      collection:
        database
          .prepare<[], RawAnkiCollectionRow>('SELECT * FROM col LIMIT 1')
          .get() ?? null,
      notes: database
        .prepare<[], RawAnkiNoteRow>('SELECT * FROM notes ORDER BY id')
        .all(),
    }));
  }

  private loadRawCollectionData(
    collectionPath: string,
  ): RawAnkiCollectionRow | null {
    return this.withReadonlyDatabase(
      collectionPath,
      database =>
        database
          .prepare<[], RawAnkiCollectionRow>('SELECT * FROM col LIMIT 1')
          .get() ?? null,
    );
  }

  private parseDecks(rawDecks: string): ParsedAnkiDeck[] {
    const parsedDecks = this.parseCollectionJsonRecord(
      rawDecks,
      'decks',
      'The Anki collection has invalid deck metadata in col.decks.',
    );

    return Object.entries(parsedDecks)
      .sort(([leftKey], [rightKey]) =>
        this.compareAnkiIdentifiers(leftKey, rightKey),
      )
      .map(([entryKey, rawDeck]) => {
        const deck = this.asJsonObject(
          rawDeck,
          'The Anki collection has invalid deck metadata in col.decks.',
        );

        return {
          ankiDeckId: this.resolveAnkiIdentifier(deck.id, entryKey),
          name: this.requireNonEmptyString(
            deck.name,
            'The Anki collection has invalid deck metadata in col.decks.',
          ),
          description: this.resolveOptionalString(deck.desc),
        };
      });
  }

  private parseNoteModels(rawModels: string): ParsedAnkiNoteModel[] {
    const parsedModels = this.parseCollectionJsonRecord(
      rawModels,
      'models',
      'The Anki collection has invalid note model metadata in col.models.',
    );

    return Object.entries(parsedModels)
      .sort(([leftKey], [rightKey]) =>
        this.compareAnkiIdentifiers(leftKey, rightKey),
      )
      .map(([entryKey, rawModel]) => {
        const model = this.asJsonObject(
          rawModel,
          'The Anki collection has invalid note model metadata in col.models.',
        );
        const rawFields = this.requireArray(
          model.flds,
          'The Anki collection has invalid note model metadata in col.models.',
        );
        const rawTemplates = this.requireArray(
          model.tmpls,
          'The Anki collection has invalid note model metadata in col.models.',
        );

        return {
          ankiModelId: this.resolveAnkiIdentifier(model.id, entryKey),
          name: this.requireNonEmptyString(
            model.name,
            'The Anki collection has invalid note model metadata in col.models.',
          ),
          fields: rawFields.map((rawField, index) =>
            this.parseNoteModelField(rawField, index),
          ),
          templates: rawTemplates.map((rawTemplate, index) =>
            this.parseNoteModelTemplate(rawTemplate, index),
          ),
        };
      });
  }

  private parseNoteModelField(
    rawField: unknown,
    index: number,
  ): ParsedAnkiNoteModelField {
    const field = this.asJsonObject(
      rawField,
      'The Anki collection has invalid note model metadata in col.models.',
    );

    return {
      ordinal: this.resolveOrdinal(field.ord, index),
      name: this.requireNonEmptyString(
        field.name,
        'The Anki collection has invalid note model metadata in col.models.',
      ),
    };
  }

  private parseNoteModelTemplate(
    rawTemplate: unknown,
    index: number,
  ): ParsedAnkiNoteModelTemplate {
    const template = this.asJsonObject(
      rawTemplate,
      'The Anki collection has invalid note model metadata in col.models.',
    );

    return {
      ordinal: this.resolveOrdinal(template.ord, index),
      name: this.requireNonEmptyString(
        template.name,
        'The Anki collection has invalid note model metadata in col.models.',
      ),
      questionFormat: this.resolveOptionalString(template.qfmt),
      answerFormat: this.resolveOptionalString(template.afmt),
    };
  }

  private parseCollectionJsonRecord(
    value: string,
    columnName: 'models' | 'decks',
    invalidMetadataMessage: string,
  ): Record<string, unknown> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(value);
    } catch {
      throw new InvalidAnkiPackageError(
        `The Anki collection has invalid JSON in col.${columnName}.`,
      );
    }

    return this.asJsonObject(parsed, invalidMetadataMessage);
  }

  private asJsonObject(
    value: unknown,
    errorMessage: string,
  ): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    throw new InvalidAnkiPackageError(errorMessage);
  }

  private requireArray(value: unknown, errorMessage: string): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }

    throw new InvalidAnkiPackageError(errorMessage);
  }

  private requireNonEmptyString(value: unknown, errorMessage: string): string {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }

    throw new InvalidAnkiPackageError(errorMessage);
  }

  private resolveOptionalString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  private resolveAnkiIdentifier(value: unknown, fallback: string): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === 'string' && value.length > 0) {
      return value;
    }

    if (fallback.length > 0) {
      return fallback;
    }

    throw new InvalidAnkiPackageError(
      'The Anki collection has invalid metadata identifiers.',
    );
  }

  private resolveOrdinal(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }

    return fallback;
  }

  private resolveOptionalInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }

    return null;
  }

  private compareAnkiIdentifiers(left: string, right: string): number {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    const leftIsNumeric = Number.isFinite(leftNumber);
    const rightIsNumeric = Number.isFinite(rightNumber);

    if (leftIsNumeric && rightIsNumeric) {
      return leftNumber - rightNumber;
    }

    if (leftIsNumeric) {
      return -1;
    }

    if (rightIsNumeric) {
      return 1;
    }

    return left.localeCompare(right);
  }

  private parseTags(rawTags: string): string[] {
    return rawTags.split(/\s+/).filter(tag => tag.length > 0);
  }

  private async readMediaMap(
    mediaMapPath?: string,
  ): Promise<Map<string, string>> {
    if (!mediaMapPath) {
      return new Map();
    }

    let parsedMediaMap: unknown;

    try {
      parsedMediaMap = JSON.parse(await readFile(mediaMapPath, 'utf8'));
    } catch {
      throw new InvalidAnkiPackageError(
        'The Anki media map file contains invalid JSON.',
      );
    }

    const mediaEntries = this.asJsonObject(
      parsedMediaMap,
      'The Anki media map file contains invalid metadata.',
    );

    return new Map(
      Object.entries(mediaEntries)
        .filter(
          (entry): entry is [string, string] =>
            /^\d+$/.test(entry[0]) &&
            typeof entry[1] === 'string' &&
            entry[1].trim().length > 0,
        )
        .map(([ankiIndex, originalName]) => [ankiIndex, originalName.trim()]),
    );
  }

  private detectMimeType(originalName: string): string {
    const mimeType = lookupMimeType(originalName.replaceAll('\\', '/'));

    return typeof mimeType === 'string' ? mimeType : 'application/octet-stream';
  }

  private classifyMediaType(mimeType: string): ParsedAnkiMediaFile['type'] {
    if (mimeType.startsWith('image/')) {
      return 'IMAGE';
    }

    if (mimeType.startsWith('audio/')) {
      return 'AUDIO';
    }

    if (mimeType.startsWith('video/')) {
      return 'VIDEO';
    }

    return 'OTHER';
  }

  private detectMediaReferences(value: string): ParsedAnkiNoteMediaReference[] {
    const references: Array<ParsedAnkiNoteMediaReference & { index: number }> =
      [];
    let match: RegExpExecArray | null;

    IMAGE_SOURCE_PATTERN.lastIndex = 0;

    while ((match = IMAGE_SOURCE_PATTERN.exec(value)) !== null) {
      const reference = match[1] ?? match[2] ?? match[3];

      if (reference) {
        references.push({
          type: 'IMAGE',
          reference,
          index: match.index,
        });
      }
    }

    SOUND_REFERENCE_PATTERN.lastIndex = 0;

    while ((match = SOUND_REFERENCE_PATTERN.exec(value)) !== null) {
      const reference = match[1];

      if (reference) {
        references.push({
          type: 'AUDIO',
          reference,
          index: match.index,
        });
      }
    }

    return references
      .sort((left, right) => left.index - right.index)
      .map(({ type, reference }) => ({ type, reference }));
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
