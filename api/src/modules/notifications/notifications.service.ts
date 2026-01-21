import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MetricsService } from '../../core/metrics/metrics.service';
import { isSystemAllAudience } from '../customer-audiences/audience.utils';
import { Prisma } from '@prisma/client';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';

export type BroadcastArgs = {
  merchantId: string;
  channel: 'EMAIL' | 'PUSH' | 'ALL';
  segmentId?: string;
  template?: { subject?: string; text?: string; html?: string };
  variables?: Record<string, unknown>;
  dryRun?: boolean;
};

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {}

  private toJsonValue(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull {
    if (value === null || value === undefined) return Prisma.JsonNull;
    try {
      const normalized = JSON.parse(JSON.stringify(value)) as unknown;
      if (normalized === null) return Prisma.JsonNull;
      return normalized as Prisma.InputJsonValue;
    } catch (err) {
      logIgnoredError(err, 'NotificationsService toJsonValue', undefined, 'debug');
      return Prisma.JsonNull;
    }
  }

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
    const payload = this.toJsonValue({
      type: 'broadcast',
      channel,
      merchantId,
      segmentId: args.segmentId ?? null,
      template: args.template ?? null,
      variables: args.variables ?? null,
      at: new Date().toISOString(),
    });
    try {
      await this.prisma.eventOutbox.create({
        data: { merchantId, eventType: 'notify.broadcast', payload },
      });
    } catch (err) {
      logIgnoredError(
        err,
        'NotificationsService enqueue broadcast',
        undefined,
        'debug',
      );
      throw new InternalServerErrorException(
        'Не удалось поставить рассылку в очередь',
      );
    }
    try {
      this.metrics.inc('notifications_enqueued_total', { type: channel });
    } catch (err) {
      logIgnoredError(
        err,
        'NotificationsService metrics',
        undefined,
        'debug',
      );
    }
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
    const payload = this.toJsonValue({
      type: 'test',
      channel,
      merchantId,
      to,
      template: template ?? null,
      at: new Date().toISOString(),
    });
    try {
      await this.prisma.eventOutbox.create({
        data: { merchantId, eventType: 'notify.test', payload },
      });
    } catch (err) {
      logIgnoredError(
        err,
        'NotificationsService enqueue test',
        undefined,
        'debug',
      );
      throw new InternalServerErrorException(
        'Не удалось поставить тест в очередь',
      );
    }
    try {
      this.metrics.inc('notifications_enqueued_total', { type: channel });
    } catch (err) {
      logIgnoredError(
        err,
        'NotificationsService metrics',
        undefined,
        'debug',
      );
    }
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
          return this.prisma.customerStats.count({
            where: { merchantId, customer: { erasedAt: null } },
          });
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
        emailCount = await this.prisma.customerStats.count({
          where: {
            merchantId,
            customer: { email: { not: null }, erasedAt: null },
          },
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
        } catch (err) {
          logIgnoredError(
            err,
            'NotificationsService consent count',
            undefined,
            'debug',
          );
        }
      }
      if (channel === 'PUSH' || channel === 'ALL') {
        // Distinct customers with active devices
        const groups = await this.prisma.pushDevice.groupBy({
          by: ['customerId'],
          where: { merchantId, isActive: true, customer: { erasedAt: null } },
          _count: true,
        });
        pushCount = Array.isArray(groups) ? groups.length : 0;
      }
      if (channel === 'ALL') return Math.max(emailCount, pushCount);
      if (channel === 'EMAIL') return emailCount;
      if (channel === 'PUSH') return pushCount;
      return 0;
    } catch (err) {
      logIgnoredError(
        err,
        'NotificationsService estimate recipients',
        undefined,
        'debug',
      );
      return 0;
    }
  }
}
