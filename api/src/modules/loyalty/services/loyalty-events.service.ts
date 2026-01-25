import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Client as PgClientCtor } from 'pg';
import type { LoyaltyRealtimeEvent as PrismaLoyaltyRealtimeEvent } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';

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

type PgNotification = { payload?: string | null };

type PgClient = {
  on(event: 'notification', listener: (msg: PgNotification) => void): PgClient;
  on(event: 'error', listener: (error: Error) => void): PgClient;
  on(event: 'end', listener: () => void): PgClient;
  connect(): Promise<void>;
  query(queryText: string): Promise<unknown>;
  removeAllListeners(): void;
  end(): Promise<void>;
};

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (record: JsonRecord, key: string): string | null => {
  const value = record[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const readNumber = (record: JsonRecord, key: string): number | null => {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
};

@Injectable()
export class LoyaltyEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoyaltyEventsService.name);
  private readonly listeners = new Set<PendingListener>();
  private readonly activeCustomerPolls = new Map<string, number>();
  private nextListenerId = 1;
  private pgClient?: PgClient;
  private pgConnecting = false;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit() {
    await this.ensurePgSubscriber();
  }

  async onModuleDestroy() {
    await this.teardownPgSubscriber();
  }

  async waitForEvent(
    filter: (event: LoyaltyRealtimeEvent) => boolean,
    timeoutMs = 25000,
    signal?: AbortSignal,
  ): Promise<LoyaltyRealtimeEvent | null> {
    if (signal?.aborted) return null;
    return new Promise((resolve) => {
      let finished = false;
      const finish = (event: LoyaltyRealtimeEvent | null) => {
        if (finished) return;
        finished = true;
        if (listener?.timer) clearTimeout(listener.timer);
        if (listener) this.listeners.delete(listener);
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(event);
      };
      const onAbort = () => finish(null);
      const listener: PendingListener = {
        id: this.nextListenerId++,
        filter,
        resolve: (event) => finish(event),
        timer: setTimeout(() => finish(null), timeoutMs),
      };
      this.listeners.add(listener);
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  async waitForCustomerEvent(
    merchantId: string,
    customerId: string,
    timeoutMs = 25000,
    signal?: AbortSignal,
  ): Promise<LoyaltyRealtimeEvent | null> {
    const sanitizedMerchantId = (merchantId || '').trim();
    const sanitizedCustomerId = (customerId || '').trim();
    if (!sanitizedMerchantId || !sanitizedCustomerId) {
      return null;
    }
    if (signal?.aborted) return null;

    const immediate = await this.claimPersistedEvent(
      sanitizedMerchantId,
      sanitizedCustomerId,
    );
    if (immediate) return immediate;

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (signal?.aborted) return null;
      const remaining = Math.max(100, deadline - Date.now());
      const window = Math.min(remaining, 5000);
      const event = await this.waitForEvent(
        (payload) =>
          payload.merchantId === sanitizedMerchantId &&
          payload.customerId === sanitizedCustomerId,
        window,
        signal,
      );
      if (signal?.aborted) return null;
      if (event) {
        await this.markDelivered(event.id);
        return event;
      }
      if (signal?.aborted) return null;
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
      const where = {
        merchantId,
        deliveredAt: null,
        customerId,
      } as const;
      const record = await this.prisma.loyaltyRealtimeEvent.findFirst({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (!record) return null;
      const claimed = await this.prisma.loyaltyRealtimeEvent.updateMany({
        where: { id: record.id, deliveredAt: null },
        data: { deliveredAt: new Date() },
      });
      if (claimed.count !== 1) {
        return null;
      }
      const resolvedCustomerId = record.customerId ?? customerId;
      if (!record.customerId) {
        void this.patchMissingCustomer(record.id, customerId);
      }
      return this.mapRecord({ ...record, customerId: resolvedCustomerId });
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
      await this.prisma.loyaltyRealtimeEvent.update({
        where: { id: eventId },
        data: { customerId },
      });
    } catch (err) {
      logIgnoredError(
        err,
        'LoyaltyEventsService patch customer',
        this.logger,
        'debug',
      );
    }
  }

  private async markDelivered(eventId: string) {
    if (!eventId) return;
    try {
      await this.prisma.loyaltyRealtimeEvent.updateMany({
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

  private mapRecord(record: PrismaLoyaltyRealtimeEvent): LoyaltyRealtimeEvent {
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

  private async ensurePgSubscriber() {
    if (this.pgClient || this.pgConnecting) return;
    const connectionString = this.config.getString('DATABASE_URL') || '';
    if (!connectionString) {
      this.logger.warn(
        'DATABASE_URL is not set, realtime poll will fall back to periodic DB checks',
      );
      return;
    }
    this.pgConnecting = true;
    try {
      const PgClientFactory = PgClientCtor as unknown as {
        new (options: { connectionString: string }): PgClient;
      };
      const client = new PgClientFactory({ connectionString });
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
    } catch (err) {
      logIgnoredError(
        err,
        'LoyaltyEventsService pg remove listeners',
        this.logger,
        'debug',
      );
    }
    try {
      await client.end();
    } catch (err) {
      logIgnoredError(err, 'LoyaltyEventsService pg end', this.logger, 'debug');
    }
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
    } catch (err) {
      logIgnoredError(
        err,
        'LoyaltyEventsService reconnect timer',
        this.logger,
        'debug',
      );
    }
  }

  private handleNotification(payload?: string | null) {
    if (!payload) return;
    try {
      const parsed = JSON.parse(payload) as unknown;
      if (!isRecord(parsed)) return;
      const id = readString(parsed, 'id');
      const merchantId = readString(parsed, 'merchantId');
      const customerId = readString(parsed, 'customerId');
      if (!id || !merchantId || !customerId) return;
      const amount = readNumber(parsed, 'amount');
      const event: LoyaltyRealtimeEvent = {
        id,
        merchantId,
        customerId,
        transactionId: readString(parsed, 'transactionId'),
        transactionType: readString(parsed, 'transactionType'),
        amount,
        eventType: readString(parsed, 'eventType') ?? 'loyalty.transaction',
        emittedAt: this.normalizeDate(parsed.emittedAt),
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
