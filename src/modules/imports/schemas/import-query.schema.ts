import { MediaType } from '@prisma/client';
import { z } from 'zod';

export const listImportsQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const listImportDecksQuerySchema = listImportsQuerySchema;

export const listImportNotesQuerySchema = listImportsQuerySchema.extend({
  deckId: z.string().uuid().optional(),
  tags: z.string().trim().min(1).optional(),
});

export const listImportCardsQuerySchema = listImportsQuerySchema.extend({
  deckId: z.string().uuid().optional(),
  tags: z.string().trim().min(1).optional(),
});

export const listImportMediaQuerySchema = listImportsQuerySchema.extend({
  type: z.nativeEnum(MediaType).optional(),
});
