import { OpsAlertMonitor, type WorkerState } from './ops-alert-monitor.service';
import { AppConfigService } from '../../core/config/app-config.service';
import type { AlertsService } from './alerts.service';
import type { MetricsService } from '../../core/metrics/metrics.service';
import type { PrismaService } from '../../core/prisma/prisma.service';

type RuntimeWorker = {
  startedAt: Date | null;
  lastTickAt: Date | null;
  lastProgressAt: Date | null;
  lastLockMissAt: Date | null;
  lockMissCount: number;
  running: boolean;
};

const createWorkerRuntime = (runtime: Partial<RuntimeWorker> = {}): RuntimeWorker => {
  const now = Date.now();
  return {
    startedAt: new Date(now - 10 * 60_000),
    lastTickAt: new Date(now - 10 * 60_000),
    lastProgressAt: new Date(now - 10 * 60_000),
    lastLockMissAt: null,
    lockMissCount: 0,
    running: false,
    ...runtime,
  };
};

const createMonitor = (workerRuntime: Partial<RuntimeWorker> = {}) => {
  const runtime = createWorkerRuntime(workerRuntime);
  const alerts = {
    notifyIncident: jest.fn(),
    getStatus: jest.fn().mockReturnValue({}),
    getRecent: jest.fn().mockReturnValue([]),
  } as unknown as AlertsService;
  const metrics = {
    setGauge: jest.fn(),
    exportProm: jest.fn().mockResolvedValue(''),
  } as unknown as MetricsService;
  const prisma = {
    communicationTask: { count: jest.fn().mockResolvedValue(0) },
    dataImportJob: { count: jest.fn().mockResolvedValue(0) },
  } as unknown as PrismaService;
  const config = new AppConfigService();
  const monitor = new OpsAlertMonitor(
    alerts,
    metrics,
    runtime as unknown as never, // outbox
    runtime as unknown as never, // notifications
    runtime as unknown as never, // ttl
    runtime as unknown as never, // ttl reminder
    runtime as unknown as never, // ttl burn
    runtime as unknown as never, // hold gc
    runtime as unknown as never, // idempotency gc
    runtime as unknown as never, // outbox gc
    runtime as unknown as never, // retention gc
    runtime as unknown as never, // earn activation
    runtime as unknown as never, // auto return
    runtime as unknown as never, // birthday
    runtime as unknown as never, // data import
    runtime as unknown as never, // communications
    runtime as unknown as never, // analytics aggregator
    runtime as unknown as never, // audiences
    runtime as unknown as never, // staff digest
    prisma,
    config,
  );
  (monitor as unknown as { bootAt: number }).bootAt = Date.now() - 10 * 60_000;
  return {
    monitor,
    alerts: alerts as unknown as { notifyIncident: jest.Mock },
  };
};

describe('OpsAlertMonitor', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      WORKERS_ENABLED: '1',
      ALERT_WORKER_STALE_MINUTES: '1',
      WORKER_STALE_GRACE_MS: '0',
      WORKER_PROGRESS_HEARTBEAT_MS: '30000',
      WORKER_LOCK_MISS_GRACE_MS: '300000',
      ALERT_MONITOR_INTERVAL_MS: '60000',
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('does not mark worker stale when recent lock miss is within grace window', () => {
    const { monitor } = createMonitor({
      lastTickAt: new Date(Date.now() - 10 * 60_000),
      lastProgressAt: new Date(Date.now() - 10 * 60_000),
      lastLockMissAt: new Date(Date.now() - 30_000),
      lockMissCount: 2,
      running: false,
    });

    const workers = (monitor as unknown as { collectWorkers: () => WorkerState[] }).collectWorkers();
    const outbox = workers.find((worker) => worker.name === 'outbox');

    expect(outbox).toBeDefined();
    expect(outbox?.stale).toBe(false);
    expect(outbox?.lockMissCount).toBe(2);
  });

  it('marks worker stale when no recent activity and no lock-miss grace', () => {
    const { monitor } = createMonitor({
      lastTickAt: new Date(Date.now() - 10 * 60_000),
      lastProgressAt: new Date(Date.now() - 10 * 60_000),
      lastLockMissAt: null,
      running: false,
    });

    const workers = (monitor as unknown as { collectWorkers: () => WorkerState[] }).collectWorkers();
    const outbox = workers.find((worker) => worker.name === 'outbox');

    expect(outbox).toBeDefined();
    expect(outbox?.stale).toBe(true);
  });

  it('sends incidents only for expected stale workers', () => {
    const { monitor, alerts } = createMonitor();
    const input: WorkerState[] = [
      {
        name: 'outbox',
        expected: true,
        reason: undefined,
        alive: true,
        stale: true,
        running: false,
        intervalMs: 15000,
        lastTickAt: null,
        lastProgressAt: null,
        lastLockMissAt: null,
        lockMissCount: 0,
        startedAt: null,
      },
      {
        name: 'notifications',
        expected: false,
        reason: 'WORKERS_ENABLED!=1',
        alive: false,
        stale: true,
        running: false,
        intervalMs: 15000,
        lastTickAt: null,
        lastProgressAt: null,
        lastLockMissAt: null,
        lockMissCount: 0,
        startedAt: null,
      },
    ];

    (monitor as unknown as { checkWorkers: (workers: WorkerState[]) => void }).checkWorkers(input);

    expect(alerts.notifyIncident).toHaveBeenCalledTimes(1);
    expect(alerts.notifyIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Worker stalled: outbox',
        throttleKey: 'worker:outbox',
      }),
    );
  });
});
