import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  Prisma,
  CommunicationChannel,
  type CommunicationTask,
} from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MetricsService } from '../../core/metrics/metrics.service';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import { pgTryAdvisoryLock, pgAdvisoryUnlock } from '../../shared/pg-lock.util';
import { isSystemAllAudience } from '../customer-audiences/audience.utils';
import { applyCurlyPlaceholders } from './message-placeholders';
import { AppConfigService } from '../../core/config/app-config.service';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';
import { asRecord as asRecordShared } from '../../shared/common/input.util';

type TelegramRecipient = {
  customerId: string;
  tgId: string;
  name: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const readErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }
  if (
    typeof error === 'number' ||
    typeof error === 'boolean' ||
    typeof error === 'bigint'
  ) {
    return String(error);
  }
  return Object.prototype.toString.call(error) as string;
};

@Injectable()
export class CommunicationsDispatcherWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CommunicationsDispatcherWorker.name);
  private readonly workerLockName = 'worker:communications_dispatcher';
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  public startedAt: Date | null = null;
  public lastTickAt: Date | null = null;
  public lastProgressAt: Date | null = null;
  public lastLockMissAt: Date | null = null;
  public lockMissCount = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly telegramBots: TelegramBotService,
    private readonly config: AppConfigService,
  ) {}

  onModuleInit() {
    if (!this.config.getBoolean('WORKERS_ENABLED', false)) {
      this.logger.log('Communications worker disabled (WORKERS_ENABLED!=1)');
      return;
    }
    const intervalMs =
      this.config.getNumber('COMM_WORKER_INTERVAL_MS', 15000) ?? 15000;
    this.timer = setInterval(
      () =>
        this.tick().catch((err) =>
          logIgnoredError(
            err,
            'CommunicationsDispatcherWorker tick',
            this.logger,
          ),
        ),
      intervalMs,
    );
    if (typeof this.timer.unref === 'function') this.timer.unref();
    this.logger.log(
      `CommunicationsDispatcherWorker started, interval=${intervalMs}ms`,
    );
    this.startedAt = new Date();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private markTick() {
    this.lastTickAt = new Date();
    this.lastProgressAt = this.lastTickAt;
  }

  private markProgress() {
    this.lastProgressAt = new Date();
  }

  private markLockMiss() {
    this.lockMissCount += 1;
    this.lastLockMissAt = new Date();
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    const lock = await pgTryAdvisoryLock(this.prisma, this.workerLockName);
    if (!lock.ok) {
      this.markLockMiss();
      this.running = false;
      return;
    }
    try {
      this.markTick();
      await this.recoverStaleTasks();
      this.markProgress();
      await this.requeueFailedTasks();
      this.markProgress();
      const due = await this.prisma.communicationTask.findMany({
        where: {
          status: 'SCHEDULED',
          channel: {
            in: [CommunicationChannel.TELEGRAM, CommunicationChannel.PUSH],
          },
          archivedAt: null,
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        },
        orderBy: { createdAt: 'asc' },
        take: this.config.getNumber('COMM_WORKER_BATCH', 10) ?? 10,
      });
      for (const task of due) {
        this.markProgress();
        if (task.channel === CommunicationChannel.TELEGRAM) {
          await this.processTelegramTask(task).catch((err) => {
            this.logger.error(
              `Ошибка обработки telegram-задачи ${task.id}: ${readErrorMessage(err)}`,
            );
          });
        } else if (task.channel === CommunicationChannel.PUSH) {
          await this.processPushTask(task).catch((err) => {
            this.logger.error(
              `Ошибка обработки push-задачи ${task.id}: ${readErrorMessage(err)}`,
            );
          });
        }
        this.markProgress();
      }
    } finally {
      await pgAdvisoryUnlock(this.prisma, lock.key);
      this.running = false;
    }
  }

  private asRecord(
    value: Prisma.JsonValue | null | undefined,
  ): Record<string, unknown> {
    return asRecordShared(value) ?? {};
  }

  private toStringRecord(value: unknown): Record<string, string> | undefined {
    if (!isRecord(value)) return undefined;
    const entries: [string, string][] = [];
    for (const [key, val] of Object.entries(value)) {
      if (val === undefined || val === null) continue;
      if (typeof val === 'string') {
        entries.push([key, val]);
        continue;
      }
      if (typeof val === 'number' || typeof val === 'boolean') {
        entries.push([key, String(val)]);
      }
    }
    if (!entries.length) return undefined;
    return Object.fromEntries(entries);
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  private toStatsRecord(
    value: Prisma.JsonValue | null | undefined,
  ): Record<string, unknown> {
    return isRecord(value) ? { ...value } : {};
  }

  private buildStats(
    current: Prisma.JsonValue | null | undefined,
    patch: Record<string, unknown>,
  ): Prisma.JsonObject {
    return { ...this.toStatsRecord(current), ...patch } as Prisma.JsonObject;
  }

  private getAttempts(value: Prisma.JsonValue | null | undefined): number {
    const stats = this.toStatsRecord(value);
    const raw = this.toNumber(stats.attempts);
    return raw && raw > 0 ? Math.floor(raw) : 0;
  }

  private getRecipientBatchSize(): number {
    return Math.max(
      1,
      this.config.getNumber('COMM_RECIPIENT_BATCH', 200) ?? 200,
    );
  }

  private getDeliveryConcurrency(): number {
    return Math.max(
      1,
      this.config.getNumber('COMM_DELIVERY_CONCURRENCY', 5) ?? 5,
    );
  }

  private async runWithConcurrency<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>,
  ) {
    const active = new Set<Promise<void>>();
    for (const item of items) {
      const task = Promise.resolve().then(() => worker(item));
      active.add(task);
      void task.finally(() => active.delete(task));
      if (active.size >= limit) {
        await Promise.race(active);
      }
    }
    await Promise.all(active);
  }

  private async markTaskRunning(task: CommunicationTask) {
    const now = new Date();
    const attempts = this.getAttempts(task.stats) + 1;
    const stats = this.buildStats(task.stats, {
      attempts,
      lastRunAt: now.toISOString(),
      lastError: null,
      lastErrorAt: null,
    });
    const claimed = await this.prisma.communicationTask.updateMany({
      where: {
        id: task.id,
        status: 'SCHEDULED',
        archivedAt: null,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
      },
      data: { status: 'RUNNING', startedAt: now, scheduledAt: null, stats },
    });
    if (claimed.count !== 1) return null;
    return { now, attempts, stats };
  }

  private async recoverStaleTasks() {
    const staleMs = Math.max(
      60_000,
      this.config.getNumber('COMM_TASK_STALE_MS', 20 * 60 * 1000) ??
        20 * 60 * 1000,
    );
    const maxRetries = Math.max(
      0,
      this.config.getNumber('COMM_TASK_MAX_RETRIES', 2) ?? 2,
    );
    if (!Number.isFinite(staleMs) || staleMs <= 0) return;
    const staleBefore = new Date(Date.now() - staleMs);
    const staleTasks = await this.prisma.communicationTask.findMany({
      where: {
        status: 'RUNNING',
        archivedAt: null,
        startedAt: { lt: staleBefore },
      },
      select: { id: true, stats: true },
      take: 50,
    });
    if (!staleTasks.length) return;
    const retryDelayMs = Math.max(
      60_000,
      this.config.getNumber('COMM_TASK_RETRY_DELAY_MS', 5 * 60 * 1000) ??
        5 * 60 * 1000,
    );
    for (const task of staleTasks) {
      const attempts = this.getAttempts(task.stats);
      const canRetry = maxRetries > 0 && attempts < maxRetries;
      const now = new Date();
      const stats = this.buildStats(task.stats, {
        lastError: 'stale task detected',
        lastErrorAt: now.toISOString(),
      });
      const updated = await this.prisma.communicationTask.updateMany({
        where: {
          id: task.id,
          status: 'RUNNING',
          archivedAt: null,
          startedAt: { lt: staleBefore },
        },
        data: canRetry
          ? {
              status: 'SCHEDULED',
              scheduledAt: new Date(now.getTime() + retryDelayMs),
              startedAt: null,
              stats,
            }
          : {
              status: 'FAILED',
              completedAt: now,
              failedAt: now,
              startedAt: null,
              stats,
            },
      });
      if (updated.count !== 1) continue;
      this.markProgress();
    }
  }

  private async requeueFailedTasks() {
    const maxRetries = Math.max(
      0,
      this.config.getNumber('COMM_TASK_MAX_RETRIES', 2) ?? 2,
    );
    if (maxRetries <= 0) return;
    const retryDelayMs = Math.max(
      60_000,
      this.config.getNumber('COMM_TASK_RETRY_DELAY_MS', 5 * 60 * 1000) ??
        5 * 60 * 1000,
    );
    const retryBatch = Math.max(
      1,
      this.config.getNumber('COMM_TASK_RETRY_BATCH', 20) ?? 20,
    );
    const retryBefore = new Date(Date.now() - retryDelayMs);
    const failedTasks = await this.prisma.communicationTask.findMany({
      where: {
        status: 'FAILED',
        archivedAt: null,
        failedAt: { lt: retryBefore },
      },
      select: { id: true, stats: true },
      orderBy: { failedAt: 'asc' },
      take: retryBatch,
    });
    if (!failedTasks.length) return;
    for (const task of failedTasks) {
      const attempts = this.getAttempts(task.stats);
      if (attempts >= maxRetries) continue;
      const stats = this.buildStats(task.stats, {
        lastRetryAt: new Date().toISOString(),
      });
      const updated = await this.prisma.communicationTask.updateMany({
        where: {
          id: task.id,
          status: 'FAILED',
          archivedAt: null,
          failedAt: { lt: retryBefore },
        },
        data: {
          status: 'SCHEDULED',
          scheduledAt: new Date(),
          startedAt: null,
          stats,
        },
      });
      if (updated.count !== 1) continue;
      this.markProgress();
    }
  }

  triggerImmediate(taskId: string) {
    setTimeout(() => {
      this.runTaskById(taskId).catch((err) =>
        this.logger.error(
          `Ошибка мгновенного запуска коммуникации ${taskId}: ${readErrorMessage(err)}`,
        ),
      );
    }, 0);
  }

  async runTaskById(taskId: string) {
    if (this.running) return;
    this.running = true;
    const lock = await pgTryAdvisoryLock(this.prisma, this.workerLockName);
    if (!lock.ok) {
      this.markLockMiss();
      this.running = false;
      return;
    }
    try {
      this.markTick();
      const task = await this.prisma.communicationTask.findUnique({
        where: { id: taskId },
      });
      if (!task) return;
      if (task.status !== 'SCHEDULED') return;
      if (task.archivedAt) return;
      if (task.scheduledAt && task.scheduledAt.getTime() > Date.now()) return;
      if (task.channel === CommunicationChannel.TELEGRAM) {
        await this.processTelegramTask(task);
      } else if (task.channel === CommunicationChannel.PUSH) {
        await this.processPushTask(task);
      }
      this.markProgress();
    } finally {
      await pgAdvisoryUnlock(this.prisma, lock.key);
      this.running = false;
    }
  }

  private async processTelegramTask(task: CommunicationTask) {
    const running = await this.markTaskRunning(task);
    if (!running) return;
    const { stats: runningStats } = running;

    const payload = this.asRecord(task.payload);
    const text = (readString(payload.text) ?? '').trim();
    const payloadEvent = (readString(payload.event) ?? '').trim();
    if (
      task.promotionId &&
      (payloadEvent === 'promotion.start' ||
        payloadEvent === 'promotion.reminder')
    ) {
      const hasPush = await this.prisma.communicationTask.findFirst({
        where: {
          merchantId: task.merchantId,
          promotionId: task.promotionId,
          channel: CommunicationChannel.PUSH,
          archivedAt: null,
          payload: { path: ['event'], equals: payloadEvent },
        },
        select: { id: true },
      });
      if (hasPush) {
        await this.finishTask(task.id, {
          status: 'COMPLETED',
          total: 0,
          sent: 0,
          failed: 0,
          error: 'skipped: handled by push channel',
        });
        return;
      }
    }
    if (!text) {
      await this.finishTask(
        task.id,
        {
          status: 'FAILED',
          total: 0,
          sent: 0,
          failed: 0,
          error: 'Пустой текст сообщения',
        },
        runningStats,
      );
      return;
    }

    const recipients = await this.resolveTelegramRecipients(task);
    if (!recipients.length) {
      await this.finishTask(
        task.id,
        {
          status: 'COMPLETED',
          total: 0,
          sent: 0,
          failed: 0,
          error: null,
        },
        runningStats,
      );
      return;
    }
    const recipientMap = new Map(
      recipients.map((recipient) => [recipient.customerId, recipient]),
    );
    const existingCount = await this.prisma.communicationTaskRecipient.count({
      where: { taskId: task.id },
    });
    if (existingCount === 0) {
      await this.prisma.communicationTaskRecipient.createMany({
        data: recipients.map((recipient) => ({
          taskId: task.id,
          merchantId: task.merchantId,
          customerId: recipient.customerId,
          channel: CommunicationChannel.TELEGRAM,
          status: 'PENDING',
          metadata: {
            tgId: recipient.tgId,
            name: recipient.name ?? null,
          } as Prisma.JsonObject,
        })),
      });
    }

    const mediaDescriptor = this.asRecord(task.media);
    const assetIdRaw =
      mediaDescriptor.assetId ??
      mediaDescriptor.id ??
      mediaDescriptor.asset_id ??
      null;
    const assetId =
      typeof assetIdRaw === 'string' || typeof assetIdRaw === 'number'
        ? String(assetIdRaw)
        : null;
    const asset = assetId
      ? await this.prisma.communicationAsset.findUnique({
          where: { id: assetId },
          select: {
            id: true,
            merchantId: true,
            mimeType: true,
            fileName: true,
            data: true,
          },
        })
      : null;
    if (asset && asset.merchantId !== task.merchantId) {
      throw new Error('Медиафайл принадлежит другому мерчанту');
    }

    const recipientBatchSize = this.getRecipientBatchSize();
    const deliveryConcurrency = this.getDeliveryConcurrency();
    let firstError: unknown = null;

    const promotion =
      task.promotionId && typeof task.promotionId === 'string'
        ? await this.prisma.loyaltyPromotion.findFirst({
            where: { merchantId: task.merchantId, id: task.promotionId },
            select: { id: true, name: true, rewardValue: true },
          })
        : null;
    const promotionName = (() => {
      const name = readString(payload.name);
      return name && name.trim() ? name.trim() : (promotion?.name ?? '');
    })();
    const hasBonusSource =
      payload.bonus !== undefined ||
      payload.rewardValue !== undefined ||
      payload.points !== undefined ||
      promotion?.rewardValue !== undefined;
    const bonusRaw =
      payload.bonus ??
      payload.rewardValue ??
      payload.points ??
      promotion?.rewardValue;
    const bonus = Number.isFinite(Number(bonusRaw))
      ? Math.max(0, Math.trunc(Number(bonusRaw)))
      : 0;

    let cursorId: string | null = null;
    for (;;) {
      const pendingRecipients: Array<{
        id: string;
        customerId: string | null;
        metadata: Prisma.JsonValue | null;
      }> = await this.prisma.communicationTaskRecipient.findMany({
        where: {
          taskId: task.id,
          status: { in: ['PENDING', 'FAILED'] },
          ...(cursorId ? { id: { gt: cursorId } } : {}),
        },
        select: { id: true, customerId: true, metadata: true },
        orderBy: { id: 'asc' },
        take: recipientBatchSize,
      });
      if (!pendingRecipients.length) break;
      await this.runWithConcurrency(
        pendingRecipients,
        deliveryConcurrency,
        async (row) => {
          const meta = this.asRecord(row.metadata) ?? {};
          const mapped = row.customerId
            ? recipientMap.get(row.customerId)
            : undefined;
          const tgIdRaw = meta.tgId ?? mapped?.tgId ?? null;
          const tgId =
            typeof tgIdRaw === 'string' || typeof tgIdRaw === 'number'
              ? String(tgIdRaw)
              : '';
          const nameRaw = meta.name ?? mapped?.name ?? null;
          const name = typeof nameRaw === 'string' ? nameRaw : null;
          if (!tgId) {
            await this.prisma.communicationTaskRecipient.update({
              where: { id: row.id },
              data: {
                status: 'FAILED',
                error: 'missing tgId',
                sentAt: null,
                metadata: { ...meta, tgId: null } as Prisma.JsonObject,
              },
            });
            this.markProgress();
            return;
          }
          let status = 'SENT';
          let error: string | null = null;
          try {
            const vars: Record<string, string | number> = {
              client: name?.trim() || 'клиент',
            };
            if (promotionName) vars.name = promotionName;
            if (hasBonusSource) vars.bonus = bonus;
            const rendered = applyCurlyPlaceholders(text, vars).trim();
            await this.telegramBots.sendCampaignMessage(task.merchantId, tgId, {
              text: rendered || text,
              asset:
                asset && asset.data
                  ? {
                      buffer: asset.data as Buffer,
                      mimeType: asset.mimeType ?? undefined,
                      fileName: asset.fileName ?? undefined,
                    }
                  : undefined,
            });
          } catch (err: unknown) {
            status = 'FAILED';
            error = readErrorMessage(err);
            if (!firstError) {
              firstError = err;
              logIgnoredError(
                err,
                'CommunicationsDispatcherWorker telegram delivery',
                this.logger,
                'debug',
                {
                  taskId: task.id,
                  merchantId: task.merchantId,
                  customerId: row.customerId,
                },
              );
            }
          }

          await this.prisma.communicationTaskRecipient.update({
            where: { id: row.id },
            data: {
              status,
              sentAt: status === 'SENT' ? new Date() : null,
              error,
              metadata: {
                ...meta,
                tgId,
                name,
              } as Prisma.JsonObject,
            },
          });
          this.markProgress();
        },
      );
      const nextCursor =
        pendingRecipients[pendingRecipients.length - 1]?.id ?? null;
      if (cursorId && nextCursor && nextCursor <= cursorId) {
        this.logger.warn(
          `Telegram recipients cursor did not advance for task ${task.id}, breaking loop`,
        );
        break;
      }
      cursorId = nextCursor;
      this.markProgress();
    }

    const grouped = await this.prisma.communicationTaskRecipient.groupBy({
      by: ['status'],
      where: { taskId: task.id },
      _count: { _all: true },
    });
    const total = grouped.reduce((sum, row) => sum + (row._count._all ?? 0), 0);
    const sentTotal =
      grouped.find((row) => row.status === 'SENT')?._count._all ?? 0;
    const failedTotal = Math.max(0, total - sentTotal);

    await this.finishTask(
      task.id,
      {
        status: failedTotal && !sentTotal ? 'FAILED' : 'COMPLETED',
        total,
        sent: sentTotal,
        failed: failedTotal,
        error: failedTotal ? 'Часть сообщений не доставлена' : null,
      },
      runningStats,
    );

    try {
      this.metrics.inc('portal_communications_tasks_processed_total', {
        channel: 'telegram',
        result: failedTotal ? (sentTotal ? 'partial' : 'failed') : 'ok',
      });
    } catch (err) {
      logIgnoredError(
        err,
        'CommunicationsDispatcherWorker metrics',
        this.logger,
        'debug',
      );
    }
  }

  private async processPushTask(task: CommunicationTask) {
    const running = await this.markTaskRunning(task);
    if (!running) return;
    const { stats: runningStats } = running;

    const payload = this.asRecord(task.payload);
    const text = (readString(payload.text) ?? '').trim();
    if (!text) {
      await this.finishTask(
        task.id,
        {
          status: 'FAILED',
          total: 0,
          sent: 0,
          failed: 0,
          error: 'Пустой текст push-уведомления',
        },
        runningStats,
      );
      return;
    }

    const recipients = await this.resolveTelegramRecipients(task);
    if (!recipients.length) {
      await this.finishTask(
        task.id,
        {
          status: 'COMPLETED',
          total: 0,
          sent: 0,
          failed: 0,
          error: null,
        },
        runningStats,
      );
      return;
    }
    const recipientMap = new Map(
      recipients.map((recipient) => [recipient.customerId, recipient]),
    );
    const existingCount = await this.prisma.communicationTaskRecipient.count({
      where: { taskId: task.id },
    });
    if (existingCount === 0) {
      await this.prisma.communicationTaskRecipient.createMany({
        data: recipients.map((recipient) => ({
          taskId: task.id,
          merchantId: task.merchantId,
          customerId: recipient.customerId,
          channel: CommunicationChannel.PUSH,
          status: 'PENDING',
          metadata: {
            tgId: recipient.tgId,
            name: recipient.name ?? null,
          } as Prisma.JsonObject,
        })),
      });
    }

    const recipientBatchSize = this.getRecipientBatchSize();
    const deliveryConcurrency = this.getDeliveryConcurrency();
    let firstError: unknown = null;
    const title = (() => {
      const raw = readString(payload.title);
      return raw && raw.trim() ? raw.trim() : undefined;
    })();
    const deepLink = (() => {
      const raw = readString(payload.deepLink);
      return raw && raw.trim() ? raw.trim() : undefined;
    })();
    const extra = this.toStringRecord(payload.data);

    const promotion =
      task.promotionId && typeof task.promotionId === 'string'
        ? await this.prisma.loyaltyPromotion.findFirst({
            where: { merchantId: task.merchantId, id: task.promotionId },
            select: { id: true, name: true, rewardValue: true },
          })
        : null;
    const promotionName = (() => {
      const name = readString(payload.name);
      return name && name.trim() ? name.trim() : (promotion?.name ?? '');
    })();
    const hasBonusSource =
      payload.bonus !== undefined ||
      payload.rewardValue !== undefined ||
      payload.points !== undefined ||
      promotion?.rewardValue !== undefined;
    const bonusRaw =
      payload.bonus ??
      payload.rewardValue ??
      payload.points ??
      promotion?.rewardValue;
    const bonus = Number.isFinite(Number(bonusRaw))
      ? Math.max(0, Math.trunc(Number(bonusRaw)))
      : 0;

    let cursorId: string | null = null;
    for (;;) {
      const pendingRecipients: Array<{
        id: string;
        customerId: string | null;
        metadata: Prisma.JsonValue | null;
      }> = await this.prisma.communicationTaskRecipient.findMany({
        where: {
          taskId: task.id,
          status: { in: ['PENDING', 'FAILED'] },
          ...(cursorId ? { id: { gt: cursorId } } : {}),
        },
        select: { id: true, customerId: true, metadata: true },
        orderBy: { id: 'asc' },
        take: recipientBatchSize,
      });
      if (!pendingRecipients.length) break;
      await this.runWithConcurrency(
        pendingRecipients,
        deliveryConcurrency,
        async (row) => {
          const meta = this.asRecord(row.metadata) ?? {};
          const mapped = row.customerId
            ? recipientMap.get(row.customerId)
            : undefined;
          const tgIdRaw = meta.tgId ?? mapped?.tgId ?? null;
          const tgId =
            typeof tgIdRaw === 'string' || typeof tgIdRaw === 'number'
              ? String(tgIdRaw)
              : '';
          const nameRaw = meta.name ?? mapped?.name ?? null;
          const name = typeof nameRaw === 'string' ? nameRaw : null;
          if (!tgId) {
            await this.prisma.communicationTaskRecipient.update({
              where: { id: row.id },
              data: {
                status: 'FAILED',
                error: 'missing tgId',
                sentAt: null,
                metadata: { ...meta, tgId: null } as Prisma.JsonObject,
              },
            });
            this.markProgress();
            return;
          }
          let status = 'SENT';
          let error: string | null = null;
          try {
            const vars: Record<string, string | number> = {
              client: name?.trim() || 'клиент',
            };
            if (promotionName) vars.name = promotionName;
            if (hasBonusSource) vars.bonus = bonus;
            const renderedText = applyCurlyPlaceholders(text, vars).trim();
            const renderedTitle = title
              ? applyCurlyPlaceholders(title, vars).trim()
              : undefined;
            await this.telegramBots.sendPushNotification(
              task.merchantId,
              tgId,
              {
                title: renderedTitle || title,
                body: renderedText || text,
                data: extra,
                deepLink,
              },
            );
          } catch (err: unknown) {
            status = 'FAILED';
            error = readErrorMessage(err);
            if (!firstError) {
              firstError = err;
              logIgnoredError(
                err,
                'CommunicationsDispatcherWorker push delivery',
                this.logger,
                'debug',
                {
                  taskId: task.id,
                  merchantId: task.merchantId,
                  customerId: row.customerId,
                },
              );
            }
          }

          await this.prisma.communicationTaskRecipient.update({
            where: { id: row.id },
            data: {
              status,
              sentAt: status === 'SENT' ? new Date() : null,
              error,
              metadata: {
                ...meta,
                tgId,
                name,
              } as Prisma.JsonObject,
            },
          });
          this.markProgress();
        },
      );
      const nextCursor =
        pendingRecipients[pendingRecipients.length - 1]?.id ?? null;
      if (cursorId && nextCursor && nextCursor <= cursorId) {
        this.logger.warn(
          `Push recipients cursor did not advance for task ${task.id}, breaking loop`,
        );
        break;
      }
      cursorId = nextCursor;
      this.markProgress();
    }

    const grouped = await this.prisma.communicationTaskRecipient.groupBy({
      by: ['status'],
      where: { taskId: task.id },
      _count: { _all: true },
    });
    const total = grouped.reduce((sum, row) => sum + (row._count._all ?? 0), 0);
    const sentTotal =
      grouped.find((row) => row.status === 'SENT')?._count._all ?? 0;
    const failedTotal = Math.max(0, total - sentTotal);

    await this.finishTask(
      task.id,
      {
        status: failedTotal && !sentTotal ? 'FAILED' : 'COMPLETED',
        total,
        sent: sentTotal,
        failed: failedTotal,
        error: failedTotal ? 'Часть push-уведомлений не доставлена' : null,
      },
      runningStats,
    );

    try {
      this.metrics.inc('portal_communications_tasks_processed_total', {
        channel: 'push',
        result: failedTotal ? (sentTotal ? 'partial' : 'failed') : 'ok',
      });
    } catch (err) {
      logIgnoredError(
        err,
        'CommunicationsDispatcherWorker metrics',
        this.logger,
        'debug',
      );
    }
  }

  private async finishTask(
    taskId: string,
    stats: {
      status: string;
      total: number;
      sent: number;
      failed: number;
      error: string | null;
    },
    baseStats?: Prisma.JsonValue | null,
  ) {
    const merged = this.buildStats(baseStats, {
      totalRecipients: stats.total,
      sent: stats.sent,
      failed: stats.failed,
      error: stats.error,
      lastError: stats.error,
      lastErrorAt: stats.error ? new Date().toISOString() : null,
    });
    await this.prisma.communicationTask.update({
      where: { id: taskId },
      data: {
        status: stats.status,
        completedAt: new Date(),
        failedAt: stats.status === 'FAILED' ? new Date() : null,
        totalRecipients: stats.total,
        sentCount: stats.sent,
        failedCount: stats.failed,
        stats: merged,
      },
    });
  }

  private async resolveTelegramRecipients(
    task: CommunicationTask,
  ): Promise<TelegramRecipient[]> {
    const merchantId = task.merchantId;
    const audienceId = task.audienceId;
    const customerIds = await this.collectAudienceCustomerIds(
      merchantId,
      audienceId,
    );
    if (Array.isArray(customerIds) && customerIds.length === 0) return [];

    // Customer теперь per-merchant модель, id = customerId
    const telegramRecipients: TelegramRecipient[] = [];
    const seen = new Set<string>();

    const customers = await this.prisma.customer.findMany({
      where: {
        merchantId,
        erasedAt: null,
        tgId: { not: null },
        consents: { some: { merchantId } },
        ...(Array.isArray(customerIds) ? { id: { in: customerIds } } : {}),
      },
      select: { id: true, tgId: true, name: true },
    });

    for (const c of customers) {
      if (!c.tgId) continue;
      const key = String(c.tgId);
      if (seen.has(key)) continue;
      seen.add(key);
      telegramRecipients.push({
        customerId: c.id,
        tgId: c.tgId,
        name: c.name ?? null,
      });
    }

    return telegramRecipients;
  }

  private async collectAudienceCustomerIds(
    merchantId: string,
    audienceId: string | null,
  ): Promise<string[] | null> {
    if (!audienceId) {
      return null;
    }
    const segment = await this.prisma.customerSegment.findFirst({
      where: { id: audienceId, merchantId },
      select: { id: true, isSystem: true, systemKey: true },
    });
    if (!segment) return [];
    if (isSystemAllAudience(segment)) {
      return null;
    }
    const rows = await this.prisma.segmentCustomer.findMany({
      where: { segmentId: audienceId },
      select: { customerId: true },
    });
    return rows.map((r) => r.customerId);
  }
}
