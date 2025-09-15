import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';

export type BroadcastArgs = {
  merchantId: string;
  channel: 'EMAIL'|'PUSH'|'SMS'|'ALL';
  segmentId?: string;
  template?: { subject?: string; text?: string; html?: string };
  variables?: any;
  dryRun?: boolean;
};

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  async broadcast(args: BroadcastArgs) {
    const { merchantId, channel } = args;
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!channel) throw new BadRequestException('channel required');
    if (args.dryRun) {
      // later: compute segment size; for now return ok
      return { ok: true, dryRun: true, estimated: null };
    }
    const payload = {
      type: 'broadcast',
      channel,
      merchantId,
      segmentId: args.segmentId ?? null,
      template: args.template ?? null,
      variables: args.variables ?? null,
      at: new Date().toISOString(),
    } as any;
    try {
      await this.prisma.eventOutbox.create({ data: { merchantId, eventType: 'notify.broadcast', payload } });
      try { this.metrics.inc('notifications_enqueued_total', { type: channel }); } catch {}
    } catch {}
    return { ok: true };
  }

  async test(merchantId: string, channel: 'EMAIL'|'PUSH'|'SMS', to: string, template?: { subject?: string; text?: string; html?: string }) {
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!channel) throw new BadRequestException('channel required');
    if (!to) throw new BadRequestException('to required');
    const payload = { type: 'test', channel, merchantId, to, template: template ?? null, at: new Date().toISOString() } as any;
    try {
      await this.prisma.eventOutbox.create({ data: { merchantId, eventType: 'notify.test', payload } });
      try { this.metrics.inc('notifications_enqueued_total', { type: channel }); } catch {}
    } catch {}
    return { ok: true };
  }
}
