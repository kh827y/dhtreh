import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app/app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import Ajv from 'ajv';
import * as Sentry from '@sentry/node';
import { HttpAdapterHost } from '@nestjs/core';
import { SentryFilter } from './core/filters/sentry.filter';
import { HttpMetricsInterceptor } from './core/interceptors/http-metrics.interceptor';
import { MetricsService } from './core/metrics/metrics.service';
import { AlertsService } from './modules/alerts/alerts.service';
// OpenTelemetry (инициализация по флагу)
import './core/observability/otel';
import { context as otelContext, trace as otelTrace } from '@opentelemetry/api';
import { HttpErrorFilter } from './core/filters/http-error.filter';
import { AppConfigService } from './core/config/app-config.service';
import { logIgnoredError } from './shared/logging/ignore-error.util';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  requestId?: string;
  url?: string;
  originalUrl?: string;
};

type ExpressMiddleware = (req: unknown, res: unknown, next: () => void) => void;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(
  source: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' ? value : undefined;
}

function getHeader(req: RequestLike, name: string): string | undefined {
  const value = req.headers?.[name];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

async function bootstrap() {
  const logger = new Logger('bootstrap');
  const config = new AppConfigService();
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
    if (config.isProduction()) {
      if (!config.getAdminSessionSecret()) {
        throw new Error('[ENV] ADMIN_SESSION_SECRET not configured');
      }
      const qr = config.getQrJwtSecret();
      if (!qr || qr === 'dev_change_me')
        throw new Error(
          '[ENV] QR_JWT_SECRET must be set and not use dev default in production',
        );
      const cors = config.getCorsOrigins();
      if (cors.length === 0)
        throw new Error('[ENV] CORS_ORIGINS must be configured in production');
    }
  })();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();

  const trustProxyRaw = String(config.getTrustProxy() || '').trim();
  if (trustProxyRaw) {
    const normalized = trustProxyRaw.toLowerCase();
    const trustProxy = ['1', 'true', 'yes'].includes(normalized)
      ? true
      : ['0', 'false', 'no'].includes(normalized)
        ? false
        : trustProxyRaw;
    app.set('trust proxy', trustProxy);
  }

  // CORS из ENV (запятая-разделённый список); если не задан — дефолты для локалки
  const corsOrigins = config.getCorsOrigins();

  // In production, require explicit CORS_ORIGINS configuration
  if (config.isProduction() && corsOrigins.length === 0) {
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
      : config.isProduction()
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
  const compressionMiddleware =
    compression as unknown as () => ExpressMiddleware;
  app.use(compressionMiddleware());
  app.disable('x-powered-by');

  const logLevel = config.getLogLevel();
  const logIgnorePaths = config.getLogHttpIgnorePaths();
  const autoLogging =
    logIgnorePaths.length > 0
      ? {
          ignore: (req: RequestLike) => {
            const url = req.originalUrl || req.url || '';
            return logIgnorePaths.some((prefix) => url.startsWith(prefix));
          },
        }
      : true;

  // JSON-логирование запросов
  app.use(
    pinoHttp({
      level: logLevel,
      // редактирование чувствительных полей
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers["x-admin-key"]',
          'req.headers["x-admin-otp"]',
          'req.headers["idempotency-key"]',
          'req.headers["x-api-key"]',
          'req.headers["x-metrics-token"]',
          'req.headers["x-telegram-bot-api-secret-token"]',
          'req.headers.cookie',
          'req.body.userToken',
          'req.body.initData',
          'req.body.password',
          'req.body.pin',
          'req.body.code',
          'req.body.totp',
          'req.body.otp',
          'req.body.refreshToken',
          'req.body.accessToken',
          'res.headers["set-cookie"]',
          'res.headers["x-loyalty-signature"]',
        ],
        censor: '[REDACTED]',
      },
      autoLogging,
      customProps: (req: RequestLike) => {
        const body = asRecord(req.body);
        const mId =
          readString(body, 'merchantId') || getHeader(req, 'x-merchant-id');
        const reqId = req.requestId || getHeader(req, 'x-request-id');
        try {
          const span = otelTrace.getSpan(otelContext.active());
          const sc = span?.spanContext();
          const traceId = sc?.traceId;
          const spanId = sc?.spanId;
          return { requestId: reqId, merchantId: mId, traceId, spanId };
        } catch (err) {
          logIgnoredError(err, 'pino customProps', undefined, 'debug');
          return { requestId: reqId, merchantId: mId };
        }
      },
    }),
  );

  // Валидация
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // HTTP metrics interceptor (prom-client с лейблами) + 5xx alerts sampling
  app.useGlobalInterceptors(
    new HttpMetricsInterceptor(
      app.get(MetricsService),
      app.get(AlertsService),
      config,
    ),
  );

  // Единый JSON-формат ошибок
  app.useGlobalFilters(new HttpErrorFilter());

  // Sentry (опц.)
  const sentryDsn = config.getSentryDsn();
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      tracesSampleRate: config.getSentryTracesSampleRate(),
      environment: config.getNodeEnv(),
    });
    const adapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new SentryFilter(adapterHost, config));
    process.on('unhandledRejection', (reason) => {
      try {
        Sentry.captureException(reason);
      } catch (err) {
        logIgnoredError(err, 'main sentry rejection', logger, 'debug');
      }
    });
    process.on('uncaughtException', (err) => {
      try {
        Sentry.captureException(err);
      } catch (error) {
        logIgnoredError(error, 'main sentry exception', logger, 'debug');
      }
    });
  }

  // Совместимый алиас: пробрасываем /api/v1/* на существующие маршруты, чтобы не ломать клиентов
  const http = app.getHttpAdapter().getInstance();
  http.use('/api/v1', (req, _res, next) => {
    try {
      const orig = req.originalUrl || req.url || '';
      req.url = String(orig).replace(/^\/api\/v1/, '') || '/';
    } catch (err) {
      logIgnoredError(err, 'main api alias', logger, 'debug');
    }
    next();
  });
  if (config.getNoHttp()) {
    await app.init();
    logger.log('Workers-only mode: NO_HTTP=1 (HTTP server disabled)');
    return;
  }
  const rawPort =
    process.env.PORT ?? process.env.APP_PORT ?? process.env.API_PORT ?? '3000';
  const parsedPort = Number(rawPort);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
  await app.listen(port);
  logger.log(`API on http://localhost:${port}`);
}
void bootstrap();
