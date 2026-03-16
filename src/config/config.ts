import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { z } from 'zod';

if (existsSync('.env')) {
  loadEnvFile();
}

const booleanFromEnv = z.preprocess(value => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off', ''].includes(normalized)) {
    return false;
  }

  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  APP_NAME: z.string().default('NestJS Prisma API Template'),
  APP_DESCRIPTION: z
    .string()
    .default(
      'Template API with NestJS, Prisma, TypeScript, JWT auth and OpenAPI documentation.',
    ),
  PORT: z.coerce.number().int().positive().default(3333),
  API_PREFIX: z.string().min(1).default('api'),
  API_VERSION: z.string().min(1).default('1'),
  CORS_ORIGIN: z.string().default('*'),
  DATABASE_URL: z.string().optional(),
  DATABASE_REQUIRED: booleanFromEnv.optional().default(false),
  ENABLE_REQUEST_LOGGING: booleanFromEnv.optional().default(true),
  JWT_ACCESS_SECRET: z.string().min(1).default('dev-access-secret'),
  JWT_REFRESH_SECRET: z.string().min(1).default('dev-refresh-secret'),
  JWT_ACCESS_TTL: z.string().min(1).default('15m'),
  JWT_REFRESH_TTL: z.string().min(1).default('7d'),
  SWAGGER_PATH: z.string().min(1).default('docs/swagger'),
  REDOC_PATH: z.string().min(1).default('docs'),
  IMPORTS_TEMP_DIR: z.string().min(1).default('.tmp/anki-imports'),
  MEDIA_STORAGE_DIR: z.string().min(1).default('.tmp/anki-media'),
});

const env = envSchema.parse(process.env);

function resolveCorsOrigin(value: string): true | string[] {
  if (value === '*') {
    return true;
  }

  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function resolveStoragePath(value: string): string {
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

const storage = {
  importsTempDir: resolveStoragePath(env.IMPORTS_TEMP_DIR),
  mediaDir: resolveStoragePath(env.MEDIA_STORAGE_DIR),
};

if (storage.importsTempDir === storage.mediaDir) {
  throw new Error(
    'IMPORTS_TEMP_DIR and MEDIA_STORAGE_DIR must point to different directories.',
  );
}

export const config = {
  app: {
    name: env.APP_NAME,
    description: env.APP_DESCRIPTION,
    environment: env.NODE_ENV,
    port: env.PORT,
    apiPrefix: env.API_PREFIX,
    apiVersion: env.API_VERSION,
    corsOrigin: resolveCorsOrigin(env.CORS_ORIGIN),
  },
  auth: {
    accessTokenSecret: env.JWT_ACCESS_SECRET,
    refreshTokenSecret: env.JWT_REFRESH_SECRET,
    accessTokenTtl: env.JWT_ACCESS_TTL,
    refreshTokenTtl: env.JWT_REFRESH_TTL,
  },
  database: {
    url: env.DATABASE_URL,
    required: env.DATABASE_REQUIRED,
  },
  requestLogging: {
    enabled: env.ENABLE_REQUEST_LOGGING,
  },
  docs: {
    swaggerPath: env.SWAGGER_PATH,
    redocPath: env.REDOC_PATH,
  },
  storage: {
    ...storage,
    importsIncomingDir: join(storage.importsTempDir, 'incoming'),
  },
} as const;
