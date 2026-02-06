import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { MetricsService } from '../../core/metrics/metrics.service';
import {
  MetricsSummary,
  parsePromMetrics,
} from '../../core/metrics/metrics.parser';
import { Prisma } from '@prisma/client';
import { OutboxDispatcherWorker } from '../../workers/outbox-dispatcher.worker';
import { NotificationDispatcherWorker } from '../../workers/notification-dispatcher.worker';
import { PointsTtlWorker } from '../../workers/points-ttl.worker';
import { PointsTtlReminderWorker } from '../../workers/points-ttl-reminder.worker';
import { PointsBurnWorker } from '../../workers/points-burn.worker';
import { HoldGcWorker } from '../../workers/hold-gc.worker';
import { IdempotencyGcWorker } from '../../workers/idempotency-gc.worker';
import { EventOutboxGcWorker } from '../../workers/event-outbox-gc.worker';
import { RetentionGcWorker } from '../../workers/retention-gc.worker';
import { EarnActivationWorker } from '../../workers/earn-activation.worker';
import { AutoReturnWorker } from '../../workers/auto-return.worker';
import { BirthdayWorker } from '../../workers/birthday.worker';
import { DataImportWorker } from '../../workers/data-import.worker';
import { CommunicationsDispatcherWorker } from '../communications/communications-dispatcher.worker';
import { AnalyticsAggregatorWorker } from '../analytics/analytics-aggregator.worker';
import { CustomerAudiencesWorker } from '../customer-audiences/customer-audiences.worker';
import { TelegramStaffDigestWorker } from '../telegram/staff-digest.worker';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';

export type WorkerState = {
  name: string;
  expected: boolean;
  reason?: string;
  alive: boolean;
  stale: boolean;
  intervalMs: number;
  lastTickAt: string | null;
  startedAt: string | null;
};

export type ObservabilitySnapshot = {
  version: string;
  env: { nodeEnv: string; appVersion: string };
  metrics: MetricsSummary;
  workers: WorkerState[];
  alerts: ReturnType<AlertsService['getStatus']>;
  incidents?: ReturnType<AlertsService['getRecent']>;
};

@Injectable()
export class OpsAlertMonitor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpsAlertMonitor.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly monitorIntervalMs: number;
  private readonly pendingThreshold: number;
  private readonly deadThreshold: number;
  private readonly workerStaleMs: number;
  private readonly repeatMinutes: number;
  private readonly warmupMs: number;
  private readonly commFailedThreshold: number;
  private readonly commFailedWindowMinutes: number;
  private readonly commStaleThreshold: number;
  private readonly importStaleThreshold: number;
  private readonly http5xxPerMinThreshold: number;
  private readonly httpSlowPerMinThreshold: number;
  private readonly httpSlowThresholdMs: number;
  private readonly outboxDeadDeltaThreshold: number;
  private readonly bootAt = Date.now();
  private lastMetrics: MetricsSummary | null = null;
  private lastMetricsAt: number | null = null;

  constructor(
    private readonly alerts: AlertsService,
    private readonly metrics: MetricsService,
    private readonly outbox: OutboxDispatcherWorker,
    private readonly notifications: NotificationDispatcherWorker,
    private readonly ttl: PointsTtlWorker,
    private readonly ttlReminder: PointsTtlReminderWorker,
    private readonly ttlBurn: PointsBurnWorker,
    private readonly holdGc: HoldGcWorker,
    private readonly idempotencyGc: IdempotencyGcWorker,
    private readonly outboxGc: EventOutboxGcWorker,
    private readonly retentionGc: RetentionGcWorker,
    private readonly earnActivation: EarnActivationWorker,
    private readonly autoReturn: AutoReturnWorker,
    private readonly birthday: BirthdayWorker,
    private readonly dataImport: DataImportWorker,
    private readonly communications: CommunicationsDispatcherWorker,
    private readonly analyticsAggregator: AnalyticsAggregatorWorker,
    private readonly audiences: CustomerAudiencesWorker,
    private readonly staffDigest: TelegramStaffDigestWorker,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {
    this.monitorIntervalMs = Math.max(
      30_000,
      this.config.getNumber('ALERT_MONITOR_INTERVAL_MS', 60000) ?? 60000,
    );
    this.pendingThreshold = Math.max(
      0,
      this.config.getNumber('ALERT_OUTBOX_PENDING_THRESHOLD', 100) ?? 100,
    );
    this.deadThreshold = Math.max(
      0,
      this.config.getNumber('ALERT_OUTBOX_DEAD_THRESHOLD', 5) ?? 5,
    );
    this.workerStaleMs = Math.max(
      60_000,
      (this.config.getNumber('ALERT_WORKER_STALE_MINUTES', 5) ?? 5) * 60_000,
    );
    this.repeatMinutes = Math.max(
      5,
      this.config.getNumber('ALERT_REPEAT_MINUTES', 30) ?? 30,
    );
    this.commFailedThreshold = Math.max(
      0,
      this.config.getNumber('ALERT_COMM_TASK_FAILED_THRESHOLD', 5) ?? 5,
    );
    this.commFailedWindowMinutes = Math.max(
      5,
      this.config.getNumber('ALERT_COMM_TASK_FAILED_WINDOW_MINUTES', 60) ?? 60,
    );
    this.commStaleThreshold = Math.max(
      0,
      this.config.getNumber('ALERT_COMM_TASK_STALE_THRESHOLD', 1) ?? 1,
    );
    this.importStaleThreshold = Math.max(
      0,
      this.config.getNumber('ALERT_DATA_IMPORT_STALE_THRESHOLD', 1) ?? 1,
    );
    this.http5xxPerMinThreshold = Math.max(
      0,
      this.config.getNumber('ALERT_HTTP_5XX_PER_MIN', 0) ?? 0,
    );
    this.httpSlowPerMinThreshold = Math.max(
      0,
      this.config.getNumber('ALERT_HTTP_SLOW_PER_MIN', 0) ?? 0,
    );
    this.httpSlowThresholdMs = Math.max(
      0,
      this.config.getNumber('ALERT_HTTP_SLOW_THRESHOLD_MS', 1500) ?? 1500,
    );
    this.outboxDeadDeltaThreshold = Math.max(
      0,
      this.config.getNumber('ALERT_OUTBOX_DEAD_DELTA', 0) ?? 0,
    );
    this.warmupMs = Math.max(this.monitorIntervalMs * 2, 60_000);
  }

  onModuleInit() {
    this.timer = setInterval(
      () =>
        this.tick().catch((err) =>
          logIgnoredError(err, 'OpsAlertMonitor tick', this.logger),
        ),
      this.monitorIntervalMs,
    );
    if (typeof this.timer.unref === 'function') this.timer.unref();
    this.logger.log(
      `OpsAlertMonitor started, interval=${this.monitorIntervalMs}ms`,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async snapshot(opts?: {
    includeIncidents?: boolean;
  }): Promise<ObservabilitySnapshot> {
    const metricsText = await this.metrics.exportProm();
    const metrics = parsePromMetrics(metricsText);
    const workers = this.collectWorkers();
    const env = {
      nodeEnv:
        this.config.getString('NODE_ENV', 'development') ?? 'development',
      appVersion: this.config.getString('APP_VERSION', 'dev') ?? 'dev',
    };
    return {
      version: env.appVersion,
      env,
      metrics,
      workers,
      alerts: this.alerts.getStatus(),
      incidents: opts?.includeIncidents ? this.alerts.getRecent() : undefined,
    };
  }

  private collectWorkers(): WorkerState[] {
    const workersEnabled = this.config.getBoolean('WORKERS_ENABLED', false);
    const workerStates: WorkerState[] = [];
    const warmupPassed = Date.now() - this.bootAt > this.warmupMs;
    const entries: Array<{
      name: string;
      worker: { lastTickAt: Date | null; startedAt: Date | null } | null;
      intervalMs: number;
      expected: boolean;
      reason?: string;
    }> = [];
    entries.push({
      name: 'outbox',
      worker: this.outbox,
      intervalMs: Math.max(
        5_000,
        this.config.getNumber('OUTBOX_WORKER_INTERVAL_MS', 15000) ?? 15000,
      ),
      expected: workersEnabled,
      reason: workersEnabled ? undefined : 'WORKERS_ENABLED!=1',
    });
    entries.push({
      name: 'notifications',
      worker: this.notifications,
      intervalMs: Math.max(
        5_000,
        this.config.getNumber('NOTIFY_WORKER_INTERVAL_MS', 15000) ?? 15000,
      ),
      expected: workersEnabled,
      reason: workersEnabled ? undefined : 'WORKERS_ENABLED!=1',
    });
    const ttlEnabled =
      workersEnabled && this.config.getBoolean('POINTS_TTL_FEATURE', false);
    entries.push({
      name: 'points_ttl_preview',
      worker: this.ttl,
      intervalMs:
        this.config.getNumber('POINTS_TTL_INTERVAL_MS', 6 * 60 * 60 * 1000) ??
        6 * 60 * 60 * 1000,
      expected: ttlEnabled,
      reason: ttlEnabled ? undefined : 'POINTS_TTL_FEATURE=0',
    });
    const ttlReminderEnabled =
      workersEnabled && this.config.getBoolean('POINTS_TTL_REMINDER', false);
    entries.push({
      name: 'points_ttl_reminder',
      worker: this.ttlReminder,
      intervalMs:
        this.config.getNumber(
          'POINTS_TTL_REMINDER_INTERVAL_MS',
          6 * 60 * 60 * 1000,
        ) ?? 6 * 60 * 60 * 1000,
      expected: ttlReminderEnabled,
      reason: ttlReminderEnabled ? undefined : 'POINTS_TTL_REMINDER=0',
    });
    const ttlBurnEnabled =
      workersEnabled &&
      this.config.getBoolean('POINTS_TTL_BURN', false) &&
      this.config.getBoolean('EARN_LOTS_FEATURE', false);
    entries.push({
      name: 'points_ttl_burn',
      worker: this.ttlBurn,
      intervalMs:
        this.config.getNumber(
          'POINTS_TTL_BURN_INTERVAL_MS',
          6 * 60 * 60 * 1000,
        ) ?? 6 * 60 * 60 * 1000,
      expected: ttlBurnEnabled,
      reason: ttlBurnEnabled ? undefined : 'POINTS_TTL_BURN=0',
    });
    entries.push({
      name: 'hold_gc',
      worker: this.holdGc,
      intervalMs: this.config.getNumber('HOLD_GC_INTERVAL_MS', 30000) ?? 30000,
      expected: workersEnabled,
      reason: workersEnabled ? undefined : 'WORKERS_ENABLED!=1',
    });
    entries.push({
      name: 'idempotency_gc',
      worker: this.idempotencyGc,
      intervalMs:
        this.config.getNumber('IDEMPOTENCY_GC_INTERVAL_MS', 60000) ?? 60000,
      expected: workersEnabled,
      reason: workersEnabled ? undefined : 'WORKERS_ENABLED!=1',
    });
    entries.push({
      name: 'outbox_gc',
      worker: this.outboxGc,
      intervalMs:
        this.config.getNumber('OUTBOX_GC_INTERVAL_MS', 3600000) ?? 3600000,
      expected: workersEnabled,
      reason: workersEnabled ? undefined : 'WORKERS_ENABLED!=1',
    });
    entries.push({
      name: 'retention_gc',
      worker: this.retentionGc,
      intervalMs:
        this.config.getNumber('RETENTION_GC_INTERVAL_MS', 21600000) ?? 21600000,
      expected: workersEnabled,
      reason: workersEnabled ? undefined : 'WORKERS_ENABLED!=1',
    });
    entries.push({
      name: 'earn_activation',
      worker: this.earnActivation,
      intervalMs:
        this.config.getNumber('EARN_ACTIVATION_INTERVAL_MS', 900000) ?? 900000,
      expected: workersEnabled,
      reason: workersEnabled ? undefined : 'WORKERS_ENABLED!=1',
    });
    entries.push({
      name: 'auto_return',
      worker: this.autoReturn,
      intervalMs:
        this.config.getNumber('AUTO_RETURN_WORKER_INTERVAL_MS', 86400000) ??
        86400000,
      expected: workersEnabled,
      reason: workersEnabled ? undefined : 'WORKERS_ENABLED!=1',
    });
    entries.push({
      name: 'birthday',
      worker: this.birthday,
      intervalMs:
        this.config.getNumber(
          'BIRTHDAY_WORKER_INTERVAL_MS',
          6 * 60 * 60 * 1000,
        ) ?? 6 * 60 * 60 * 1000,
      expected: workersEnabled,
      reason: workersEnabled ? undefined : 'WORKERS_ENABLED!=1',
    });
    entries.push({
      name: 'data_import',
      worker: this.dataImport,
      intervalMs: 60000,
      expected: workersEnabled,
      reason: workersEnabled ? undefined : 'WORKERS_ENABLED!=1',
    });
    entries.push({
      name: 'communications',
      worker: this.communications,
      intervalMs:
        this.config.getNumber('COMM_WORKER_INTERVAL_MS', 15000) ?? 15000,
      expected: workersEnabled,
      reason: workersEnabled ? undefined : 'WORKERS_ENABLED!=1',
    });
    entries.push({
      name: 'analytics_aggregator',
      worker: this.analyticsAggregator,
      intervalMs: 24 * 60 * 60 * 1000,
      expected: workersEnabled,
      reason: workersEnabled ? undefined : 'WORKERS_ENABLED!=1',
    });
    entries.push({
      name: 'customer_audiences',
      worker: this.audiences,
      intervalMs: 24 * 60 * 60 * 1000,
      expected: workersEnabled,
      reason: workersEnabled ? undefined : 'WORKERS_ENABLED!=1',
    });
    entries.push({
      name: 'staff_digest',
      worker: this.staffDigest,
      intervalMs: 15 * 60 * 1000,
      expected: workersEnabled,
      reason: workersEnabled ? undefined : 'WORKERS_ENABLED!=1',
    });

    for (const item of entries) {
      const lastTick =
        item.worker?.lastTickAt instanceof Date
          ? item.worker.lastTickAt.getTime()
          : null;
      const started =
        item.worker?.startedAt instanceof Date
          ? item.worker.startedAt.getTime()
          : null;
      const threshold = Math.max(this.workerStaleMs, item.intervalMs * 3);
      let stale = false;
      if (item.expected && warmupPassed) {
        if (lastTick) {
          stale = Date.now() - lastTick > threshold;
        } else if (started) {
          stale = Date.now() - started > threshold;
        } else {
          stale = true;
        }
      }
      workerStates.push({
        name: item.name,
        expected: item.expected,
        reason: item.reason,
        alive: Boolean(item.worker?.startedAt),
        stale,
        intervalMs: item.intervalMs,
        lastTickAt: lastTick ? new Date(lastTick).toISOString() : null,
        startedAt: started ? new Date(started).toISOString() : null,
      });
    }
    return workerStates;
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const snapshot = await this.snapshot();
      this.checkHttpRates(snapshot.metrics);
      this.checkOutbox(snapshot.metrics);
      this.checkWorkers(snapshot.workers);
      await this.checkCommunications();
      await this.checkDataImports();
    } catch (err) {
      this.logger.warn(`OpsAlertMonitor tick failed: ${err}`);
    } finally {
      this.running = false;
    }
  }

  private checkOutbox(metrics: MetricsSummary) {
    if (
      this.pendingThreshold > 0 &&
      metrics.outboxPending > this.pendingThreshold
    ) {
      void this.alerts.notifyIncident({
        title: 'Outbox backlog',
        severity: 'critical',
        lines: [
          `pending=${metrics.outboxPending} (threshold=${this.pendingThreshold})`,
          metrics.outboxDead ? `dead=${metrics.outboxDead}` : undefined,
        ].filter(Boolean) as string[],
        throttleKey: 'outbox:pending',
        throttleMinutes: this.repeatMinutes,
      });
    }
    if (this.deadThreshold > 0 && metrics.outboxDead > this.deadThreshold) {
      void this.alerts.notifyIncident({
        title: 'Outbox DEAD events',
        severity: 'warn',
        lines: [
          `dead=${metrics.outboxDead} (threshold=${this.deadThreshold})`,
          `pending=${metrics.outboxPending}`,
        ],
        throttleKey: 'outbox:dead',
        throttleMinutes: this.repeatMinutes,
      });
    }
  }

  private checkHttpRates(metrics: MetricsSummary) {
    const now = Date.now();
    const prev = this.lastMetrics;
    const prevAt = this.lastMetricsAt;
    this.lastMetrics = metrics;
    this.lastMetricsAt = now;
    if (!prev || !prevAt) return;
    if (now - this.bootAt < this.warmupMs) return;
    const elapsedMinutes = (now - prevAt) / 60000;
    if (!Number.isFinite(elapsedMinutes) || elapsedMinutes <= 0) return;
    const delta = (cur: number, last: number) =>
      cur >= last ? cur - last : cur;

    if (this.http5xxPerMinThreshold > 0) {
      const delta5xx = delta(metrics.http5xx, prev.http5xx);
      const rate = delta5xx / elapsedMinutes;
      if (rate >= this.http5xxPerMinThreshold) {
        void this.alerts.notifyIncident({
          title: 'High 5xx rate',
          severity: 'critical',
          lines: [
            `rate=${rate.toFixed(2)}/min (threshold=${this.http5xxPerMinThreshold})`,
            `windowMinutes=${elapsedMinutes.toFixed(1)}`,
            `delta=${delta5xx}`,
            `total5xx=${metrics.http5xx}`,
          ],
          throttleKey: 'http:5xx_rate',
          throttleMinutes: this.repeatMinutes,
        });
      }
    }

    if (this.httpSlowPerMinThreshold > 0) {
      const deltaSlow = delta(metrics.httpSlow, prev.httpSlow);
      const rate = deltaSlow / elapsedMinutes;
      if (rate >= this.httpSlowPerMinThreshold) {
        void this.alerts.notifyIncident({
          title: 'High slow HTTP rate',
          severity: 'warn',
          lines: [
            `rate=${rate.toFixed(2)}/min (threshold=${this.httpSlowPerMinThreshold})`,
            `windowMinutes=${elapsedMinutes.toFixed(1)}`,
            `delta=${deltaSlow}`,
            `slowThresholdMs=${this.httpSlowThresholdMs}`,
          ],
          throttleKey: 'http:slow_rate',
          throttleMinutes: this.repeatMinutes,
        });
      }
    }

    if (this.outboxDeadDeltaThreshold > 0) {
      const deltaDead = delta(metrics.outboxDead, prev.outboxDead);
      if (deltaDead >= this.outboxDeadDeltaThreshold) {
        void this.alerts.notifyIncident({
          title: 'Outbox dead growth',
          severity: 'warn',
          lines: [
            `delta=${deltaDead} (threshold=${this.outboxDeadDeltaThreshold})`,
            `windowMinutes=${elapsedMinutes.toFixed(1)}`,
            `totalDead=${metrics.outboxDead}`,
          ],
          throttleKey: 'outbox:dead_delta',
          throttleMinutes: this.repeatMinutes,
        });
      }
    }
  }

  private checkWorkers(workers: WorkerState[]) {
    for (const w of workers) {
      if (!w.expected || !w.stale) continue;
      const last =
        w.lastTickAt || w.startedAt ? w.lastTickAt || w.startedAt : 'нет тиков';
      void this.alerts.notifyIncident({
        title: `Worker stalled: ${w.name}`,
        severity: 'critical',
        lines: [`lastTickAt: ${last}`, `intervalMs: ${w.intervalMs}`],
        throttleKey: `worker:${w.name}`,
        throttleMinutes: this.repeatMinutes,
      });
    }
  }

  private async checkCommunications() {
    if (this.commFailedThreshold <= 0 && this.commStaleThreshold <= 0) return;
    if (!this.config.getBoolean('WORKERS_ENABLED', false)) return;
    const now = Date.now();
    if (this.commStaleThreshold > 0) {
      const staleMs = Math.max(
        60_000,
        this.config.getNumber('COMM_TASK_STALE_MS', 20 * 60 * 1000) ??
          20 * 60 * 1000,
      );
      const staleBefore = new Date(now - staleMs);
      const staleCount = await this.prisma.communicationTask.count({
        where: {
          status: 'RUNNING',
          archivedAt: null,
          startedAt: { lt: staleBefore },
        },
      });
      if (staleCount >= this.commStaleThreshold) {
        void this.alerts.notifyIncident({
          title: 'Communications tasks stuck',
          severity: 'critical',
          lines: [
            `stale=${staleCount} (threshold=${this.commStaleThreshold})`,
            `staleMs=${staleMs}`,
          ],
          throttleKey: 'comm:stale',
          throttleMinutes: this.repeatMinutes,
        });
      }
    }

    if (this.commFailedThreshold > 0) {
      const windowMinutes = this.commFailedWindowMinutes;
      const windowAfter = new Date(now - windowMinutes * 60_000);
      const maxRetries = Math.max(
        0,
        this.config.getNumber('COMM_TASK_MAX_RETRIES', 2) ?? 2,
      );
      const failedWhere: Prisma.CommunicationTaskWhereInput = {
        status: 'FAILED',
        archivedAt: null,
        failedAt: { gte: windowAfter },
      };
      if (maxRetries > 0) {
        failedWhere.stats = {
          path: ['attempts'],
          gte: maxRetries,
        } satisfies Prisma.JsonFilter;
      }
      const failedCount = await this.prisma.communicationTask.count({
        where: failedWhere,
      });
      if (failedCount >= this.commFailedThreshold) {
        void this.alerts.notifyIncident({
          title: 'Communications task failures',
          severity: 'warn',
          lines: [
            `failed=${failedCount} (threshold=${this.commFailedThreshold})`,
            `windowMinutes=${windowMinutes}`,
            `maxRetries=${maxRetries}`,
          ],
          throttleKey: 'comm:failed',
          throttleMinutes: this.repeatMinutes,
        });
      }
    }
  }

  private async checkDataImports() {
    if (this.importStaleThreshold <= 0) return;
    if (!this.config.getBoolean('WORKERS_ENABLED', false)) return;
    const staleMs = Math.max(
      60_000,
      this.config.getNumber('DATA_IMPORT_STALE_MS', 2 * 60 * 60 * 1000) ??
        2 * 60 * 60 * 1000,
    );
    const staleBefore = new Date(Date.now() - staleMs);
    const staleCount = await this.prisma.dataImportJob.count({
      where: {
        status: 'PROCESSING',
        startedAt: { lt: staleBefore },
      },
    });
    if (staleCount >= this.importStaleThreshold) {
      void this.alerts.notifyIncident({
        title: 'Data import stalled',
        severity: 'critical',
        lines: [
          `stale=${staleCount} (threshold=${this.importStaleThreshold})`,
          `staleMs=${staleMs}`,
        ],
        throttleKey: 'data_import:stale',
        throttleMinutes: this.repeatMinutes,
      });
    }
  }
}
