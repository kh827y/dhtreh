import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, CommunicationChannel } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import { pgTryAdvisoryLock, pgAdvisoryUnlock } from '../pg-lock.util';
import { isSystemAllAudience } from '../customer-audiences/audience.utils';
import { applyCurlyPlaceholders } from './message-placeholders';

type TelegramRecipient = {
  customerId: string;
  tgId: string;
  name: string | null;
};

@Injectable()
export class CommunicationsDispatcherWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CommunicationsDispatcherWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly telegramBots: TelegramBotService,
  ) {}

  onModuleInit() {
    if (process.env.WORKERS_ENABLED === '0') {
      this.logger.log('Communications worker disabled (WORKERS_ENABLED=0)');
      return;
    }
    const intervalMs = Number(process.env.COMM_WORKER_INTERVAL_MS || '15000');
    this.timer = setInterval(() => this.tick().catch(() => {}), intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    this.logger.log(
      `CommunicationsDispatcherWorker started, interval=${intervalMs}ms`,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    const lock = await pgTryAdvisoryLock(
      this.prisma,
      'worker:communications_dispatcher',
    );
    if (!lock.ok) {
      this.running = false;
      return;
    }
    try {
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
        take: Number(process.env.COMM_WORKER_BATCH || '10'),
      });
      for (const task of due) {
        if (task.channel === CommunicationChannel.TELEGRAM) {
          await this.processTelegramTask(task).catch((err) => {
            this.logger.error(
              `Ошибка обработки telegram-задачи ${task.id}: ${err?.message || err}`,
            );
          });
        } else if (task.channel === CommunicationChannel.PUSH) {
          await this.processPushTask(task).catch((err) => {
            this.logger.error(
              `Ошибка обработки push-задачи ${task.id}: ${err?.message || err}`,
            );
          });
        }
      }
    } finally {
      await pgAdvisoryUnlock(this.prisma, lock.key);
      this.running = false;
    }
  }

  private asRecord(value: Prisma.JsonValue | null): Record<string, any> {
    return value && typeof value === 'object'
      ? (value as Record<string, any>)
      : {};
  }

  private toStringRecord(value: any): Record<string, string> | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const entries: [string, string][] = [];
    for (const [key, val] of Object.entries(value)) {
      if (val === undefined || val === null) continue;
      entries.push([key, String(val)]);
    }
    if (!entries.length) return undefined;
    return Object.fromEntries(entries);
  }

  triggerImmediate(taskId: string) {
    setTimeout(() => {
      this.runTaskById(taskId).catch((err) =>
        this.logger.error(
          `Ошибка мгновенного запуска коммуникации ${taskId}: ${err?.message || err}`,
        ),
      );
    }, 0);
  }

  async runTaskById(taskId: string) {
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
  }

  private async processTelegramTask(task: any) {
    const now = new Date();
    await this.prisma.communicationTask.update({
      where: { id: task.id },
      data: { status: 'RUNNING', startedAt: now },
    });

    const payload = this.asRecord(task.payload);
    const text = String(payload.text || '').trim();
    if (!text) {
      await this.finishTask(task.id, {
        status: 'FAILED',
        total: 0,
        sent: 0,
        failed: 0,
        error: 'Пустой текст сообщения',
      });
      return;
    }

    const recipients = await this.resolveTelegramRecipients(task);
    if (!recipients.length) {
      await this.finishTask(task.id, {
        status: 'COMPLETED',
        total: 0,
        sent: 0,
        failed: 0,
        error: null,
      });
      return;
    }

    await this.prisma.communicationTaskRecipient.deleteMany({
      where: { taskId: task.id },
    });

    const mediaDescriptor = this.asRecord(task.media);
    const assetIdRaw =
      mediaDescriptor.assetId ??
      mediaDescriptor.id ??
      mediaDescriptor.asset_id ??
      null;
    const assetId = assetIdRaw ? String(assetIdRaw) : null;
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

    const rows: Prisma.CommunicationTaskRecipientCreateManyInput[] = [];
    let sent = 0;
    let failed = 0;

    const promotion =
      task.promotionId && typeof task.promotionId === 'string'
        ? await this.prisma.loyaltyPromotion.findFirst({
            where: { merchantId: task.merchantId, id: task.promotionId },
            select: { id: true, name: true, rewardValue: true },
          })
        : null;
    const promotionName =
      typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : (promotion?.name ?? '');
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

    for (const recipient of recipients) {
      let status = 'SENT';
      let error: string | null = null;
      try {
        const vars: Record<string, string | number> = {
          client: recipient.name?.trim() || 'клиент',
        };
        if (promotionName) vars.name = promotionName;
        if (hasBonusSource) vars.bonus = bonus;
        const rendered = applyCurlyPlaceholders(text, vars).trim();
        await this.telegramBots.sendCampaignMessage(
          task.merchantId,
          recipient.tgId,
          {
            text: rendered || text,
            asset:
              asset && asset.data
                ? {
                    buffer: asset.data as Buffer,
                    mimeType: asset.mimeType ?? undefined,
                    fileName: asset.fileName ?? undefined,
                  }
                : undefined,
          },
        );
        sent += 1;
      } catch (err: any) {
        status = 'FAILED';
        error = err?.message ? String(err.message) : String(err);
        failed += 1;
      }

      rows.push({
        taskId: task.id,
        merchantId: task.merchantId,
        customerId: recipient.customerId,
        channel: CommunicationChannel.TELEGRAM,
        status,
        sentAt: status === 'SENT' ? new Date() : null,
        error,
        metadata: { tgId: recipient.tgId } as Prisma.JsonObject,
      });
    }

    if (rows.length) {
      await this.prisma.communicationTaskRecipient.createMany({ data: rows });
    }

    await this.finishTask(task.id, {
      status: failed && !sent ? 'FAILED' : 'COMPLETED',
      total: recipients.length,
      sent,
      failed,
      error: failed ? 'Часть сообщений не доставлена' : null,
    });

    try {
      this.metrics.inc('portal_communications_tasks_processed_total', {
        channel: 'telegram',
        result: failed ? (sent ? 'partial' : 'failed') : 'ok',
      });
    } catch {}
  }

  private async processPushTask(task: any) {
    const now = new Date();
    await this.prisma.communicationTask.update({
      where: { id: task.id },
      data: { status: 'RUNNING', startedAt: now },
    });

    const payload = this.asRecord(task.payload);
    const text = String(payload.text || '').trim();
    if (!text) {
      await this.finishTask(task.id, {
        status: 'FAILED',
        total: 0,
        sent: 0,
        failed: 0,
        error: 'Пустой текст push-уведомления',
      });
      return;
    }

    const recipients = await this.resolveTelegramRecipients(task);
    if (!recipients.length) {
      await this.finishTask(task.id, {
        status: 'COMPLETED',
        total: 0,
        sent: 0,
        failed: 0,
        error: null,
      });
      return;
    }

    await this.prisma.communicationTaskRecipient.deleteMany({
      where: { taskId: task.id },
    });

    const rows: Prisma.CommunicationTaskRecipientCreateManyInput[] = [];
    let sent = 0;
    let failed = 0;
    const title =
      typeof payload.title === 'string' && payload.title.trim()
        ? payload.title.trim()
        : undefined;
    const deepLink =
      typeof payload.deepLink === 'string' && payload.deepLink.trim()
        ? payload.deepLink.trim()
        : undefined;
    const extra = this.toStringRecord(payload.data);

    const promotion =
      task.promotionId && typeof task.promotionId === 'string'
        ? await this.prisma.loyaltyPromotion.findFirst({
            where: { merchantId: task.merchantId, id: task.promotionId },
            select: { id: true, name: true, rewardValue: true },
          })
        : null;
    const promotionName =
      typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : (promotion?.name ?? '');
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

    for (const recipient of recipients) {
      let status = 'SENT';
      let error: string | null = null;
      try {
        const vars: Record<string, string | number> = {
          client: recipient.name?.trim() || 'клиент',
        };
        if (promotionName) vars.name = promotionName;
        if (hasBonusSource) vars.bonus = bonus;
        const renderedText = applyCurlyPlaceholders(text, vars).trim();
        const renderedTitle = title
          ? applyCurlyPlaceholders(title, vars).trim()
          : undefined;
        await this.telegramBots.sendPushNotification(
          task.merchantId,
          recipient.tgId,
          {
            title: renderedTitle || title,
            body: renderedText || text,
            data: extra,
            deepLink,
          },
        );
        sent += 1;
      } catch (err: any) {
        status = 'FAILED';
        error = err?.message ? String(err.message) : String(err);
        failed += 1;
      }

      rows.push({
        taskId: task.id,
        merchantId: task.merchantId,
        customerId: recipient.customerId,
        channel: CommunicationChannel.PUSH,
        status,
        sentAt: status === 'SENT' ? new Date() : null,
        error,
        metadata: { tgId: recipient.tgId } as Prisma.JsonObject,
      });
    }

    if (rows.length) {
      await this.prisma.communicationTaskRecipient.createMany({ data: rows });
    }

    await this.finishTask(task.id, {
      status: failed && !sent ? 'FAILED' : 'COMPLETED',
      total: recipients.length,
      sent,
      failed,
      error: failed ? 'Часть push-уведомлений не доставлена' : null,
    });

    try {
      this.metrics.inc('portal_communications_tasks_processed_total', {
        channel: 'push',
        result: failed ? (sent ? 'partial' : 'failed') : 'ok',
      });
    } catch {}
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
  ) {
    await this.prisma.communicationTask.update({
      where: { id: taskId },
      data: {
        status: stats.status,
        completedAt: new Date(),
        failedAt: stats.status === 'FAILED' ? new Date() : null,
        totalRecipients: stats.total,
        sentCount: stats.sent,
        failedCount: stats.failed,
        stats: {
          totalRecipients: stats.total,
          sent: stats.sent,
          failed: stats.failed,
          error: stats.error,
        } as Prisma.JsonObject,
      },
    });
  }

  private async resolveTelegramRecipients(
    task: any,
  ): Promise<TelegramRecipient[]> {
    const merchantId = task.merchantId as string;
    const audienceId = task.audienceId as string | null;
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
