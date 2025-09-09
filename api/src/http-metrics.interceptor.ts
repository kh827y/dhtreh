import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { MetricsService } from './metrics.service';
import { context as otelContext, trace as otelTrace } from '@opentelemetry/api';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const started = process.hrtime.bigint();
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const method: string = req.method || 'GET';
    // Берём паттерн маршрута, чтобы не плодить кардинальности
    const route: string = (req.route && req.route.path) || req.path || req.originalUrl || 'unknown';

    // Устанавливаем X-Trace-Id/X-Span-Id, если доступны
    try {
      const span = otelTrace.getSpan(otelContext.active());
      const sc = span?.spanContext();
      if (sc?.traceId) res.setHeader('X-Trace-Id', sc.traceId);
      if (sc?.spanId) res.setHeader('X-Span-Id', sc.spanId);
    } catch {}

    const record = (status: number) => {
      try {
        const ended = process.hrtime.bigint();
        const seconds = Number(ended - started) / 1e9;
        this.metrics.recordHttp(method, route, status, seconds);
      } catch {}
    };

    return next.handle().pipe(
      tap(() => record(res.statusCode || 200)),
      catchError((err) => {
        let status = 500;
        try { status = typeof err?.getStatus === 'function' ? err.getStatus() : 500; } catch {}
        record(status);
        return throwError(() => err);
      }),
    );
  }
}
