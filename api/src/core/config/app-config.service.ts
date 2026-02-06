import { Injectable } from '@nestjs/common';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';

@Injectable()
export class AppConfigService {
  getNodeEnv(): string {
    return this.getString('NODE_ENV', 'development') || 'development';
  }

  isProduction(): boolean {
    return this.getNodeEnv() === 'production';
  }

  isTest(): boolean {
    return this.getNodeEnv() === 'test';
  }

  getString(key: string, fallback?: string): string | undefined {
    const value = process.env[key];
    if (value === undefined || value === '') return fallback;
    return value;
  }

  getNumber(key: string, fallback?: number): number | undefined {
    const raw = this.getString(key);
    if (raw === undefined) return fallback;
    const num = Number(raw);
    return Number.isFinite(num) ? num : fallback;
  }

  getBoolean(key: string, fallback = false): boolean {
    const raw = this.getString(key);
    if (raw === undefined) return fallback;
    const normalized = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
  }

  getOptionalBoolean(key: string): boolean | undefined {
    const raw = this.getString(key);
    if (raw === undefined) return undefined;
    return this.getBoolean(key, false);
  }

  getJson<T = unknown>(key: string, fallback?: T): T | undefined {
    const raw = this.getString(key);
    if (raw === undefined) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      logIgnoredError(
        err,
        `AppConfigService getJson(${key})`,
        undefined,
        'debug',
      );
      return fallback;
    }
  }

  getAccessGroupPresetsPath(): string | undefined {
    return this.getString('ACCESS_GROUP_PRESETS_PATH');
  }

  getRedisUrl(): string | undefined {
    return this.getString('REDIS_URL');
  }

  getOtelEnabled(): boolean {
    return (
      this.getBoolean('OTEL_ENABLED') ||
      Boolean(this.getString('OTEL_EXPORTER_OTLP_ENDPOINT'))
    );
  }

  getOtelExporterEndpoint(): string {
    return (
      this.getString('OTEL_EXPORTER_OTLP_ENDPOINT') ||
      'http://localhost:4318/v1/traces'
    );
  }

  getOtelServiceName(): string {
    return this.getString('OTEL_SERVICE_NAME', 'loyalty-api') || 'loyalty-api';
  }

  getAppVersion(): string {
    return this.getString('APP_VERSION', 'dev') || 'dev';
  }

  getAdminSessionSecret(): string | undefined {
    return this.getString('ADMIN_SESSION_SECRET');
  }

  getQrJwtSecret(): string {
    return this.getString('QR_JWT_SECRET', '') || '';
  }

  getQrJwtSecretNext(): string | undefined {
    return this.getString('QR_JWT_SECRET_NEXT');
  }

  getQrJwtKid(): string | undefined {
    return this.getString('QR_JWT_KID');
  }

  getPortalJwtSecret(): string {
    return this.getString('PORTAL_JWT_SECRET', '') || '';
  }

  getPortalRefreshSecret(): string {
    return this.getString('PORTAL_REFRESH_SECRET', '') || '';
  }

  getCorsOrigins(): string[] {
    const raw = this.getString('CORS_ORIGINS', '');
    if (!raw) return [];
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  getTrustProxy(): string | undefined {
    return this.getString('TRUST_PROXY');
  }

  getLogLevel(): string {
    return (
      this.getString('LOG_LEVEL') || (this.isProduction() ? 'info' : 'debug')
    );
  }

  getLogHttpIgnorePaths(): string[] {
    const raw = this.getString('LOG_HTTP_IGNORE_PATHS', '');
    if (!raw) return [];
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  getSentryDsn(): string | undefined {
    return this.getString('SENTRY_DSN');
  }

  getSentryTracesSampleRate(): number {
    return this.getNumber('SENTRY_TRACES_SAMPLE_RATE', 0) ?? 0;
  }

  getNoHttp(): boolean {
    return this.getBoolean('NO_HTTP');
  }

  getWorkerMetricsPort(): number {
    return this.getNumber('WORKER_METRICS_PORT', 0) ?? 0;
  }

  getWorkerProgressHeartbeatMs(): number {
    return this.getNumber('WORKER_PROGRESS_HEARTBEAT_MS', 30000) ?? 30000;
  }

  getWorkerStaleGraceMs(): number {
    return this.getNumber('WORKER_STALE_GRACE_MS', 0) ?? 0;
  }

  getWorkerLockMissGraceMs(): number {
    return this.getNumber('WORKER_LOCK_MISS_GRACE_MS', 300000) ?? 300000;
  }

  getTelegramHttpTimeoutMs(): number {
    return this.getNumber('TELEGRAM_HTTP_TIMEOUT_MS', 15000) ?? 15000;
  }

  getWebsiteUrl(): string | undefined {
    return this.getString('WEBSITE_URL') || this.getString('PORTAL_PUBLIC_URL');
  }

  getPortalPublicUrl(): string | undefined {
    return this.getString('PORTAL_PUBLIC_URL');
  }

  isEarnLotsEnabled(): boolean {
    return this.getBoolean('EARN_LOTS_FEATURE');
  }

  isLedgerEnabled(): boolean {
    return this.getBoolean('LEDGER_FEATURE');
  }

  isPointsTtlFeatureEnabled(): boolean {
    return this.getBoolean('POINTS_TTL_FEATURE');
  }

  isPointsTtlBurnEnabled(): boolean {
    return this.getBoolean('POINTS_TTL_BURN');
  }

  isPointsTtlReminderEnabled(): boolean {
    return this.getBoolean('POINTS_TTL_REMINDER');
  }

  isWorkersEnabled(): boolean {
    return this.getBoolean('WORKERS_ENABLED', true);
  }

  getAlerts5xxSampleRate(): number {
    return this.getNumber('ALERTS_5XX_SAMPLE_RATE', 0) ?? 0;
  }

  getIdempotencyTtlHours(): number {
    return this.getNumber('IDEMPOTENCY_TTL_HOURS', 72) ?? 72;
  }

  getTtlReconciliationWindowDays(): number {
    return this.getNumber('TTL_RECONCILIATION_WINDOW_DAYS', 365) ?? 365;
  }

  getCookieSecure(): boolean | undefined {
    return this.getOptionalBoolean('COOKIE_SECURE');
  }
}
