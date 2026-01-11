import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { isSystemAllAudience } from '../customer-audiences/audience.utils';

export type BroadcastArgs = {
  merchantId: string;
  channel: 'EMAIL' | 'PUSH' | 'ALL';
  segmentId?: string;
  template?: { subject?: string; text?: string; html?: string };
  variables?: any;
  dryRun?: boolean;
};

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {}

  async broadcast(args: BroadcastArgs) {
    const { merchantId, channel } = args;
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!channel) throw new BadRequestException('channel required');
    if (args.dryRun) {
      // Estimate recipients
      const estimated = await this.estimateRecipients(
        merchantId,
        channel,
        args.segmentId,
      );
      return { ok: true, dryRun: true, estimated };
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
      await this.prisma.eventOutbox.create({
        data: { merchantId, eventType: 'notify.broadcast', payload },
      });
    } catch (error) {
      throw new InternalServerErrorException(
        'Не удалось поставить рассылку в очередь',
      );
    }
    try {
      this.metrics.inc('notifications_enqueued_total', { type: channel });
    } catch {}
    return { ok: true };
  }

  async test(
    merchantId: string,
    channel: 'EMAIL' | 'PUSH',
    to: string,
    template?: { subject?: string; text?: string; html?: string },
  ) {
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!channel) throw new BadRequestException('channel required');
    if (!to) throw new BadRequestException('to required');
    if (channel === 'PUSH') {
      throw new BadRequestException('PUSH тест не поддерживается');
    }
    const payload = {
      type: 'test',
      channel,
      merchantId,
      to,
      template: template ?? null,
      at: new Date().toISOString(),
    } as any;
    try {
      await this.prisma.eventOutbox.create({
        data: { merchantId, eventType: 'notify.test', payload },
      });
    } catch (error) {
      throw new InternalServerErrorException(
        'Не удалось поставить тест в очередь',
      );
    }
    try {
      this.metrics.inc('notifications_enqueued_total', { type: channel });
    } catch {}
    return { ok: true };
  }

  private async estimateRecipients(
    merchantId: string,
    channel: 'EMAIL' | 'PUSH' | 'ALL',
    segmentId?: string,
  ): Promise<number> {
    try {
      if (segmentId) {
        const segment = await this.prisma.customerSegment.findFirst({
          where: { id: segmentId, merchantId },
          select: { id: true, isSystem: true, systemKey: true },
        });
        if (!segment) return 0;
        if (isSystemAllAudience(segment)) {
          return this.prisma.customerStats.count({ where: { merchantId } });
        }
        const size = await this.prisma.segmentCustomer.count({
          where: { segmentId },
        });
        return size;
      }
      // Per-channel estimations
      let emailCount = 0;
      let pushCount = 0;
      if (channel === 'EMAIL' || channel === 'ALL') {
        // Customers of merchant with non-null email (via CustomerStats relation)
        emailCount = await (this.prisma as any).customerStats.count({
          where: { merchantId, customer: { email: { not: null } } },
        });
        // If consents are used, take the minimum of granted consents and emails
        try {
          const granted = await this.prisma.customerConsent.count({
            where: { merchantId, channel: 'EMAIL', status: 'GRANTED' },
          });
          emailCount = Math.min(
            emailCount || granted,
            Math.max(emailCount, granted),
          );
        } catch {}
      }
      if (channel === 'PUSH' || channel === 'ALL') {
        // Distinct customers with active devices
        const groups = await (this.prisma as any).pushDevice.groupBy({
          by: ['customerId'],
          where: { merchantId, isActive: true },
          _count: true,
        });
        pushCount = Array.isArray(groups) ? groups.length : 0;
      }
      if (channel === 'ALL') return Math.max(emailCount, pushCount);
      if (channel === 'EMAIL') return emailCount;
      if (channel === 'PUSH') return pushCount;
      return 0;
    } catch {
      return 0;
    }
  }
}
