import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { MetricsService } from '../metrics.service';
import { MetricsSummary, parsePromMetrics } from '../metrics.parser';
import { OutboxDispatcherWorker } from '../outbox-dispatcher.worker';
import { NotificationDispatcherWorker } from '../notification-dispatcher.worker';
import { PointsTtlWorker } from '../points-ttl.worker';
import { PointsTtlReminderWorker } from '../points-ttl-reminder.worker';
import { PointsBurnWorker } from '../points-burn.worker';

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
  private readonly monitorIntervalMs = Math.max(
    30_000,
    Number(process.env.ALERT_MONITOR_INTERVAL_MS || '60000'),
  );
  private readonly pendingThreshold = Math.max(
    0,
    Number(process.env.ALERT_OUTBOX_PENDING_THRESHOLD || '100'),
  );
  private readonly deadThreshold = Math.max(
    0,
    Number(process.env.ALERT_OUTBOX_DEAD_THRESHOLD || '5'),
  );
  private readonly workerStaleMs = Math.max(
    60_000,
    Number(process.env.ALERT_WORKER_STALE_MINUTES || '5') * 60_000,
  );
  private readonly repeatMinutes = Math.max(
    5,
    Number(process.env.ALERT_REPEAT_MINUTES || '30'),
  );
  private readonly warmupMs = Math.max(this.monitorIntervalMs * 2, 60_000);
  private readonly bootAt = Date.now();

  constructor(
    private readonly alerts: AlertsService,
    private readonly metrics: MetricsService,
    private readonly outbox: OutboxDispatcherWorker,
    private readonly notifications: NotificationDispatcherWorker,
    private readonly ttl: PointsTtlWorker,
    private readonly ttlReminder: PointsTtlReminderWorker,
    private readonly ttlBurn: PointsBurnWorker,
  ) {}

  onModuleInit() {
    this.timer = setInterval(
      () => this.tick().catch(() => {}),
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
      nodeEnv: process.env.NODE_ENV || 'development',
      appVersion: process.env.APP_VERSION || 'dev',
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
    const workersEnabled = process.env.WORKERS_ENABLED !== '0';
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
        Number(process.env.OUTBOX_WORKER_INTERVAL_MS || '15000'),
      ),
      expected: workersEnabled,
      reason: workersEnabled ? undefined : 'WORKERS_ENABLED=0',
    });
    entries.push({
      name: 'notifications',
      worker: this.notifications,
      intervalMs: Math.max(
        5_000,
        Number(process.env.NOTIFY_WORKER_INTERVAL_MS || '15000'),
      ),
      expected: workersEnabled,
      reason: workersEnabled ? undefined : 'WORKERS_ENABLED=0',
    });
    const ttlEnabled = workersEnabled && process.env.POINTS_TTL_FEATURE === '1';
    entries.push({
      name: 'points_ttl_preview',
      worker: this.ttl,
      intervalMs: Number(
        process.env.POINTS_TTL_INTERVAL_MS || 6 * 60 * 60 * 1000,
      ),
      expected: ttlEnabled,
      reason: ttlEnabled ? undefined : 'POINTS_TTL_FEATURE=0',
    });
    const ttlReminderEnabled =
      workersEnabled && process.env.POINTS_TTL_REMINDER === '1';
    entries.push({
      name: 'points_ttl_reminder',
      worker: this.ttlReminder,
      intervalMs: Number(
        process.env.POINTS_TTL_REMINDER_INTERVAL_MS || 6 * 60 * 60 * 1000,
      ),
      expected: ttlReminderEnabled,
      reason: ttlReminderEnabled ? undefined : 'POINTS_TTL_REMINDER=0',
    });
    const ttlBurnEnabled =
      workersEnabled &&
      process.env.POINTS_TTL_BURN === '1' &&
      process.env.EARN_LOTS_FEATURE === '1';
    entries.push({
      name: 'points_ttl_burn',
      worker: this.ttlBurn,
      intervalMs: Number(
        process.env.POINTS_TTL_BURN_INTERVAL_MS || 6 * 60 * 60 * 1000,
      ),
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
