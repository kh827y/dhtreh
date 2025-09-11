import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import { HttpAdapterHost } from '@nestjs/core';
import { SentryFilter } from './sentry.filter';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsService } from './metrics.service';
// OpenTelemetry (инициализация по флагу)
import './otel';
import { context as otelContext, trace as otelTrace } from '@opentelemetry/api';
import { HttpErrorFilter } from './http-error.filter';

async function bootstrap() {
  // Fail-fast ENV validation
  (function validateEnv() {
    const must = ['DATABASE_URL', 'ADMIN_KEY'] as const;
    for (const k of must) {
      if (!process.env[k] || String(process.env[k]).trim() === '') {
        throw new Error(`[ENV] ${k} not configured`);
      }
    }
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.ADMIN_SESSION_SECRET) throw new Error('[ENV] ADMIN_SESSION_SECRET not configured');
      const qr = process.env.QR_JWT_SECRET || '';
      if (!qr || qr === 'dev_change_me') throw new Error('[ENV] QR_JWT_SECRET must be set and not use dev default in production');
    }
  })();
  const app = await NestFactory.create(AppModule);

  // CORS из ENV (запятая-разделённый список); если не задан — дефолты для локалки
  const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const defaultOrigins = [
    'http://localhost:3001','http://127.0.0.1:3001',
    'http://localhost:3002','http://127.0.0.1:3002',
    'http://localhost:3003','http://127.0.0.1:3003',
  ];
  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : defaultOrigins,
    methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
    allowedHeaders: ['Content-Type','x-admin-key','x-request-id','x-staff-key','x-bridge-signature','idempotency-key'],
    exposedHeaders: ['X-Loyalty-Signature','X-Merchant-Id','X-Signature-Timestamp','X-Request-Id','X-Event-Id','X-Signature-Key-Id'],
  });

  // Безопасность и производительность
  app.use(helmet());
  app.use(compression());

  // JSON-логирование запросов
  app.use(pinoHttp({
    // редактирование чувствительных полей
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-admin-key"]',
        'req.headers["x-staff-key"]',
        'req.headers["x-bridge-signature"]',
        'req.headers["idempotency-key"]',
        'req.headers["x-metrics-token"]',
        'req.body.userToken',
        'req.body.initData',
        'res.headers["x-loyalty-signature"]',
      ],
      censor: '[REDACTED]'
    },
    autoLogging: true,
    customProps: (req) => {
      const mId = (req as any).body?.merchantId || req.headers['x-merchant-id'] || undefined;
      const reqId = (req as any).requestId || req.headers['x-request-id'] || undefined;
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
  }));

  // Валидация
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // HTTP metrics interceptor (prom-client с лейблами)
  app.useGlobalInterceptors(new HttpMetricsInterceptor(app.get(MetricsService)));

  // Единый JSON-формат ошибок
  app.useGlobalFilters(new HttpErrorFilter());

  // Sentry (опц.)
  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.0'), environment: process.env.NODE_ENV || 'development' });
    const adapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new SentryFilter(adapterHost));
    process.on('unhandledRejection', (reason) => { try { Sentry.captureException(reason); } catch {} });
    process.on('uncaughtException', (err) => { try { Sentry.captureException(err); } catch {} });
  }

  // Swagger (draft)
  const cfg = new DocumentBuilder()
    .setTitle('Loyalty API')
    .setDescription('Draft OpenAPI for loyalty endpoints')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, cfg);
  SwaggerModule.setup('docs', app, document);
  // JSON спецификация
  try {
    const httpInst = app.getHttpAdapter().getInstance();
    httpInst.get('/openapi.json', (_req: any, res: any) => res.json(document));
    // Postman collection export from OpenAPI
    httpInst.get('/postman.json', (_req: any, res: any) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const converter = require('openapi-to-postmanv2');
        converter.convert({ type: 'json', data: document }, { folderStrategy: 'Tags' }, (err: any, result: any) => {
          if (err || !result?.result) {
            res.status(500).json({ error: 'ConversionError', message: String(err || result?.reason || 'Unknown') });
            return;
          }
          res.json(result.output[0].data);
        });
      } catch (e: any) {
        res.status(500).json({ error: 'ConversionError', message: String(e?.message || e) });
      }
    });
  } catch {}

  // Совместимый алиас: пробрасываем /api/v1/* на существующие маршруты, чтобы не ломать клиентов
  const http = app.getHttpAdapter().getInstance();
  http.use('/api/v1', (req, _res, next) => {
    try {
      const orig = (req as any).originalUrl || req.url || '';
      (req as any).url = String(orig).replace(/^\/api\/v1/, '') || '/';
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
