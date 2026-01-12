import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import Ajv from 'ajv';
import * as Sentry from '@sentry/node';
import { HttpAdapterHost } from '@nestjs/core';
import { SentryFilter } from './sentry.filter';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsService } from './metrics.service';
import { AlertsService } from './alerts/alerts.service';
// OpenTelemetry (инициализация по флагу)
import './otel';
import { context as otelContext, trace as otelTrace } from '@opentelemetry/api';
import { HttpErrorFilter } from './http-error.filter';

async function bootstrap() {
  // Fail-fast ENV validation (Ajv schema)
  (function validateEnv() {
    const ajv = new Ajv({
      allErrors: true,
      allowUnionTypes: true,
      removeAdditional: false,
    });
    const schema = {
      type: 'object',
      properties: {
        NODE_ENV: { type: 'string' },
        DATABASE_URL: { type: 'string', minLength: 1 },
        ADMIN_KEY: { type: 'string', minLength: 1 },
        CORS_ORIGINS: { type: 'string' },
        QR_JWT_SECRET: { type: 'string' },
        ADMIN_SESSION_SECRET: { type: 'string' },
        PORTAL_JWT_SECRET: { type: 'string' },
      },
      required: ['DATABASE_URL', 'ADMIN_KEY'],
      additionalProperties: true,
    } as const;
    const validate = ajv.compile(schema as any);
    const envObj: Record<string, unknown> = { ...process.env };
    const ok = validate(envObj);
    if (!ok) {
      const errs = (validate.errors || [])
        .map((e) => `${e.instancePath || e.schemaPath}: ${e.message}`)
        .join('; ');
      throw new Error(`[ENV] Validation failed: ${errs}`);
    }
    if (process.env.NODE_ENV === 'production') {
      if (
        !process.env.ADMIN_SESSION_SECRET ||
        !String(process.env.ADMIN_SESSION_SECRET).trim()
      ) {
        throw new Error('[ENV] ADMIN_SESSION_SECRET not configured');
      }
      const qr = process.env.QR_JWT_SECRET || '';
      if (!qr || qr === 'dev_change_me')
        throw new Error(
          '[ENV] QR_JWT_SECRET must be set and not use dev default in production',
        );
      const cors = (process.env.CORS_ORIGINS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (cors.length === 0)
        throw new Error('[ENV] CORS_ORIGINS must be configured in production');
    }
  })();
  const app = await NestFactory.create(AppModule);

  // CORS из ENV (запятая-разделённый список); если не задан — дефолты для локалки
  const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // In production, require explicit CORS_ORIGINS configuration
  if (process.env.NODE_ENV === 'production' && corsOrigins.length === 0) {
    throw new Error('[ENV] CORS_ORIGINS must be configured in production');
  }

  const defaultOrigins = [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
    'http://localhost:3003',
    'http://127.0.0.1:3003',
    'http://localhost:3004',
    'http://127.0.0.1:3004',
  ];

  app.enableCors({
    origin: corsOrigins.length
      ? corsOrigins
      : process.env.NODE_ENV === 'production'
        ? []
        : defaultOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'x-admin-key',
      'x-request-id',
      'idempotency-key',
      'authorization',
    ],
    exposedHeaders: [
      'X-Loyalty-Signature',
      'X-Merchant-Id',
      'X-Signature-Timestamp',
      'X-Request-Id',
      'X-Event-Id',
      'X-Signature-Key-Id',
    ],
    credentials: true,
  });

  // Безопасность и производительность
  app.use(helmet());
  app.use(compression());

  // JSON-логирование запросов
  app.use(
    pinoHttp({
      // редактирование чувствительных полей
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers["x-admin-key"]',
          'req.headers["idempotency-key"]',
          'req.headers["x-metrics-token"]',
          'req.body.userToken',
          'req.body.initData',
          'res.headers["x-loyalty-signature"]',
        ],
        censor: '[REDACTED]',
      },
      autoLogging: true,
      customProps: (req) => {
        const mId =
          (req as any).body?.merchantId ||
          req.headers['x-merchant-id'] ||
          undefined;
        const reqId =
          (req as any).requestId || req.headers['x-request-id'] || undefined;
        try {
          const span = otelTrace.getSpan(otelContext.active());
          const sc = span?.spanContext();
          const traceId = sc?.traceId;
          const spanId = sc?.spanId;
          return { requestId: reqId, merchantId: mId, traceId, spanId } as any;
        } catch {
          return { requestId: reqId, merchantId: mId } as any;
        }
      },
    }),
  );

  // Валидация
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // HTTP metrics interceptor (prom-client с лейблами) + 5xx alerts sampling
  app.useGlobalInterceptors(
    new HttpMetricsInterceptor(app.get(MetricsService), app.get(AlertsService)),
  );

  // Единый JSON-формат ошибок
  app.useGlobalFilters(new HttpErrorFilter());

  // Sentry (опц.)
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.0'),
      environment: process.env.NODE_ENV || 'development',
    });
    const adapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new SentryFilter(adapterHost));
    process.on('unhandledRejection', (reason) => {
      try {
        Sentry.captureException(reason);
      } catch {}
    });
    process.on('uncaughtException', (err) => {
      try {
        Sentry.captureException(err);
      } catch {}
    });
  }

  // Совместимый алиас: пробрасываем /api/v1/* на существующие маршруты, чтобы не ломать клиентов
  const http = app.getHttpAdapter().getInstance();
  http.use('/api/v1', (req, _res, next) => {
    try {
      const orig = req.originalUrl || req.url || '';
      req.url = String(orig).replace(/^\/api\/v1/, '') || '/';
    } catch {}
    next();
  });
  if (process.env.NO_HTTP === '1') {
    await app.init();
    console.log('Workers-only mode: NO_HTTP=1 (HTTP server disabled)');
    return;
  }
  await app.listen(3000);
  console.log(`API on http://localhost:3000`);
}
bootstrap();
