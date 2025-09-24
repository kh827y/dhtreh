import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CommunicationChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  async listTemplates(merchantId: string, channel?: CommunicationChannel | 'ALL') {
    const where: Prisma.CommunicationTemplateWhereInput = { merchantId };
    if (channel && channel !== 'ALL') where.channel = channel;
    return this.prisma.communicationTemplate.findMany({
      where,
      orderBy: [{ archivedAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createTemplate(merchantId: string, payload: TemplatePayload) {
    if (!payload.name?.trim()) throw new BadRequestException('Название шаблона обязательно');
    return this.prisma.communicationTemplate.create({
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
  }

  async updateTemplate(merchantId: string, templateId: string, payload: TemplatePayload) {
    const template = await this.prisma.communicationTemplate.findFirst({ where: { merchantId, id: templateId } });
    if (!template) throw new NotFoundException('Шаблон не найден');
    if (template.isSystem && payload.isSystem === false) {
      throw new BadRequestException('Системные шаблоны нельзя переводить в пользовательские');
    }
    return this.prisma.communicationTemplate.update({
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
  }

  async archiveTemplate(merchantId: string, templateId: string) {
    const template = await this.prisma.communicationTemplate.findFirst({ where: { merchantId, id: templateId } });
    if (!template) throw new NotFoundException('Шаблон не найден');
    return this.prisma.communicationTemplate.update({
      where: { id: templateId },
      data: { archivedAt: new Date() },
    });
  }

  async listTasks(merchantId: string, channel?: CommunicationChannel | 'ALL', status?: string) {
    const where: Prisma.CommunicationTaskWhereInput = { merchantId };
    if (channel && channel !== 'ALL') where.channel = channel;
    if (status) where.status = status;
    return this.prisma.communicationTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { template: true, audience: true },
    });
  }

  async createTask(merchantId: string, payload: TaskPayload) {
    return this.prisma.communicationTask.create({
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
  }

  async updateTaskStatus(merchantId: string, taskId: string, status: string) {
    const task = await this.prisma.communicationTask.findFirst({ where: { merchantId, id: taskId } });
    if (!task) throw new NotFoundException('Задача не найдена');
    return this.prisma.communicationTask.update({
      where: { id: taskId },
      data: { status },
    });
  }

  async getTaskRecipients(merchantId: string, taskId: string) {
    const task = await this.prisma.communicationTask.findFirst({ where: { merchantId, id: taskId } });
    if (!task) throw new NotFoundException('Задача не найдена');
    return this.prisma.communicationTaskRecipient.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
