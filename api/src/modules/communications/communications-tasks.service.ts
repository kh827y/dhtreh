import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationTask,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MetricsService } from '../../core/metrics/metrics.service';
import { CommunicationsDispatcherWorker } from './communications-dispatcher.worker';
import type { TaskListOptions, TaskPayload } from './communications.types';
import {
  asRecord,
  cloneRecord,
  readString,
  toInputJsonValue,
  toNullableJsonInput,
  type JsonRecord,
} from './communications.utils';
import { logEvent, safeMetric } from '../../shared/logging/event-log.util';

@Injectable()
export class CommunicationsTasksService {
  private readonly logger = new Logger(CommunicationsTasksService.name);
  private readonly activeStatuses = ['SCHEDULED', 'RUNNING'];
  private readonly archivedStatuses = ['COMPLETED', 'FAILED'];
  private readonly allowedTaskStatuses = new Set([
    'SCHEDULED',
    'RUNNING',
    'COMPLETED',
    'FAILED',
  ]);
  private readonly maxTelegramTextLength = 4096;
  private readonly maxTelegramMediaBytes = 10 * 1024 * 1024;
  private readonly allowedTelegramMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly dispatcher: CommunicationsDispatcherWorker,
  ) {}

  async listTasks(merchantId: string, options: TaskListOptions = {}) {
    const { channel, status, scope } = options;
    const baseWhere: Prisma.CommunicationTaskWhereInput = { merchantId };
    if (channel && channel !== 'ALL') baseWhere.channel = channel;
    if (scope === 'ACTIVE') {
      baseWhere.status = { in: this.activeStatuses };
    }
    if (scope === 'ARCHIVED' && !status) {
      baseWhere.status = { in: this.archivedStatuses };
    }
    if (status) baseWhere.status = status;

    const tasks = await this.prisma.communicationTask.findMany({
      where: baseWhere,
      orderBy: { createdAt: 'desc' },
      include: { template: true, audience: true },
    });

    logEvent(this.logger, 'portal.communications.tasks.list', {
      merchantId,
      channel: channel && channel !== 'ALL' ? channel : 'ALL',
      status: status ?? 'ANY',
      scope: scope ?? 'ANY',
      total: tasks.length,
    });
    safeMetric(this.metrics, 'portal_communications_tasks_list_total');
    return tasks;
  }

  async listChannelTasks(
    merchantId: string,
    channel: CommunicationChannel,
    scope: 'ACTIVE' | 'ARCHIVED',
  ) {
    return this.listTasks(merchantId, { channel, scope });
  }

  async createTask(merchantId: string, payload: TaskPayload) {
    if (payload.channel === CommunicationChannel.PUSH) {
      return this.createPushTask(merchantId, payload);
    }
    if (payload.channel === CommunicationChannel.TELEGRAM) {
      return this.createTelegramTask(merchantId, payload);
    }
    return this.persistTask(merchantId, payload);
  }

  async duplicateTask(
    merchantId: string,
    taskId: string,
    options?: { scheduledAt?: Date | string | null; actorId?: string },
  ): Promise<CommunicationTask> {
    const original = await this.findOwnedTask(merchantId, taskId);
    const scheduledAt = this.resolveFutureDate(
      options?.scheduledAt ?? original.scheduledAt ?? null,
    );

    const data: Prisma.CommunicationTaskUncheckedCreateInput = {
      merchantId,
      channel: original.channel,
      templateId: original.templateId,
      audienceId: original.audienceId,
      audienceName: original.audienceName,
      audienceSnapshot:
        (original.audienceSnapshot as Prisma.InputJsonValue) ?? null,
      promotionId: original.promotionId,
      createdById: options?.actorId ?? original.createdById ?? null,
      status: 'SCHEDULED',
      scheduledAt,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      payload: (original.payload as Prisma.InputJsonValue) ?? null,
      filters: (original.filters as Prisma.InputJsonValue) ?? null,
      stats: Prisma.JsonNull,
      media: (original.media as Prisma.InputJsonValue) ?? null,
      timezone: original.timezone,
      archivedAt: null,
      totalRecipients: 0,
      sentCount: 0,
      failedCount: 0,
    };

    const task = await this.prisma.communicationTask.create({ data });
    logEvent(this.logger, 'portal.communications.tasks.duplicate', {
      merchantId,
      sourceTaskId: taskId,
      taskId: task.id,
      channel: task.channel,
      scheduledAt: task.scheduledAt ?? null,
    });
    safeMetric(this.metrics, 'portal_communications_tasks_changed_total', {
      action: 'duplicate',
    });
    return task;
  }

  async updateTaskStatus(merchantId: string, taskId: string, status: string) {
    const task = await this.findOwnedTask(merchantId, taskId);
    const normalized = String(status || '')
      .trim()
      .toUpperCase();
    if (!this.allowedTaskStatuses.has(normalized)) {
      throw new BadRequestException('Некорректный статус рассылки');
    }

    const now = new Date();
    const data: Prisma.CommunicationTaskUpdateInput = { status: normalized };
    if (normalized === 'COMPLETED' && !task.completedAt) data.completedAt = now;
    if (normalized === 'FAILED' && !task.failedAt) data.failedAt = now;
    if (this.archivedStatuses.includes(normalized) && !task.archivedAt)
      data.archivedAt = now;

    const updated = await this.prisma.communicationTask.update({
      where: { id: taskId },
      data,
    });
    logEvent(this.logger, 'portal.communications.tasks.status', {
      merchantId,
      taskId,
      status: normalized,
    });
    safeMetric(this.metrics, 'portal_communications_tasks_changed_total', {
      action: 'status',
    });
    return updated;
  }

  async deleteTask(merchantId: string, taskId: string) {
    await this.findOwnedTask(merchantId, taskId);
    await this.prisma.communicationTask.delete({ where: { id: taskId } });
    logEvent(this.logger, 'portal.communications.tasks.delete', {
      merchantId,
      taskId,
    });
    safeMetric(this.metrics, 'portal_communications_tasks_changed_total', {
      action: 'delete',
    });
    return { ok: true };
  }

  async getTaskRecipients(
    merchantId: string,
    taskId: string,
    options?: { limit?: number; offset?: number },
  ) {
    await this.findOwnedTask(merchantId, taskId);
    const limit =
      options?.limit !== undefined
        ? Math.min(Math.max(options.limit, 1), 500)
        : undefined;
    const offset =
      options?.offset !== undefined ? Math.max(options.offset, 0) : undefined;
    const recipients = await this.prisma.communicationTaskRecipient.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      ...(limit ? { take: limit } : {}),
      ...(offset ? { skip: offset } : {}),
    });
    logEvent(this.logger, 'portal.communications.tasks.recipients', {
      merchantId,
      taskId,
      total: recipients.length,
      limit: limit ?? null,
      offset: offset ?? null,
    });
    safeMetric(this.metrics, 'portal_communications_task_recipients_total');
    return recipients;
  }

  async getAsset(merchantId: string, assetId: string) {
    const asset = await this.prisma.communicationAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset || asset.merchantId !== merchantId) {
      throw new NotFoundException('Файл не найден');
    }
    return asset;
  }

  private async createPushTask(merchantId: string, payload: TaskPayload) {
    const payloadData = cloneRecord(payload.payload);
    const text = (readString(payloadData.text) ?? '').trim();
    if (!text) {
      throw new BadRequestException('Текст уведомления обязателен');
    }
    if (text.length > 300) {
      throw new BadRequestException(
        'Длина текста не должна превышать 300 символов',
      );
    }
    let audienceCode =
      payload.audienceCode ?? (readString(payloadData.audience) ?? '').trim();
    if (!audienceCode && !payload.audienceId) {
      audienceCode = 'ALL';
    }
    const scheduledAt =
      payload.scheduledAt === null || payload.scheduledAt === undefined
        ? null
        : this.resolveFutureDate(payload.scheduledAt);
    const snapshot =
      asRecord(payload.audienceSnapshot) ??
      (() => {
        const base: JsonRecord = {};
        if (audienceCode) base.code = audienceCode;
        if (payload.audienceId) base.audienceId = payload.audienceId;
        if (payload.audienceName) base.audienceName = payload.audienceName;
        return Object.keys(base).length ? base : null;
      })();
    const snapshotInput = toInputJsonValue(snapshot);

    const targetName =
      payload.audienceName ??
      audienceCode ??
      (payload.audienceId ? 'Выбранная аудитория' : 'Все клиенты');
    const task = await this.persistTask(merchantId, {
      ...payload,
      scheduledAt,
      audienceName: targetName,
      audienceSnapshot: snapshotInput,
      audienceId: payload.audienceId ?? null,
      payload: { ...payloadData, text } as Prisma.InputJsonValue,
      timezone: payload.timezone ?? null,
    });
    if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
      this.dispatcher.triggerImmediate(task.id);
    }
    return task;
  }

  private async createTelegramTask(merchantId: string, payload: TaskPayload) {
    await this.ensureTelegramEnabled(merchantId);
    const payloadData = cloneRecord(payload.payload);
    const text = (readString(payloadData.text) ?? '').trim();
    if (!text) {
      throw new BadRequestException('Текст сообщения обязателен');
    }
    if (text.length > this.maxTelegramTextLength) {
      throw new BadRequestException(
        `Текст не должен превышать ${this.maxTelegramTextLength} символов`,
      );
    }

    const scheduledAt = payload.scheduledAt
      ? this.resolveFutureDate(payload.scheduledAt)
      : null;
    const audienceSnapshot = asRecord(payload.audienceSnapshot) ?? {
      audienceId: payload.audienceId ?? null,
      code: payload.audienceCode ?? null,
      audienceName: payload.audienceName ?? null,
    };
    const audienceSnapshotInput = toInputJsonValue(audienceSnapshot);

    const mediaDescriptor = await this.prepareTelegramMedia(
      merchantId,
      payload,
    );

    const task = await this.persistTask(merchantId, {
      ...payload,
      scheduledAt,
      audienceSnapshot: audienceSnapshotInput,
      payload: { ...payloadData, text } as Prisma.InputJsonValue,
      media: mediaDescriptor as Prisma.InputJsonValue | null,
      timezone: payload.timezone ?? null,
    });
    if (!task.scheduledAt || task.scheduledAt.getTime() <= Date.now()) {
      this.dispatcher.triggerImmediate(task.id);
    }
    return task;
  }

  private async persistTask(
    merchantId: string,
    payload: TaskPayload,
    overrides?: Partial<Prisma.CommunicationTaskUncheckedCreateInput>,
  ) {
    const data = this.buildCreateData(merchantId, payload, overrides);
    const task = await this.prisma.communicationTask.create({ data });

    logEvent(this.logger, 'portal.communications.tasks.create', {
      merchantId,
      taskId: task.id,
      channel: task.channel,
      scheduledAt: task.scheduledAt ?? null,
    });
    safeMetric(this.metrics, 'portal_communications_tasks_changed_total', {
      action: 'create',
    });
    return task;
  }

  private normalizeStats(stats?: Record<string, unknown> | null) {
    if (!stats) {
      return {
        statsJson: Prisma.JsonNull,
        totalRecipients: 0,
        sentCount: 0,
        failedCount: 0,
      };
    }
    const totalRecipients = this.toNumber(
      stats.totalRecipients ?? stats.total ?? 0,
    );
    const sentCount = this.toNumber(stats.sent ?? stats.delivered ?? 0);
    const failedCount = this.toNumber(stats.failed ?? stats.errors ?? 0);
    return {
      statsJson: stats as Prisma.InputJsonValue,
      totalRecipients,
      sentCount,
      failedCount,
    };
  }

  private buildAudienceSnapshot(payload: TaskPayload) {
    const snapshot =
      asRecord(payload.audienceSnapshot) ??
      (payload.audienceCode ? { code: payload.audienceCode } : undefined);
    const audienceName = payload.audienceName ?? payload.audienceCode ?? null;
    return { audienceName, snapshot: toInputJsonValue(snapshot) };
  }

  private buildCreateData(
    merchantId: string,
    payload: TaskPayload,
    overrides?: Partial<Prisma.CommunicationTaskUncheckedCreateInput>,
  ): Prisma.CommunicationTaskUncheckedCreateInput {
    const scheduledAt = this.normalizeScheduledAt(payload.scheduledAt);
    const { statsJson, totalRecipients, sentCount, failedCount } =
      this.normalizeStats(null);
    const { audienceName, snapshot } = this.buildAudienceSnapshot(payload);

    const data: Prisma.CommunicationTaskUncheckedCreateInput = {
      merchantId,
      channel: payload.channel,
      templateId: payload.templateId ?? null,
      audienceId: payload.audienceId ?? null,
      audienceName,
      audienceSnapshot: toNullableJsonInput(snapshot),
      promotionId: payload.promotionId ?? null,
      createdById: payload.actorId ?? null,
      status: 'SCHEDULED',
      scheduledAt,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      payload: toNullableJsonInput(payload.payload),
      filters: toNullableJsonInput(payload.filters),
      stats: statsJson,
      media: toNullableJsonInput(payload.media),
      timezone: payload.timezone ?? null,
      archivedAt: null,
      totalRecipients,
      sentCount,
      failedCount,
    };

    return { ...data, ...(overrides ?? {}) };
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.trunc(parsed));
  }

  private normalizeScheduledAt(input?: Date | string | null): Date | null {
    if (!input) return null;
    const value = typeof input === 'string' ? new Date(input) : input;
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new BadRequestException('Некорректная дата запуска рассылки');
    }
    return value;
  }

  private resolveFutureDate(input?: Date | string | null): Date {
    const value = this.normalizeScheduledAt(input);
    if (!value) {
      throw new BadRequestException('Некорректная дата запуска рассылки');
    }
    if (value.getTime() < Date.now() - 5 * 60 * 1000) {
      throw new BadRequestException(
        'Дата начала отправки не может быть в прошлом',
      );
    }
    return value;
  }

  private async ensureTelegramEnabled(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { telegramBotEnabled: true },
    });

    if (!merchant?.telegramBotEnabled) {
      throw new BadRequestException(
        'Подключите Telegram-бота, чтобы отправлять рассылки',
      );
    }
  }

  private async prepareTelegramMedia(
    merchantId: string,
    payload: TaskPayload,
  ): Promise<Prisma.JsonValue | null> {
    const mediaInput = asRecord(payload.media);
    if (!mediaInput) return null;

    const assetIdRaw = mediaInput.assetId;
    if (typeof assetIdRaw === 'string' || typeof assetIdRaw === 'number') {
      const asset = await this.prisma.communicationAsset.findFirst({
        where: { id: String(assetIdRaw), merchantId },
        select: { id: true },
      });
      if (!asset) {
        throw new BadRequestException('Указанный медиафайл не найден');
      }
      return { assetId: asset.id } as Prisma.JsonObject;
    }

    const base64Raw =
      readString(mediaInput.imageBase64) ??
      readString(mediaInput.base64) ??
      readString(mediaInput.dataUrl);
    if (!base64Raw) return null;

    const parsed = this.decodeBase64Payload(
      base64Raw,
      readString(mediaInput.mimeType) ?? undefined,
      readString(mediaInput.fileName) ?? undefined,
    );
    if (parsed.buffer.length === 0) {
      throw new BadRequestException('Пустой медиафайл для рассылки');
    }
    if (parsed.buffer.length > this.maxTelegramMediaBytes) {
      throw new BadRequestException(
        `Изображение не должно превышать ${Math.floor(this.maxTelegramMediaBytes / (1024 * 1024))} МБ`,
      );
    }
    if (!this.allowedTelegramMimeTypes.includes(parsed.mimeType)) {
      throw new BadRequestException('Неподдерживаемый формат изображения');
    }

    const asset = await this.prisma.communicationAsset.create({
      data: {
        merchantId,
        channel: CommunicationChannel.TELEGRAM,
        kind: 'MEDIA',
        fileName: parsed.fileName,
        mimeType: parsed.mimeType,
        byteSize: parsed.buffer.length,
        data: parsed.buffer,
      },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        byteSize: true,
      },
    });

    return {
      assetId: asset.id,
      fileName: asset.fileName ?? null,
      mimeType: asset.mimeType ?? null,
      byteSize: asset.byteSize,
    } as Prisma.JsonObject;
  }

  private decodeBase64Payload(
    raw: string,
    mimeHint?: string,
    fileHint?: string,
  ): { buffer: Buffer; mimeType: string; fileName: string | null } {
    const match = raw.match(/^data:([^;]+);base64,(.*)$/);
    let mimeType = mimeHint ?? 'application/octet-stream';
    let base64 = raw;
    if (match) {
      mimeType = match[1] || mimeType;
      base64 = match[2] || '';
    }
    const cleaned = base64.replace(/\s+/g, '');
    const buffer = Buffer.from(cleaned, 'base64');
    const fileName = fileHint
      ? String(fileHint)
      : this.defaultFileNameForMime(mimeType);
    return { buffer, mimeType, fileName };
  }

  private defaultFileNameForMime(mime: string): string {
    if (mime === 'image/png') return 'image.png';
    if (mime === 'image/webp') return 'image.webp';
    return 'image.jpg';
  }

  private async findOwnedTask(
    merchantId: string,
    taskId: string,
  ): Promise<CommunicationTask> {
    const task = await this.prisma.communicationTask.findUnique({
      where: { id: taskId },
    });
    if (!task || task.merchantId !== merchantId) {
      throw new NotFoundException('Задача не найдена');
    }
    return task;
  }
}
