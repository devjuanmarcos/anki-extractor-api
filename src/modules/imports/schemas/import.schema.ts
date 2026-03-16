import { basename, extname } from 'node:path';
import { z } from 'zod';

export const createImportSchema = z
  .object({
    originalName: z.string(),
    size: z.number().int().nonnegative(),
    temporaryFilePath: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.temporaryFilePath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['file'],
        message: 'File is required.',
      });
      return;
    }

    const normalizedName = basename(value.originalName).trim();

    if (!normalizedName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['file'],
        message: 'File is required.',
      });
      return;
    }

    if (extname(normalizedName).toLowerCase() !== '.apkg') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['file'],
        message: 'Only .apkg files are supported.',
      });
    }

    if (value.size === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['file'],
        message: 'Uploaded file cannot be empty.',
      });
    }
  });
