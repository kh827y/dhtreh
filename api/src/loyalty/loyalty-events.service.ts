import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Client as PgClient } from 'pg';
import { PrismaService } from '../prisma.service';

export type LoyaltyRealtimeEvent = {
  id: string;
  merchantId: string;
  customerId: string;
  transactionId?: string | null;
  transactionType?: string | null;
  amount?: number | null;
  eventType: string;
  emittedAt: string;
};

type PendingListener = {
  id: number;
  filter: (event: LoyaltyRealtimeEvent) => boolean;
  resolve: (event: LoyaltyRealtimeEvent | null) => void;
  timer: NodeJS.Timeout;
};

@Injectable()
export class LoyaltyEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoyaltyEventsService.name);
  private readonly listeners = new Set<PendingListener>();
  private readonly customerCache = new Map<string, string>();
  private readonly reverseCustomerCache = new Map<
    string,
    { merchantId: string; customerId: string }
  >();
  private readonly activeCustomerPolls = new Map<string, number>();
  private nextListenerId = 1;
  private pgClient?: PgClient;
  private pgConnecting = false;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensurePgSubscriber();
  }

  async onModuleDestroy() {
    await this.teardownPgSubscriber();
  }

  async waitForEvent(
    filter: (event: LoyaltyRealtimeEvent) => boolean,
    timeoutMs = 25000,
  ): Promise<LoyaltyRealtimeEvent | null> {
    return new Promise((resolve) => {
      const listener: PendingListener = {
        id: this.nextListenerId++,
        filter,
        resolve,
        timer: setTimeout(() => {
          this.listeners.delete(listener);
          resolve(null);
        }, timeoutMs),
      };
      this.listeners.add(listener);
    });
  }

  async waitForCustomerEvent(
    merchantId: string,
    customerId: string,
    timeoutMs = 25000,
  ): Promise<LoyaltyRealtimeEvent | null> {
    const sanitizedMerchantId = (merchantId || '').trim();
    const sanitizedCustomerId = (customerId || '').trim();
    if (!sanitizedMerchantId || !sanitizedCustomerId) {
      return null;
    }

    const immediate = await this.claimPersistedEvent(
      sanitizedMerchantId,
      sanitizedCustomerId,
    );
    if (immediate) return immediate;

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const remaining = Math.max(100, deadline - Date.now());
      const window = Math.min(remaining, 5000);
      const event = await this.waitForEvent(
        (payload) =>
          payload.merchantId === sanitizedMerchantId &&
          payload.customerId === sanitizedCustomerId,
        window,
      );
      if (event) {
        await this.markDelivered(event.id);
        return event;
      }
      const fallback = await this.claimPersistedEvent(
        sanitizedMerchantId,
        sanitizedCustomerId,
      );
      if (fallback) {
        return fallback;
      }
    }
    return null;
  }

  tryAcquireCustomerPoll(
    merchantId: string,
    customerId: string,
    limit = 1,
  ): string | null {
    const key = `${merchantId}:${customerId}`;
    const current = this.activeCustomerPolls.get(key) ?? 0;
    if (current >= limit) return null;
    this.activeCustomerPolls.set(key, current + 1);
    return key;
  }

  releaseCustomerPoll(key: string | null) {
    if (!key) return;
    const current = this.activeCustomerPolls.get(key) ?? 0;
    if (current <= 1) {
      this.activeCustomerPolls.delete(key);
      return;
    }
    this.activeCustomerPolls.set(key, current - 1);
  }

  private async claimPersistedEvent(
    merchantId: string,
    customerId: string,
  ): Promise<LoyaltyRealtimeEvent | null> {
    try {
      const prismaAny = this.prisma as any;
      const where: any = {
        merchantId,
        deliveredAt: null,
        customerId,
      };
      const record = await prismaAny?.loyaltyRealtimeEvent?.findFirst?.({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (!record) return null;
      const claimed = await prismaAny?.loyaltyRealtimeEvent?.updateMany?.({
        where: { id: record.id, deliveredAt: null },
        data: { deliveredAt: new Date() },
      });
      if (!claimed || claimed.count !== 1) {
        return null;
      }
      if (!record.customerId) {
        record.customerId = customerId;
        void this.patchMissingCustomer(record.id, customerId);
      }
      return this.mapRecord(record);
    } catch (error) {
      this.logger.warn(
        `Failed to claim realtime event: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return null;
    }
  }

  private async patchMissingCustomer(eventId: string, customerId: string) {
    try {
      const prismaAny = this.prisma as any;
      await prismaAny?.loyaltyRealtimeEvent?.update?.({
        where: { id: eventId },
        data: { customerId },
      });
    } catch {}
  }

  private async markDelivered(eventId: string) {
    if (!eventId) return;
    try {
      const prismaAny = this.prisma as any;
      await prismaAny?.loyaltyRealtimeEvent?.updateMany?.({
        where: { id: eventId, deliveredAt: null },
        data: { deliveredAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to mark realtime event delivered: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  private mapRecord(record: any): LoyaltyRealtimeEvent {
    const customerId =
      typeof record?.customerId === 'string' ? record.customerId : null;
    if (customerId) {
      this.rememberCustomer(record.merchantId, customerId);
    }
    return {
      id: record.id,
      merchantId: record.merchantId,
      customerId: record.customerId,
      transactionId: record.transactionId ?? null,
      transactionType: record.transactionType ?? null,
      amount:
        typeof record.amount === 'number'
          ? Number(record.amount)
          : record.amount != null
            ? Number(record.amount)
            : null,
      eventType:
        typeof record.eventType === 'string'
          ? record.eventType
          : 'loyalty.transaction',
      emittedAt: this.normalizeDate(record.emittedAt),
    };
  }

  private normalizeDate(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string' && value.trim()) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
    return new Date().toISOString();
  }

  private dispatch(event: LoyaltyRealtimeEvent) {
    const matching = Array.from(this.listeners).filter((listener) =>
      listener.filter(event),
    );
    if (matching.length === 0) return;
    for (const listener of matching) {
      clearTimeout(listener.timer);
      this.listeners.delete(listener);
      try {
        listener.resolve(event);
      } catch (error) {
        this.logger.warn(
          `Listener resolve failed: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }

  // После рефакторинга Customer это per-merchant модель, кеширование упрощено
  private rememberCustomer(merchantId: string, customerId: string) {
    const key = `${merchantId}:${customerId}`;
    this.customerCache.set(key, customerId);
    this.reverseCustomerCache.set(customerId, {
      merchantId,
      customerId,
    });
  }

  private async ensurePgSubscriber() {
    if (this.pgClient || this.pgConnecting) return;
    const connectionString = process.env.DATABASE_URL || '';
    if (!connectionString) {
      this.logger.warn(
        'DATABASE_URL is not set, realtime poll will fall back to periodic DB checks',
      );
      return;
    }
    this.pgConnecting = true;
    try {
      const client = new PgClient({ connectionString });
      client.on('notification', (msg) => {
        void this.handleNotification(msg.payload);
      });
      client.on('error', (error) => {
        this.logger.warn(
          `Realtime listener error: ${
            error instanceof Error ? error.message : error
          }`,
        );
        void this.handlePgFailure();
      });
      client.on('end', () => {
        this.logger.warn('Realtime listener connection closed');
        void this.handlePgFailure();
      });
      await client.connect();
      await client.query('LISTEN loyalty_realtime_events');
      this.pgClient = client;
      this.logger.log('Subscribed to loyalty_realtime_events channel');
    } catch (error) {
      this.logger.warn(
        `Failed to start realtime listener: ${
          error instanceof Error ? error.message : error
        }`,
      );
      this.scheduleReconnect();
    } finally {
      this.pgConnecting = false;
    }
  }

  private async teardownPgSubscriber() {
    if (!this.pgClient) return;
    const client = this.pgClient;
    this.pgClient = undefined;
    try {
      client.removeAllListeners();
    } catch {}
    try {
      await client.end();
    } catch {}
  }

  private async handlePgFailure() {
    await this.teardownPgSubscriber();
    this.scheduleReconnect();
  }

  private scheduleReconnect(delayMs = 5000) {
    if (this.pgClient || this.pgConnecting) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.ensurePgSubscriber();
    }, delayMs);
    try {
      this.reconnectTimer?.unref?.();
    } catch {}
  }

  private async handleNotification(payload?: string | null) {
    if (!payload) return;
    try {
      const data = JSON.parse(payload);
      const id = typeof data?.id === 'string' ? data.id : null;
      const merchantId =
        typeof data?.merchantId === 'string' ? data.merchantId : null;
      const customerId =
        typeof data?.customerId === 'string' ? data.customerId : null;
      if (!id || !merchantId || !customerId) return;
      this.rememberCustomer(merchantId, customerId);
      const event: LoyaltyRealtimeEvent = {
        id,
        merchantId,
        customerId,
        transactionId:
          typeof data?.transactionId === 'string' ? data.transactionId : null,
        transactionType:
          typeof data?.transactionType === 'string'
            ? data.transactionType
            : null,
        amount:
          typeof data?.amount === 'number'
            ? data.amount
            : data?.amount != null
              ? Number(data.amount)
              : null,
        eventType:
          typeof data?.eventType === 'string'
            ? data.eventType
            : 'loyalty.transaction',
        emittedAt: this.normalizeDate(data?.emittedAt),
      };
      this.dispatch(event);
    } catch (error) {
      this.logger.warn(
        `Failed to parse realtime payload: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}
