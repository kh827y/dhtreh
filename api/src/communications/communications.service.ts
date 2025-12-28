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
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { CommunicationsDispatcherWorker } from './communications-dispatcher.worker';

export interface TemplatePayload {
  name: string;
  channel: CommunicationChannel;
  subject?: string | null;
  content: any;
  preview?: any;
  isSystem?: boolean;
  actorId?: string;
}

export interface TaskPayload {
  channel: CommunicationChannel;
  templateId?: string | null;
  audienceId?: string | null;
  audienceName?: string | null;
  audienceCode?: string | null;
  audienceSnapshot?: any;
  promotionId?: string | null;
  scheduledAt?: Date | string | null;
  timezone?: string | null;
  payload?: any;
  media?: any;
  filters?: any;
  stats?: Record<string, any> | null;
  actorId?: string;
}

interface TaskListOptions {
  channel?: CommunicationChannel | 'ALL';
  status?: string;
  scope?: 'ACTIVE' | 'ARCHIVED';
}

@Injectable()
export class CommunicationsService {
  private readonly logger = new Logger(CommunicationsService.name);
  private readonly activeStatuses = ['SCHEDULED', 'RUNNING', 'PAUSED'];
  private readonly archivedStatuses = ['COMPLETED', 'CANCELED', 'ARCHIVED'];
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

  async listTemplates(
    merchantId: string,
    channel?: CommunicationChannel | 'ALL',
  ) {
    const where: Prisma.CommunicationTemplateWhereInput = { merchantId };
    if (channel && channel !== 'ALL') where.channel = channel;
    const templates = await this.prisma.communicationTemplate.findMany({
      where,
      orderBy: [{ archivedAt: 'asc' }, { createdAt: 'desc' }],
    });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.communications.templates.list',
          merchantId,
          channel: channel && channel !== 'ALL' ? channel : 'ALL',
          total: templates.length,
        }),
      );
      this.metrics.inc('portal_communications_templates_list_total');
    } catch {}
    return templates;
  }

  async createTemplate(merchantId: string, payload: TemplatePayload) {
    if (!payload.name?.trim())
      throw new BadRequestException('Название шаблона обязательно');
    const template = await this.prisma.communicationTemplate.create({
      data: {
        merchantId,
        name: payload.name.trim(),
        channel: payload.channel,
        subject: payload.subject ?? null,
        content: payload.content ?? {},
        preview: payload.preview ?? null,
        isSystem: payload.isSystem ?? false,
        createdById: payload.actorId ?? null,
        updatedById: payload.actorId ?? null,
      },
    });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.communications.templates.create',
          merchantId,
          templateId: template.id,
          channel: template.channel,
        }),
      );
      this.metrics.inc('portal_communications_templates_changed_total', {
        action: 'create',
      });
    } catch {}
    return template;
  }

  async updateTemplate(
    merchantId: string,
    templateId: string,
    payload: TemplatePayload,
  ) {
    const template = await this.prisma.communicationTemplate.findFirst({
      where: { merchantId, id: templateId },
    });
    if (!template) throw new NotFoundException('Шаблон не найден');
    if (template.isSystem && payload.isSystem === false) {
      throw new BadRequestException(
        'Системные шаблоны нельзя переводить в пользовательские',
      );
    }
    const updated = await this.prisma.communicationTemplate.update({
      where: { id: templateId },
      data: {
        name: payload.name?.trim() ?? template.name,
        channel: payload.channel ?? template.channel,
        subject: payload.subject ?? template.subject,
        content: payload.content ?? template.content,
        preview: payload.preview ?? template.preview,
        isSystem: payload.isSystem ?? template.isSystem,
        updatedById: payload.actorId ?? template.updatedById,
      },
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.communications.templates.update',
          merchantId,
          templateId,
          channel: updated.channel,
        }),
      );
      this.metrics.inc('portal_communications_templates_changed_total', {
        action: 'update',
      });
    } catch {}
    return updated;
  }

  async archiveTemplate(merchantId: string, templateId: string) {
    const template = await this.prisma.communicationTemplate.findFirst({
      where: { merchantId, id: templateId },
    });
    if (!template) throw new NotFoundException('Шаблон не найден');

    const archived = await this.prisma.communicationTemplate.update({
      where: { id: templateId },
      data: { archivedAt: new Date() },
    });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.communications.templates.archive',
          merchantId,
          templateId,
        }),
      );
      this.metrics.inc('portal_communications_templates_changed_total', {
        action: 'archive',
      });
    } catch {}
    return archived;
  }

  async listTasks(merchantId: string, options: TaskListOptions = {}) {
    const { channel, status, scope } = options;
    const baseWhere: Prisma.CommunicationTaskWhereInput = { merchantId };
    if (channel && channel !== 'ALL') baseWhere.channel = channel;
    if (scope === 'ACTIVE') {
      baseWhere.archivedAt = null;
      baseWhere.status = { in: this.activeStatuses };
    }
    if (status) baseWhere.status = status;
    const orFilters =
      scope === 'ARCHIVED' && !status
        ? [
            { archivedAt: { not: null } },
            { status: { in: this.archivedStatuses } },
          ]
        : undefined;

    const where = orFilters ? { ...baseWhere, OR: orFilters } : baseWhere;

    const tasks = await this.prisma.communicationTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { template: true, audience: true },
    });

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.communications.tasks.list',
          merchantId,
          channel: channel && channel !== 'ALL' ? channel : 'ALL',
          status: status ?? 'ANY',
          scope: scope ?? 'ANY',
          total: tasks.length,
        }),
      );
      this.metrics.inc('portal_communications_tasks_list_total');
    } catch {}
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

  private async createPushTask(merchantId: string, payload: TaskPayload) {
    const text = String(payload?.payload?.text ?? '').trim();
    if (!text) {
      throw new BadRequestException('Текст уведомления обязателен');
    }
    if (text.length > 300) {
      throw new BadRequestException(
        'Длина текста не должна превышать 300 символов',
      );
    }
    let audienceCode =
      payload.audienceCode ??
      (typeof payload.payload?.audience === 'string'
        ? String(payload.payload.audience).trim()
        : '');
    if (!audienceCode && !payload.audienceId) {
      audienceCode = 'ALL';
    }
    const scheduledAt =
      payload.scheduledAt === null || payload.scheduledAt === undefined
        ? null
        : this.resolveFutureDate(payload.scheduledAt);
    const snapshot =
      payload.audienceSnapshot ??
      (() => {
        const base: Record<string, any> = {};
        if (audienceCode) base.code = audienceCode;
        if (payload.audienceId) base.audienceId = payload.audienceId;
        if (payload.audienceName) base.audienceName = payload.audienceName;
        return Object.keys(base).length ? base : null;
      })();

    const targetName =
      payload.audienceName ??
      audienceCode ??
      (payload.audienceId ? 'Выбранная аудитория' : 'Все клиенты');
    const task = await this.persistTask(merchantId, {
      ...payload,
      scheduledAt,
      audienceName: targetName,
      audienceSnapshot: snapshot,
      audienceId: payload.audienceId ?? null,
      payload: { ...(payload.payload ?? {}), text },
      timezone: payload.timezone ?? null,
    });
    if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
      this.dispatcher.triggerImmediate(task.id);
    }
    return task;
  }

  private async createTelegramTask(merchantId: string, payload: TaskPayload) {
    await this.ensureTelegramEnabled(merchantId);
    const text = String(payload?.payload?.text ?? '').trim();
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
    const audienceSnapshot = payload.audienceSnapshot ?? {
      audienceId: payload.audienceId ?? null,
      code: payload.audienceCode ?? null,
      audienceName: payload.audienceName ?? null,
    };

    const mediaDescriptor = await this.prepareTelegramMedia(
      merchantId,
      payload,
    );

    const task = await this.persistTask(merchantId, {
      ...payload,
      scheduledAt,
      audienceSnapshot,
      payload: { ...(payload.payload ?? {}), text },
      media: mediaDescriptor,
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

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.communications.tasks.create',
          merchantId,
          taskId: task.id,
          channel: task.channel,
          scheduledAt: task.scheduledAt ?? null,
        }),
      );
      this.metrics.inc('portal_communications_tasks_changed_total', {
        action: 'create',
      });
    } catch {}

    return task;
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

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.communications.tasks.duplicate',
          merchantId,
          sourceTaskId: taskId,
          taskId: task.id,
          channel: task.channel,
          scheduledAt: task.scheduledAt ?? null,
        }),
      );
      this.metrics.inc('portal_communications_tasks_changed_total', {
        action: 'duplicate',
      });
    } catch {}

    return task;
  }

  async updateTaskStatus(merchantId: string, taskId: string, status: string) {
    const task = await this.findOwnedTask(merchantId, taskId);

    const now = new Date();
    const data: Prisma.CommunicationTaskUpdateInput = { status };
    if (status === 'COMPLETED' && !task.completedAt) data.completedAt = now;
    if (status === 'FAILED' && !task.failedAt) data.failedAt = now;
    if (this.archivedStatuses.includes(status) && !task.archivedAt)
      data.archivedAt = now;

    const updated = await this.prisma.communicationTask.update({
      where: { id: taskId },
      data,
    });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.communications.tasks.status',
          merchantId,
          taskId,
          status,
        }),
      );
      this.metrics.inc('portal_communications_tasks_changed_total', {
        action: 'status',
      });
    } catch {}
    return updated;
  }

  async getTaskRecipients(merchantId: string, taskId: string) {
    await this.findOwnedTask(merchantId, taskId);
    const recipients = await this.prisma.communicationTaskRecipient.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.communications.tasks.recipients',
          merchantId,
          taskId,
          total: recipients.length,
        }),
      );
      this.metrics.inc('portal_communications_task_recipients_total');
    } catch {}
    return recipients;
  }

  private normalizeStats(stats?: Record<string, any> | null) {
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
      payload.audienceSnapshot ??
      (payload.audienceCode ? { code: payload.audienceCode } : undefined);
    const audienceName = payload.audienceName ?? payload.audienceCode ?? null;
    return { audienceName, snapshot: snapshot ?? null };
  }

  private buildCreateData(
    merchantId: string,
    payload: TaskPayload,
    overrides?: Partial<Prisma.CommunicationTaskUncheckedCreateInput>,
  ): Prisma.CommunicationTaskUncheckedCreateInput {
    const scheduledAt = this.normalizeScheduledAt(payload.scheduledAt);
    const { statsJson, totalRecipients, sentCount, failedCount } =
      this.normalizeStats(payload.stats);
    const { audienceName, snapshot } = this.buildAudienceSnapshot(payload);

    const data: Prisma.CommunicationTaskUncheckedCreateInput = {
      merchantId,
      channel: payload.channel,
      templateId: payload.templateId ?? null,
      audienceId: payload.audienceId ?? null,
      audienceName,
      audienceSnapshot: snapshot,
      promotionId: payload.promotionId ?? null,
      createdById: payload.actorId ?? null,
      status: 'SCHEDULED',
      scheduledAt,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      payload: payload.payload ?? null,
      filters: payload.filters ?? null,
      stats: statsJson,
      media: payload.media ?? null,
      timezone: payload.timezone ?? null,
      archivedAt: null,
      totalRecipients,
      sentCount,
      failedCount,
    };

    return { ...data, ...(overrides ?? {}) };
  }

  private toNumber(value: any): number {
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
    const mediaInput = payload.media ?? null;
    if (!mediaInput) return null;

    if (mediaInput.assetId) {
      const asset = await this.prisma.communicationAsset.findFirst({
        where: { id: String(mediaInput.assetId), merchantId },
        select: { id: true },
      });
      if (!asset) {
        throw new BadRequestException('Указанный медиафайл не найден');
      }
      return { assetId: asset.id } as Prisma.JsonObject;
    }

    const base64Raw =
      mediaInput.imageBase64 || mediaInput.base64 || mediaInput.dataUrl;
    if (!base64Raw || typeof base64Raw !== 'string') return null;

    const parsed = this.decodeBase64Payload(
      base64Raw,
      mediaInput.mimeType,
      mediaInput.fileName,
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

  async getAsset(merchantId: string, assetId: string) {
    const asset = await this.prisma.communicationAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset || asset.merchantId !== merchantId) {
      throw new NotFoundException('Файл не найден');
    }
    return asset;
  }
}
