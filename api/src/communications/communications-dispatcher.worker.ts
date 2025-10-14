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

type TelegramRecipient = {
  merchantCustomerId: string;
  tgId: string;
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
    this.logger.log(`CommunicationsDispatcherWorker started, interval=${intervalMs}ms`);
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
          channel: CommunicationChannel.TELEGRAM,
          archivedAt: null,
          OR: [
            { scheduledAt: null },
            { scheduledAt: { lte: new Date() } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: Number(process.env.COMM_WORKER_BATCH || '10'),
      });
      for (const task of due) {
        await this.processTelegramTask(task).catch((err) => {
          this.logger.error(
            `Ошибка обработки telegram-задачи ${task.id}: ${err?.message || err}`,
          );
        });
      }
    } finally {
      await pgAdvisoryUnlock(this.prisma, lock.key);
      this.running = false;
    }
  }

  private asRecord(value: Prisma.JsonValue | null): Record<string, any> {
    return value && typeof value === 'object' ? (value as Record<string, any>) : {};
  }

  triggerImmediate(taskId: string) {
    setTimeout(() => {
      this.runTaskById(taskId).catch((err) =>
        this.logger.error(
          `Ошибка мгновенного запуска telegram-задачи ${taskId}: ${err?.message || err}`,
        ),
      );
    }, 0);
  }

  async runTaskById(taskId: string) {
    const task = await this.prisma.communicationTask.findUnique({
      where: { id: taskId },
    });
    if (!task) return;
    if (task.channel !== CommunicationChannel.TELEGRAM) return;
    if (task.status !== 'SCHEDULED') return;
    if (task.archivedAt) return;
    if (task.scheduledAt && task.scheduledAt.getTime() > Date.now()) return;
    await this.processTelegramTask(task);
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

    for (const recipient of recipients) {
      let status = 'SENT';
      let error: string | null = null;
      try {
        await this.telegramBots.sendCampaignMessage(task.merchantId, recipient.tgId, {
          text,
          asset:
            asset && asset.data
              ? {
                  buffer: asset.data as Buffer,
                  mimeType: asset.mimeType ?? undefined,
                  fileName: asset.fileName ?? undefined,
                }
              : undefined,
        });
        sent += 1;
      } catch (err: any) {
        status = 'FAILED';
        error = err?.message ? String(err.message) : String(err);
        failed += 1;
      }

      rows.push({
        taskId: task.id,
        merchantId: task.merchantId,
        merchantCustomerId: recipient.merchantCustomerId,
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

  private async finishTask(
    taskId: string,
    stats: { status: string; total: number; sent: number; failed: number; error: string | null },
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

  private async resolveTelegramRecipients(task: any): Promise<TelegramRecipient[]> {
    const merchantId = task.merchantId as string;
    const audienceId = task.audienceId as string | null;
    const customerIds = await this.collectAudienceCustomerIds(
      merchantId,
      audienceId,
    );
    if (Array.isArray(customerIds) && customerIds.length === 0) return [];

    const telegramRecipients: TelegramRecipient[] = [];
    const seen = new Set<string>();

    const merchantCustomers = await this.prisma.merchantCustomer.findMany({
      where: {
        merchantId,
        ...(Array.isArray(customerIds)
          ? { customerId: { in: customerIds } }
          : {}),
      },
      select: {
        id: true,
        customerId: true,
        tgId: true,
      },
    });

    const bindingCustomers = new Map<string, string>();
    for (const mc of merchantCustomers) {
      if (!mc.tgId) continue;
      const key = String(mc.tgId);
      if (seen.has(key)) continue;
      seen.add(key);
      bindingCustomers.set(mc.customerId, mc.tgId);
      telegramRecipients.push({
        merchantCustomerId: mc.id,
        tgId: mc.tgId,
      });
    }

    let fallbackMerchantCustomers: Array<{
      id: string;
      customerId: string;
      tgId: string | null;
    }> = [];
    if (Array.isArray(customerIds)) {
      const missingIds = customerIds.filter(
        (id) => !bindingCustomers.has(id),
      );
      if (missingIds.length) {
        fallbackMerchantCustomers = await this.prisma.merchantCustomer.findMany({
          where: {
            merchantId,
            customerId: { in: missingIds },
            tgId: { not: null },
          },
          select: { id: true, customerId: true, tgId: true },
        });
      }
    } else {
      fallbackMerchantCustomers = await this.prisma.merchantCustomer.findMany({
        where: { merchantId, tgId: { not: null } },
        select: { id: true, customerId: true, tgId: true },
      });
    }

    for (const mc of fallbackMerchantCustomers) {
      const key = `${mc.tgId}`;
      if (!mc.tgId || seen.has(key)) continue;
      seen.add(key);
      telegramRecipients.push({
        merchantCustomerId: mc.id,
        tgId: mc.tgId,
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
