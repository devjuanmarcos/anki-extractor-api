import { z } from 'zod';
import { APP_ROLES } from '../../../common/types/role';

const roleSchema = z.enum(APP_ROLES);
const passwordSchema = z
  .string()
  .min(8, 'Password must contain at least 8 characters.')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
  .regex(/[0-9]/, 'Password must contain at least one number.')
  .regex(
    /[^A-Za-z0-9]/,
    'Password must contain at least one special character.',
  );

const booleanFromQuery = z.preprocess(value => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'string') {
    return value === 'true';
  }

  return value;
}, z.boolean().optional());

export const createUserSchema = z.strictObject({
  name: z.string().min(2).max(120),
  email: z.string().email().max(160),
  password: passwordSchema,
  role: roleSchema.optional().default('MEMBER'),
  isActive: z.boolean().optional().default(true),
});

export const updateProfileSchema = z
  .strictObject({
    name: z.string().min(2).max(120).optional(),
    email: z.string().email().max(160).optional(),
    password: passwordSchema.optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be informed.',
  });

export const updateUserRoleSchema = z.strictObject({
  role: roleSchema,
});

export const updateUserStatusSchema = z.strictObject({
  isActive: z.boolean(),
});

export const listUsersQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  role: roleSchema.optional(),
  isActive: booleanFromQuery,
});
