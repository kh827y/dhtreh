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
import { OutboxDispatcherWorker } from '../../workers/outbox-dispatcher.worker';
import { NotificationDispatcherWorker } from '../../workers/notification-dispatcher.worker';
import { PointsTtlWorker } from '../../workers/points-ttl.worker';
import { PointsTtlReminderWorker } from '../../workers/points-ttl-reminder.worker';
import { PointsBurnWorker } from '../../workers/points-burn.worker';
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
  private readonly bootAt = Date.now();

  constructor(
    private readonly alerts: AlertsService,
    private readonly metrics: MetricsService,
    private readonly outbox: OutboxDispatcherWorker,
    private readonly notifications: NotificationDispatcherWorker,
    private readonly ttl: PointsTtlWorker,
    private readonly ttlReminder: PointsTtlReminderWorker,
    private readonly ttlBurn: PointsBurnWorker,
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
      nodeEnv: this.config.getString('NODE_ENV', 'development') ?? 'development',
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
        this.config.getNumber('POINTS_TTL_BURN_INTERVAL_MS', 6 * 60 * 60 * 1000) ??
        6 * 60 * 60 * 1000,
      expected: ttlBurnEnabled,
      reason: ttlBurnEnabled ? undefined : 'POINTS_TTL_BURN=0',
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
      this.checkOutbox(snapshot.metrics);
      this.checkWorkers(snapshot.workers);
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
}
