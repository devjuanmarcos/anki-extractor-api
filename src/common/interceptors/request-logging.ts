import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { RequestLogService } from '../services/request-log.service';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly requestLogs: RequestLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<
      Request & {
        body?: unknown;
        query?: unknown;
        params?: unknown;
        user?: { id?: string; email?: string; name?: string; role?: string };
      }
    >();
    const res = http.getResponse<{ statusCode?: number }>();

    const baseLog = {
      userId: req.user?.id ?? null,
      userEmail: req.user?.email ?? null,
      userName: req.user?.name ?? null,
      userRole: req.user?.role ?? null,
      route: req.url?.split('?')[0] ?? '',
      method: req.method ?? 'GET',
      payload: this.requestLogs.preparePayload({
        body: req.body,
        query: req.query,
        params: req.params,
      }),
    };

    return next.handle().pipe(
      tap(() => {
        void this.requestLogs.create({
          ...baseLog,
          statusCode: res.statusCode ?? 200,
          success: (res.statusCode ?? 200) < 400,
        });
      }),
      catchError((error: unknown) => {
        const statusCode =
          (error as { status?: number }).status ??
          (typeof (error as { getStatus?: () => number }).getStatus ===
          'function'
            ? (error as { getStatus: () => number }).getStatus()
            : 500);

        void this.requestLogs.create({
          ...baseLog,
          statusCode,
          success: false,
        });

        const throwableError =
          error instanceof Error
            ? error
            : new Error('Unexpected request error.');

        return throwError(() => throwableError);
      }),
    );
  }
}
