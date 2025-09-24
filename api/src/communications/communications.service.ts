import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CommunicationChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';


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
  promotionId?: string | null;
  scheduledAt?: Date | string | null;
  payload?: any;
  filters?: any;
  actorId?: string;
}

@Injectable()
export class CommunicationsService {
  private readonly logger = new Logger(CommunicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}


  async listTemplates(merchantId: string, channel?: CommunicationChannel | 'ALL') {
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
    if (!payload.name?.trim()) throw new BadRequestException('Название шаблона обязательно');
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
      this.metrics.inc('portal_communications_templates_changed_total', { action: 'create' });
    } catch {}
    return template;

  }

  async updateTemplate(merchantId: string, templateId: string, payload: TemplatePayload) {
    const template = await this.prisma.communicationTemplate.findFirst({ where: { merchantId, id: templateId } });
    if (!template) throw new NotFoundException('Шаблон не найден');
    if (template.isSystem && payload.isSystem === false) {
      throw new BadRequestException('Системные шаблоны нельзя переводить в пользовательские');
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
      this.metrics.inc('portal_communications_templates_changed_total', { action: 'update' });
    } catch {}
    return updated;
  }

  async archiveTemplate(merchantId: string, templateId: string) {
    const template = await this.prisma.communicationTemplate.findFirst({ where: { merchantId, id: templateId } });
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
      this.metrics.inc('portal_communications_templates_changed_total', { action: 'archive' });
    } catch {}
    return archived;
  }

  async listTasks(merchantId: string, channel?: CommunicationChannel | 'ALL', status?: string) {
    const where: Prisma.CommunicationTaskWhereInput = { merchantId };
    if (channel && channel !== 'ALL') where.channel = channel;
    if (status) where.status = status;

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
          total: tasks.length,
        }),
      );
      this.metrics.inc('portal_communications_tasks_list_total');
    } catch {}
    return tasks;
  }

  async createTask(merchantId: string, payload: TaskPayload) {
    const task = await this.prisma.communicationTask.create({
      data: {
        merchantId,
        channel: payload.channel,
        templateId: payload.templateId ?? null,
        audienceId: payload.audienceId ?? null,
        promotionId: payload.promotionId ?? null,
        scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null,
        payload: payload.payload ?? null,
        filters: payload.filters ?? null,
        createdById: payload.actorId ?? null,
      },
    });

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
      this.metrics.inc('portal_communications_tasks_changed_total', { action: 'create' });
    } catch {}
    return task;
  }

  async updateTaskStatus(merchantId: string, taskId: string, status: string) {
    const task = await this.prisma.communicationTask.findFirst({ where: { merchantId, id: taskId } });
    if (!task) throw new NotFoundException('Задача не найдена');
    
    const updated = await this.prisma.communicationTask.update({
      where: { id: taskId },
      data: { status },
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
      this.metrics.inc('portal_communications_tasks_changed_total', { action: 'status' });
    } catch {}
    return updated;
  }

  async getTaskRecipients(merchantId: string, taskId: string) {
    const task = await this.prisma.communicationTask.findFirst({ where: { merchantId, id: taskId } });
    if (!task) throw new NotFoundException('Задача не найдена');
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
}
