import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { ZodError } from 'zod';

interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  message: string | string[];
  error: string;
  path: string;
  method: string;
  errors?: Array<{
    field: string;
    message: string;
  }>;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const payload = this.buildResponse(exception, request);
    this.logError(exception, payload);
    response.status(payload.statusCode).json(payload);
  }

  private buildResponse(exception: unknown, request: Request): ErrorResponse {
    const base = {
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      if (
        typeof response === 'object' &&
        response !== null &&
        'errors' in response &&
        Array.isArray((response as { errors?: unknown }).errors)
      ) {
        const typedResponse = response as {
          message?: string | string[];
          errors: Array<{ field: string; message: string }>;
        };

        return {
          ...base,
          statusCode: status,
          message: typedResponse.message ?? 'Validation failed.',
          error: this.httpErrorName(status),
          errors: typedResponse.errors,
        };
      }

      return {
        ...base,
        statusCode: status,
        message:
          typeof response === 'string'
            ? response
            : ((response as { message?: string | string[] }).message ??
              'Unexpected request error.'),
        error: this.httpErrorName(status),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.handlePrismaKnownError(exception, base);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        ...base,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid database input.',
        error: 'Validation Error',
      };
    }

    if (exception instanceof ZodError) {
      return {
        ...base,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed.',
        error: 'Validation Error',
        errors: exception.issues.map(issue => ({
          field: issue.path.join('.') || 'root',
          message: issue.message,
        })),
      };
    }

    if (
      exception instanceof Error &&
      exception.constructor.name === 'PrismaClientInitializationError'
    ) {
      return {
        ...base,
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database service is temporarily unavailable.',
        error: 'Service Unavailable',
      };
    }

    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message:
        process.env.NODE_ENV === 'development' && exception instanceof Error
          ? exception.message
          : 'Internal server error.',
      error: 'Internal Server Error',
    };
  }

  private handlePrismaKnownError(
    exception: Prisma.PrismaClientKnownRequestError,
    base: Omit<ErrorResponse, 'statusCode' | 'message' | 'error'>,
  ): ErrorResponse {
    switch (exception.code) {
      case 'P2002':
        return {
          ...base,
          statusCode: HttpStatus.CONFLICT,
          message: 'Resource already exists.',
          error: 'Conflict',
        };
      case 'P2003':
        return {
          ...base,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid relation reference.',
          error: 'Foreign Key Constraint',
        };
      case 'P2025':
        return {
          ...base,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Resource not found.',
          error: 'Not Found',
        };
      default:
        return {
          ...base,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Unexpected database error.',
          error: 'Database Error',
        };
    }
  }

  private httpErrorName(statusCode: number): string {
    const status = statusCode as HttpStatus;

    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'Bad Request';
      case HttpStatus.UNAUTHORIZED:
        return 'Unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'Forbidden';
      case HttpStatus.NOT_FOUND:
        return 'Not Found';
      case HttpStatus.CONFLICT:
        return 'Conflict';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'Unprocessable Entity';
      default:
        return 'Error';
    }
  }

  private logError(exception: unknown, response: ErrorResponse): void {
    const context = JSON.stringify(response, null, 2);

    if (response.statusCode >= 500) {
      this.logger.error(
        response.message,
        exception instanceof Error ? exception.stack : undefined,
        context,
      );
      return;
    }

    if (response.statusCode >= 400) {
      this.logger.warn(response.message, context);
    }
  }
}
