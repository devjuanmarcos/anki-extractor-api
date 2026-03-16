import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { config } from '../../config/config';
import { PrismaService } from './prisma.service';

type AnyRecord = Record<string, unknown>;

@Injectable()
export class RequestLogService {
  private readonly logger = new Logger(RequestLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(entry: {
    userId?: string | null;
    userEmail?: string | null;
    userName?: string | null;
    userRole?: string | null;
    route: string;
    method: string;
    statusCode: number;
    success: boolean;
    payload?: unknown;
  }): Promise<void> {
    if (!config.requestLogging.enabled) {
      return;
    }

    try {
      await this.prisma.requestLog.create({
        data: {
          userId: entry.userId ?? null,
          userEmail: entry.userEmail ?? null,
          userName: entry.userName ?? null,
          userRole: entry.userRole ?? null,
          route: entry.route,
          method: entry.method,
          statusCode: entry.statusCode,
          success: entry.success,
          ...(entry.payload
            ? { payload: entry.payload as Prisma.InputJsonValue }
            : {}),
        },
      });
    } catch {
      this.logger.debug('Request log could not be persisted.');
    }
  }

  preparePayload(input: {
    body?: unknown;
    query?: unknown;
    params?: unknown;
  }): AnyRecord {
    return this.visit({
      body: input.body ?? undefined,
      query: input.query ?? undefined,
      params: input.params ?? undefined,
    }) as AnyRecord;
  }

  private visit(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(item => this.visit(item));
    }

    if (value && typeof value === 'object') {
      const sensitiveKeys = [
        'password',
        'accessToken',
        'refreshToken',
        'token',
        'secret',
      ];
      const output: AnyRecord = {};

      Object.entries(value as Record<string, unknown>).forEach(
        ([key, currentValue]) => {
          output[key] = sensitiveKeys.includes(key)
            ? '[REDACTED]'
            : this.visit(currentValue);
        },
      );

      return output;
    }

    return value;
  }
}
