import type { CommunicationChannel, Prisma } from '@prisma/client';

export interface TemplatePayload {
  name: string;
  channel: CommunicationChannel;
  subject?: string | null;
  content?: Prisma.InputJsonValue;
  preview?: Prisma.InputJsonValue | null;
  isSystem?: boolean;
  actorId?: string;
}

export interface TaskPayload {
  channel: CommunicationChannel;
  templateId?: string | null;
  audienceId?: string | null;
  audienceName?: string | null;
  audienceCode?: string | null;
  audienceSnapshot?: Prisma.InputJsonValue | null;
  promotionId?: string | null;
  scheduledAt?: Date | string | null;
  timezone?: string | null;
  payload?: Prisma.InputJsonValue | null;
  media?: Prisma.InputJsonValue | null;
  filters?: Prisma.InputJsonValue | null;
  stats?: Record<string, unknown> | null;
  actorId?: string;
}

export interface TaskListOptions {
  channel?: CommunicationChannel | 'ALL';
  status?: string;
  scope?: 'ACTIVE' | 'ARCHIVED';
}
