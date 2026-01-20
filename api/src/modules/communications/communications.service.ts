import { Injectable } from '@nestjs/common';
import { CommunicationChannel } from '@prisma/client';
import { CommunicationsTemplatesService } from './communications-templates.service';
import { CommunicationsTasksService } from './communications-tasks.service';
import type {
  TaskListOptions,
  TaskPayload,
  TemplatePayload,
} from './communications.types';

export type { TaskListOptions, TaskPayload, TemplatePayload };

@Injectable()
export class CommunicationsService {
  constructor(
    private readonly templates: CommunicationsTemplatesService,
    private readonly tasks: CommunicationsTasksService,
  ) {}

  listTemplates(merchantId: string, channel?: CommunicationChannel | 'ALL') {
    return this.templates.listTemplates(merchantId, channel);
  }

  createTemplate(merchantId: string, payload: TemplatePayload) {
    return this.templates.createTemplate(merchantId, payload);
  }

  updateTemplate(merchantId: string, templateId: string, payload: TemplatePayload) {
    return this.templates.updateTemplate(merchantId, templateId, payload);
  }

  archiveTemplate(merchantId: string, templateId: string) {
    return this.templates.archiveTemplate(merchantId, templateId);
  }

  listTasks(merchantId: string, options: TaskListOptions = {}) {
    return this.tasks.listTasks(merchantId, options);
  }

  listChannelTasks(
    merchantId: string,
    channel: CommunicationChannel,
    scope: 'ACTIVE' | 'ARCHIVED',
  ) {
    return this.tasks.listChannelTasks(merchantId, channel, scope);
  }

  createTask(merchantId: string, payload: TaskPayload) {
    return this.tasks.createTask(merchantId, payload);
  }

  duplicateTask(
    merchantId: string,
    taskId: string,
    options?: { scheduledAt?: Date | string | null; actorId?: string },
  ) {
    return this.tasks.duplicateTask(merchantId, taskId, options);
  }

  updateTaskStatus(merchantId: string, taskId: string, status: string) {
    return this.tasks.updateTaskStatus(merchantId, taskId, status);
  }

  deleteTask(merchantId: string, taskId: string) {
    return this.tasks.deleteTask(merchantId, taskId);
  }

  getTaskRecipients(
    merchantId: string,
    taskId: string,
    options?: { limit?: number; offset?: number },
  ) {
    return this.tasks.getTaskRecipients(merchantId, taskId, options);
  }

  getAsset(merchantId: string, assetId: string) {
    return this.tasks.getAsset(merchantId, assetId);
  }
}
