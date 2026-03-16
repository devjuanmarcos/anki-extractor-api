import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { config } from '../../config/config';

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [250, 500, 1000];

function isConnectionError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const typedError = error as { code?: string; errorCode?: string };
    const code = typedError.errorCode ?? typedError.code;

    if (code === 'P1001' || code === 'P1017' || code === 'P2024') {
      return true;
    }
  }

  return (
    error instanceof Error &&
    error.constructor.name === 'PrismaClientInitializationError'
  );
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  async onModuleInit(): Promise<void> {
    if (!config.database.url) {
      if (config.database.required) {
        throw new InternalServerErrorException(
          'DATABASE_URL is required when DATABASE_REQUIRED=true.',
        );
      }

      this.logger.warn(
        'DATABASE_URL is not set. The API will start, but database-backed routes will fail until the database is configured.',
      );
      return;
    }

    try {
      await this.connectWithRetry();
      this.connected = true;
    } catch (error) {
      this.connected = false;

      if (config.database.required) {
        throw error;
      }

      this.logger.warn(
        'Database connection failed during bootstrap. Starting in degraded mode because DATABASE_REQUIRED=false.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.connected) {
      return;
    }

    await this.$disconnect();
    this.connected = false;
  }

  async isHealthy(): Promise<boolean> {
    if (!config.database.url) {
      return false;
    }

    try {
      await this.$queryRaw`SELECT 1`;
      this.connected = true;
      return true;
    } catch {
      return false;
    }
  }

  private async connectWithRetry(): Promise<void> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        lastError = error;

        if (attempt < MAX_RETRIES && isConnectionError(error)) {
          await new Promise(resolve => {
            setTimeout(resolve, RETRY_DELAYS_MS[attempt]);
          });
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }
}
