import { z } from 'zod';

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

export const registerSchema = z.strictObject({
  name: z.string().min(2).max(120),
  email: z.string().email().max(160),
  password: passwordSchema,
});

export const loginSchema = z.strictObject({
  email: z.string().email().max(160),
  password: z.string().min(1),
});

export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
    refresh_token: z.string().min(1).optional(),
  })
  .refine(data => Boolean(data.refreshToken ?? data.refresh_token), {
    message: 'Refresh token is required.',
    path: ['refreshToken'],
  })
  .transform(data => ({
    refreshToken: data.refreshToken ?? data.refresh_token!,
  }));
