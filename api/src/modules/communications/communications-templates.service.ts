import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CommunicationChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MetricsService } from '../../core/metrics/metrics.service';
import { logEvent, safeMetric } from '../../shared/logging/event-log.util';
import type { TemplatePayload } from './communications.types';
import { toNullableJsonInput } from './communications.utils';

@Injectable()
export class CommunicationsTemplatesService {
  private readonly logger = new Logger(CommunicationsTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
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
    logEvent(this.logger, 'portal.communications.templates.list', {
      merchantId,
      channel: channel && channel !== 'ALL' ? channel : 'ALL',
      total: templates.length,
    });
    safeMetric(this.metrics, 'portal_communications_templates_list_total');
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
        content: (payload.content ?? {}) as Prisma.InputJsonValue,
        preview: toNullableJsonInput(payload.preview ?? null),
        isSystem: payload.isSystem ?? false,
        createdById: payload.actorId ?? null,
        updatedById: payload.actorId ?? null,
      },
    });
    logEvent(this.logger, 'portal.communications.templates.create', {
      merchantId,
      templateId: template.id,
      channel: template.channel,
    });
    safeMetric(this.metrics, 'portal_communications_templates_changed_total', {
      action: 'create',
    });
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
        content: (payload.content ?? template.content) as Prisma.InputJsonValue,
        preview: toNullableJsonInput(
          (payload.preview ?? template.preview) as Prisma.InputJsonValue | null,
        ),
        isSystem: payload.isSystem ?? template.isSystem,
        updatedById: payload.actorId ?? template.updatedById,
      },
    });

    logEvent(this.logger, 'portal.communications.templates.update', {
      merchantId,
      templateId,
      channel: updated.channel,
    });
    safeMetric(this.metrics, 'portal_communications_templates_changed_total', {
      action: 'update',
    });
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
    logEvent(this.logger, 'portal.communications.templates.archive', {
      merchantId,
      templateId,
    });
    safeMetric(this.metrics, 'portal_communications_templates_changed_total', {
      action: 'archive',
    });
    return archived;
  }
}
