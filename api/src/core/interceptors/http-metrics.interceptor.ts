import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { MetricsService } from '../metrics/metrics.service';
import { AlertsService } from '../../modules/alerts/alerts.service';
import { context as otelContext, trace as otelTrace } from '@opentelemetry/api';
import { AppConfigService } from '../config/app-config.service';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';

type HttpRequest = {
  method?: string;
  route?: { path?: string };
  path?: string;
  originalUrl?: string;
  headers?: Record<string, string | string[] | undefined>;
  requestId?: string;
};

type HttpResponse = {
  statusCode?: number;
  setHeader: (name: string, value: string) => void;
};

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(
    private metrics: MetricsService,
    private alerts: AlertsService,
    private readonly config: AppConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = process.hrtime.bigint();
    const http = context.switchToHttp();
    const req = http.getRequest<HttpRequest>();
    const res = http.getResponse<HttpResponse>();
    const method: string = req.method || 'GET';
    // Берём паттерн маршрута, чтобы не плодить кардинальности
    const route: string =
      req.route?.path || req.path || req.originalUrl || 'unknown';

    // Устанавливаем X-Trace-Id/X-Span-Id, если доступны
    try {
      const span = otelTrace.getSpan(otelContext.active());
      const sc = span?.spanContext();
      if (sc?.traceId) res.setHeader('X-Trace-Id', sc.traceId);
      if (sc?.spanId) res.setHeader('X-Span-Id', sc.spanId);
    } catch (err) {
      logIgnoredError(err, 'HttpMetricsInterceptor trace headers', undefined, 'debug');
    }

    const record = (status: number) => {
      try {
        const ended = process.hrtime.bigint();
        const seconds = Number(ended - started) / 1e9;
        this.metrics.recordHttp(method, route, status, seconds);
      } catch (err) {
        logIgnoredError(err, 'HttpMetricsInterceptor record', undefined, 'debug');
      }
    };

    const maybeAlert = (status: number, err?: unknown) => {
      try {
        if (status >= 500) {
          const rate = this.config.getAlerts5xxSampleRate();
          if (rate > 0 && Math.random() < rate) {
            const rid =
              req.requestId || this.getHeader(req, 'x-request-id') || '';
            let traceId: string | undefined;
            try {
              const span = otelTrace.getSpan(otelContext.active());
              traceId = span?.spanContext()?.traceId;
            } catch (err) {
              logIgnoredError(
                err,
                'HttpMetricsInterceptor trace id',
                undefined,
                'debug',
              );
            }
            const errorMessage = this.formatErrorMessage(err);
            const msg = [
              `status: ${status}`,
              `method: ${method}`,
              `route: ${route}`,
              rid ? `requestId: ${rid}` : undefined,
              traceId ? `traceId: ${traceId}` : undefined,
              errorMessage ? `error: ${errorMessage}` : undefined,
            ].filter(Boolean) as string[];
            this.alerts
              .notifyIncident({
                title: '5xx on API',
                lines: msg,
                severity: 'critical',
                throttleKey: `http5xx:${route}`,
                throttleMinutes: 5,
              })
              .catch((err) =>
                logIgnoredError(
                  err,
                  'HttpMetricsInterceptor alert',
                  undefined,
                  'debug',
                ),
              );
          }
        }
      } catch (err) {
        logIgnoredError(err, 'HttpMetricsInterceptor alert flow', undefined, 'debug');
      }
    };

    return next.handle().pipe(
      tap(() => {
        const status =
          typeof res.statusCode === 'number' ? res.statusCode : 200;
        record(status);
      }),
      catchError((err: unknown) => {
        let status = 500;
        try {
          if (
            err &&
            typeof err === 'object' &&
            'getStatus' in err &&
            typeof (err as { getStatus?: unknown }).getStatus === 'function'
          ) {
            status = (err as { getStatus: () => number }).getStatus();
          }
        } catch (err) {
          logIgnoredError(err, 'HttpMetricsInterceptor status', undefined, 'debug');
        }
        record(status);
        maybeAlert(status, err);
        return throwError(() => err);
      }),
    );
  }

  private getHeader(req: HttpRequest, name: string): string | undefined {
    const value = req.headers?.[name];
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value[0];
    return undefined;
  }

  private formatErrorMessage(error: unknown): string | null {
    if (!error) return null;
    if (typeof error === 'string') return error.slice(0, 200);
    if (typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string') return message.slice(0, 200);
    }
    return null;
  }
}
