import { z } from 'zod';

export const createItemSchema = z.strictObject({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
});

export const updateItemSchema = z
  .strictObject({
    name: z.string().min(1).max(160).optional(),
    description: z.string().max(2000).optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be informed.',
  });

export const listItemsQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
});
