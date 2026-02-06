import { Test } from '@nestjs/testing';
import { OutboxDispatcherWorker } from '../src/workers/outbox-dispatcher.worker';
import { NotificationDispatcherWorker } from '../src/workers/notification-dispatcher.worker';
import { CommunicationsDispatcherWorker } from '../src/modules/communications/communications-dispatcher.worker';
import { AppConfigService } from '../src/core/config/app-config.service';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { MetricsService } from '../src/core/metrics/metrics.service';
import { TelegramBotService } from '../src/modules/telegram/telegram-bot.service';
import { PushService } from '../src/modules/notifications/push/push.service';
import { EmailService } from '../src/modules/notifications/email/email.service';
import { TelegramStaffNotificationsService } from '../src/modules/telegram/staff-notifications.service';
import { CommunicationChannel } from '@prisma/client';
import type { EventOutbox } from '@prisma/client';
import {
  fetchWithTimeout,
  recordExternalRequest,
  readResponseTextSafe,
} from '../src/shared/http/external-http.util';
import * as lockUtil from '../src/shared/pg-lock.util';

jest.mock('../src/shared/http/external-http.util', () => {
  const actual = jest.requireActual(
    '../src/shared/http/external-http.util',
  ) as typeof import('../src/shared/http/external-http.util');
  return {
    ...actual,
    fetchWithTimeout: jest.fn(),
    recordExternalRequest: jest.fn(),
    readResponseTextSafe: jest.fn(),
  };
});

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const objectContaining = <T extends object>(value: T) =>
  expect.objectContaining(value) as unknown as T;

const makeResponse = (status: number, body = ''): Response => {
  if (typeof Response === 'function') {
    return new Response(body, { status });
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? 'OK' : 'ERROR',
    headers: { get: () => null },
    text: () => Promise.resolve(body),
  } as unknown as Response;
};

describe('Workers e2e (happy-path)', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.WORKERS_ENABLED = '1';
    jest
      .spyOn(lockUtil, 'pgTryAdvisoryLock')
      .mockResolvedValue({ ok: true, key: [1, 2] });
    jest.spyOn(lockUtil, 'pgAdvisoryUnlock').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...origEnv };
  });

  it('outbox worker sends one event', async () => {
    const fetchMock = fetchWithTimeout as jest.MockedFunction<
      typeof fetchWithTimeout
    >;
    const recordMock = recordExternalRequest as jest.MockedFunction<
      typeof recordExternalRequest
    >;
    const readMock = readResponseTextSafe as jest.MockedFunction<
      typeof readResponseTextSafe
    >;
    fetchMock.mockResolvedValue(makeResponse(200, 'ok'));
    recordMock.mockImplementation(() => undefined);
    readMock.mockResolvedValue('');

    const event: EventOutbox = {
      id: 'e2e-outbox-1',
      merchantId: 'm1',
      eventType: 'receipt.created',
      payload: { ok: true },
      status: 'PENDING',
      retries: 0,
      nextRetryAt: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const prisma = {
      merchantSettings: {
        findUnique: mockFn().mockResolvedValue({
          webhookUrl: 'https://example.com/webhook',
          webhookSecret: 'secret',
        }),
        update: mockFn().mockResolvedValue({}),
      },
      eventOutbox: {
        update: mockFn().mockResolvedValue({}),
        updateMany: mockFn().mockResolvedValue({ count: 1 }),
        findMany: mockFn().mockResolvedValue([event]),
        count: mockFn().mockResolvedValue(1),
      },
    } as unknown as PrismaService;

    const metrics = {
      inc: mockFn(),
      setGauge: mockFn(),
    } as unknown as MetricsService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxDispatcherWorker,
        AppConfigService,
        { provide: PrismaService, useValue: prisma },
        { provide: MetricsService, useValue: metrics },
      ],
    }).compile();

    const worker = moduleRef.get(
      OutboxDispatcherWorker,
    ) as unknown as OutboxDispatcherWorker;
    await (worker as unknown as { tick: () => Promise<void> }).tick();

    expect(fetchWithTimeout).toHaveBeenCalled();
    expect(prisma.eventOutbox.update).toHaveBeenCalledWith(
      objectContaining({
        where: { id: event.id },
        data: objectContaining({ status: 'SENT' }),
      }),
    );
  });

  it('notification worker sends broadcast push (email remains unused)', async () => {
    const event: EventOutbox = {
      id: 'e2e-notify-1',
      merchantId: 'm1',
      eventType: 'notify.broadcast',
      payload: {
        channel: 'PUSH',
        merchantId: 'm1',
        template: { subject: 'Hello', text: 'Body' },
        variables: { name: 'World' },
      },
      status: 'PENDING',
      retries: 0,
      nextRetryAt: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const prisma = {
      eventOutbox: {
        update: mockFn().mockResolvedValue({}),
        updateMany: mockFn().mockResolvedValue({ count: 1 }),
        findMany: mockFn().mockResolvedValue([event]),
      },
      adminAudit: {
        create: mockFn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;

    const metrics = {
      inc: mockFn(),
      setGauge: mockFn(),
    } as unknown as MetricsService;

    const push = {
      sendToTopic: mockFn().mockResolvedValue({ success: true }),
    } as unknown as PushService;

    const email = {
      sendEmail: mockFn(),
    } as unknown as EmailService;

    const staffNotify = {
      sendStaffAlert: mockFn(),
    } as unknown as TelegramStaffNotificationsService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationDispatcherWorker,
        AppConfigService,
        { provide: PrismaService, useValue: prisma },
        { provide: MetricsService, useValue: metrics },
        { provide: PushService, useValue: push },
        { provide: EmailService, useValue: email },
        { provide: TelegramStaffNotificationsService, useValue: staffNotify },
      ],
    }).compile();

    const worker = moduleRef.get(
      NotificationDispatcherWorker,
    ) as unknown as NotificationDispatcherWorker;
    await (worker as unknown as { tick: () => Promise<void> }).tick();

    expect(push.sendToTopic).toHaveBeenCalled();
    expect(prisma.eventOutbox.update).toHaveBeenCalledWith(
      objectContaining({
        where: { id: event.id },
        data: objectContaining({ status: 'SENT' }),
      }),
    );
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it('communications worker sends scheduled telegram task', async () => {
    const task = {
      id: 'e2e-comm-1',
      merchantId: 'm1',
      channel: CommunicationChannel.TELEGRAM,
      status: 'SCHEDULED',
      payload: { text: 'Hello {client}' },
      stats: null,
      promotionId: null,
      media: null,
      audienceId: null,
      scheduledAt: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const prisma = {
      $queryRaw: mockFn().mockResolvedValue([{ ok: true }]),
      communicationTask: {
        findMany: mockFn().mockImplementation(
          (args?: { where?: { status?: string } }) => {
            const status = args?.where?.status;
            if (status === 'SCHEDULED') return Promise.resolve([task]);
            return Promise.resolve([]);
          },
        ),
        update: mockFn().mockResolvedValue({}),
        updateMany: mockFn().mockResolvedValue({ count: 1 }),
        findUnique: mockFn().mockResolvedValue(task),
      },
      communicationTaskRecipient: {
        count: mockFn().mockResolvedValue(0),
        createMany: mockFn().mockResolvedValue({}),
        findMany: mockFn().mockResolvedValue([
          {
            id: 'r1',
            customerId: 'c1',
            status: 'PENDING',
            metadata: {},
            createdAt: new Date(),
          },
        ]),
        update: mockFn().mockResolvedValue({}),
        groupBy: mockFn().mockResolvedValue([
          { status: 'SENT', _count: { _all: 1 } },
        ]),
      },
      customer: {
        findMany: mockFn().mockResolvedValue([
          { id: 'c1', tgId: '123', name: 'Ivan' },
        ]),
      },
      customerSegment: {
        findFirst: mockFn().mockResolvedValue(null),
      },
      segmentCustomer: {
        findMany: mockFn().mockResolvedValue([]),
      },
      loyaltyPromotion: {
        findFirst: mockFn().mockResolvedValue(null),
      },
      communicationAsset: {
        findUnique: mockFn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    const metrics = {
      inc: mockFn(),
    } as unknown as MetricsService;

    const telegram = {
      sendCampaignMessage: mockFn().mockResolvedValue(undefined),
      sendPushNotification: mockFn().mockResolvedValue(undefined),
    } as unknown as TelegramBotService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommunicationsDispatcherWorker,
        AppConfigService,
        { provide: PrismaService, useValue: prisma },
        { provide: MetricsService, useValue: metrics },
        { provide: TelegramBotService, useValue: telegram },
      ],
    }).compile();

    const worker = moduleRef.get(
      CommunicationsDispatcherWorker,
    ) as unknown as CommunicationsDispatcherWorker;
    await (worker as unknown as { tick: () => Promise<void> }).tick();

    expect(telegram.sendCampaignMessage).toHaveBeenCalledWith(
      'm1',
      '123',
      objectContaining({ text: 'Hello Ivan' }),
    );
    expect(prisma.communicationTask.update).toHaveBeenCalledWith(
      objectContaining({
        where: { id: task.id },
        data: objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });
});
