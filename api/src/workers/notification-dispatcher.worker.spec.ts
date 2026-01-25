import { NotificationDispatcherWorker } from './notification-dispatcher.worker';
import type { PrismaService } from '../core/prisma/prisma.service';
import type { MetricsService } from '../core/metrics/metrics.service';
import type { PushService } from '../modules/notifications/push/push.service';
import type { EmailService } from '../modules/notifications/email/email.service';
import type { TelegramStaffNotificationsService } from '../modules/telegram/staff-notifications.service';
import { AppConfigService } from '../core/config/app-config.service';
import type { EventOutbox } from '@prisma/client';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;

type PrismaStub = {
  eventOutbox: {
    update: MockFn<Promise<unknown>, [unknown?]>;
  };
  adminAudit: {
    create: MockFn<Promise<unknown>, [unknown?]>;
  };
};

type MetricsStub = { inc: MockFn; setGauge: MockFn };
type PushStub = {
  sendToTopic: MockFn<Promise<{ success: boolean }>, [string, string, string, Record<string, string>?]>;
};
type EmailStub = { sendEmail: MockFn };
type StaffNotifyStub = { sendStaffAlert: MockFn };

type WorkerPrivate = {
  handle: (row: EventOutbox) => Promise<void>;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();

const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asPushService = (stub: PushStub) => stub as unknown as PushService;
const asEmailService = (stub: EmailStub) => stub as unknown as EmailService;
const asStaffNotifyService = (stub: StaffNotifyStub) =>
  stub as unknown as TelegramStaffNotificationsService;
const asPrivateWorker = (worker: NotificationDispatcherWorker) =>
  worker as unknown as WorkerPrivate;

describe('NotificationDispatcherWorker', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.WORKERS_ENABLED = '1';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...origEnv };
  });

  it('sends broadcast push to topic and marks outbox as sent', async () => {
    const prisma: PrismaStub = {
      eventOutbox: {
        update: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
      adminAudit: {
        create: mockFn<Promise<unknown>, [unknown?]>().mockResolvedValue({}),
      },
    };
    const metrics: MetricsStub = { inc: mockFn(), setGauge: mockFn() };
    const push: PushStub = {
      sendToTopic: mockFn<
        Promise<{ success: boolean }>,
        [string, string, string, Record<string, string>?]
      >().mockResolvedValue({ success: true }),
    };
    const email: EmailStub = { sendEmail: mockFn() };
    const staffNotify: StaffNotifyStub = { sendStaffAlert: mockFn() };

    const worker = new NotificationDispatcherWorker(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asPushService(push),
      asEmailService(email),
      asStaffNotifyService(staffNotify),
      new AppConfigService(),
    );

    const row = {
      id: 'n1',
      merchantId: 'm1',
      eventType: 'notify.broadcast',
      payload: {
        channel: 'PUSH',
        merchantId: 'm1',
        template: { subject: 'Hello', text: 'Body' },
        variables: { foo: 'bar' },
      },
      retries: 0,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as EventOutbox;

    await asPrivateWorker(worker).handle(row);

    expect(push.sendToTopic).toHaveBeenCalledWith(
      'm1',
      'Hello',
      'Body',
      expect.any(Object),
    );
    expect(prisma.eventOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'n1' },
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
    expect(prisma.adminAudit.create).toHaveBeenCalled();
  });
});
