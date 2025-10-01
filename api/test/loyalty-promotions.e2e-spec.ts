import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './../src/prisma.service';
import { MetricsService } from './../src/metrics.service';
import { AnalyticsService } from './../src/analytics/analytics.service';
import { PushService } from './../src/notifications/push/push.service';
import { EmailService } from './../src/notifications/email/email.service';
import { getJose } from './../src/loyalty/token.util';
import { LoyaltyProgramModule } from './../src/loyalty-program/loyalty-program.module';
import { NotificationsModule } from './../src/notifications/notifications.module';
jest.mock('@prisma/client', () => {
  const makeEnum = (values: string[]) =>
    values.reduce((acc, key) => {
      acc[key] = key;
      return acc;
    }, {} as Record<string, string>);

  return {
    PrismaClient: class {},
    WalletType: makeEnum(['DEFAULT', 'BONUS']),
    HoldMode: makeEnum(['PENDING', 'DEFERRED', 'LOCKED']),
    HoldStatus: makeEnum(['PENDING', 'CONFIRMED', 'CANCELED', 'EXPIRED']),
    DeviceType: makeEnum(['POS', 'KIOSK', 'CASHBOX']),
    StaffRole: makeEnum(['OWNER', 'MANAGER', 'CASHIER', 'ANALYST']),
    StaffStatus: makeEnum(['ACTIVE', 'PENDING', 'SUSPENDED', 'FIRED', 'ARCHIVED']),
    StaffOutletAccessStatus: makeEnum(['ACTIVE', 'REVOKED', 'EXPIRED']),
    AccessScope: makeEnum(['PORTAL', 'CASHIER', 'API']),
    StaffInvitationStatus: makeEnum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']),
    PromoCodeStatus: makeEnum(['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'ARCHIVED']),
    PromoCodeUsageLimitType: makeEnum(['UNLIMITED', 'ONCE_TOTAL', 'ONCE_PER_CUSTOMER', 'LIMITED_PER_CUSTOMER']),
    PromotionStatus: makeEnum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELED', 'ARCHIVED']),
    PromotionRewardType: makeEnum(['POINTS', 'DISCOUNT', 'CASHBACK', 'LEVEL_UP', 'CUSTOM']),
    LoyaltyMechanicType: makeEnum(['TIERS', 'PURCHASE_LIMITS', 'WINBACK', 'BIRTHDAY', 'REGISTRATION_BONUS', 'EXPIRATION_REMINDER', 'REFERRAL', 'CUSTOM']),
    MechanicStatus: makeEnum(['DISABLED', 'ENABLED', 'DRAFT']),
    DataImportStatus: makeEnum(['UPLOADED', 'VALIDATING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELED']),
    DataImportType: makeEnum(['CUSTOMERS', 'TRANSACTIONS', 'PRODUCTS', 'STAFF', 'PROMO_CODES']),
    CommunicationChannel: makeEnum(['PUSH', 'EMAIL', 'TELEGRAM', 'INAPP']),
    PortalAccessState: makeEnum(['ENABLED', 'DISABLED', 'INVITED', 'LOCKED']),
    TxnType: makeEnum(['EARN', 'REDEEM', 'REFUND', 'ADJUST', 'CAMPAIGN', 'REFERRAL']),
    LedgerAccount: makeEnum(['CUSTOMER_BALANCE', 'MERCHANT_LIABILITY', 'RESERVED']),
  };
});

import { PromotionStatus } from '@prisma/client';

type PromotionRecord = {
  id: string;
  merchantId: string;
  name: string;
  description: string | null;
  status: PromotionStatus;
  segmentId: string | null;
  rewardType: string;
  rewardValue: number | null;
  rewardMetadata: any;
  metadata: any;
  pointsExpireInDays: number | null;
  pushOnStart: boolean;
  pushReminderEnabled: boolean;
  reminderOffsetHours: number | null;
  autoLaunch: boolean;
  startAt: Date | null;
  endAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  launchedAt: Date | null;
};

type ParticipantRecord = {
  id: string;
  promotionId: string;
  merchantId: string;
  customerId: string;
  pointsIssued: number;
  joinedAt: Date;
  createdAt: Date;
};

type CustomerRecord = {
  id: string;
  merchantId: string;
  email: string | null;
  phone: string | null;
  name: string | null;
};

const state = {
  promotions: [] as PromotionRecord[],
  metrics: new Map<string, any>(),
  participants: [] as ParticipantRecord[],
  customers: new Map<string, CustomerRecord>(),
  pushDevices: [] as Array<{ id: string; outletId: string; merchantId: string; customerId: string; token: string; isActive: boolean }>,
  pushNotifications: [] as any[],
  emailNotifications: [] as any[],
};

let promotionSeq = 1;
let participantSeq = 1;
let pushDeviceSeq = 1;

function resetState() {
  state.promotions = [];
  state.metrics = new Map();
  state.participants = [];
  state.customers = new Map();
  state.pushDevices = [];
  state.pushNotifications = [];
  state.emailNotifications = [];
  promotionSeq = 1;
  participantSeq = 1;
  pushDeviceSeq = 1;
}

function materializePromotion(record: PromotionRecord, include?: any) {
  const base: any = { ...record };
  if (include?.metrics) {
    base.metrics = state.metrics.get(record.id) ?? null;
  }
  if (include?.audience) {
    base.audience = record.segmentId
      ? { id: record.segmentId, name: `Аудитория ${record.segmentId}`, _count: { customers: 42 } }
      : null;
  }
  if (include?.participants) {
    const list = state.participants
      .filter((item) => item.promotionId === record.id)
      .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime());
    const take = include.participants.take ?? list.length;
    base.participants = list.slice(0, take).map((item) => ({
      ...item,
      customer: include.participants.include?.customer
        ? state.customers.get(item.customerId)
          ? { ...state.customers.get(item.customerId)! }
          : null
        : undefined,
    }));
  }
  return base;
}

function clone<T>(value: T): T {
  return value === undefined ? (value as T) : JSON.parse(JSON.stringify(value));
}

const prismaMock: any = {
  $connect: jest.fn(async () => {}),
  $disconnect: jest.fn(async () => {}),
  merchant: {
    findUnique: jest.fn(async ({ where }: any) => {
      if (!where?.id) return null;
      return { id: where.id, name: `Merchant ${where.id}` };
    }),
  },
  merchantSettings: {
    findUnique: jest.fn(async () => null),
  },
  loyaltyPromotion: {
    create: jest.fn(async ({ data }: any) => {
      const id = data.id ?? `promo-${promotionSeq++}`;
      const now = new Date();
      const record: PromotionRecord = {
        id,
        merchantId: data.merchantId,
        name: data.name,
        description: data.description ?? null,
        status: data.status ?? PromotionStatus.DRAFT,
        segmentId: data.segmentId ?? null,
        rewardType: data.rewardType,
        rewardValue: data.rewardValue ?? null,
        rewardMetadata: clone(data.rewardMetadata ?? null),
        metadata: clone(data.metadata ?? null),
        pointsExpireInDays: data.pointsExpireInDays ?? null,
        pushOnStart: Boolean(data.pushOnStart),
        pushReminderEnabled: Boolean(data.pushReminderEnabled),
        reminderOffsetHours: data.reminderOffsetHours ?? null,
        autoLaunch: Boolean(data.autoLaunch),
        startAt: data.startAt ? new Date(data.startAt) : null,
        endAt: data.endAt ? new Date(data.endAt) : null,
        archivedAt: data.archivedAt ? new Date(data.archivedAt) : null,
        createdAt: now,
        updatedAt: now,
        launchedAt: data.launchedAt ? new Date(data.launchedAt) : null,
      };
      state.promotions.push(record);
      return { ...record };
    }),
    findMany: jest.fn(async (args: any = {}) => {
      let list = state.promotions.slice();
      if (args.where?.merchantId) {
        list = list.filter((item) => item.merchantId === args.where.merchantId);
      }
      if (args.where?.id?.in) {
        const ids: string[] = Array.isArray(args.where.id.in) ? args.where.id.in : [];
        list = list.filter((item) => ids.includes(item.id));
      }
      if (args.where?.status) {
        list = list.filter((item) => item.status === args.where.status);
      }
      if (args.where?.metadata?.path) {
        const path: string[] = args.where.metadata.path;
        list = list.filter((item) => {
          let current: any = item.metadata;
          for (const key of path) {
            if (!current || typeof current !== 'object') return false;
            current = current[key];
          }
          return current === args.where.metadata.equals;
        });
      }
      if (args.orderBy?.createdAt === 'desc') {
        list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return list.map((item) => materializePromotion(item, args.include));
    }),
    findFirst: jest.fn(async (args: any = {}) => {
      let list = state.promotions.slice();
      if (args.where?.merchantId) {
        list = list.filter((item) => item.merchantId === args.where.merchantId);
      }
      if (args.where?.id) {
        list = list.filter((item) => item.id === args.where.id);
      }
      if (args.where?.status) {
        list = list.filter((item) => item.status === args.where.status);
      }
      const found = list[0];
      if (!found) return null;
      return materializePromotion(found, args.include);
    }),
    findUnique: jest.fn(async ({ where, include }: any) => {
      const found = state.promotions.find((item) => item.id === where.id);
      if (!found) return null;
      return materializePromotion(found, include);
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const record = state.promotions.find((item) => item.id === where.id);
      if (!record) throw new Error('Promotion not found');
      Object.assign(record, {
        ...clone(data),
        status: data.status ?? record.status,
        segmentId: data.segmentId ?? record.segmentId,
        rewardType: data.rewardType ?? record.rewardType,
        rewardValue: data.rewardValue ?? record.rewardValue,
        rewardMetadata: data.rewardMetadata !== undefined ? clone(data.rewardMetadata) : record.rewardMetadata,
        metadata: data.metadata !== undefined ? clone(data.metadata) : record.metadata,
        startAt: data.startAt ? new Date(data.startAt) : record.startAt,
        endAt: data.endAt ? new Date(data.endAt) : record.endAt,
        archivedAt: data.archivedAt ? new Date(data.archivedAt) : (data.archivedAt === null ? null : record.archivedAt),
        launchedAt: data.launchedAt ? new Date(data.launchedAt) : record.launchedAt,
        updatedAt: new Date(),
      });
      return { ...record };
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      let updated = 0;
      state.promotions.forEach((item) => {
        if (where.id === item.id && (!where.merchantId || item.merchantId === where.merchantId)) {
          Object.assign(item, {
            status: data.status ?? item.status,
            archivedAt: data.archivedAt ? new Date(data.archivedAt) : item.archivedAt,
            updatedAt: new Date(),
          });
          updated += 1;
        }
      });
      return { count: updated };
    }),
  },
  promotionParticipant: {
    findMany: jest.fn(async (args: any = {}) => {
      let list = state.participants.slice();
      if (args.where?.merchantId) {
        list = list.filter((item) => item.merchantId === args.where.merchantId);
      }
      if (args.where?.createdAt?.gte) {
        const from = new Date(args.where.createdAt.gte);
        list = list.filter((item) => item.createdAt >= from);
      }
      if (args.where?.createdAt?.lte) {
        const to = new Date(args.where.createdAt.lte);
        list = list.filter((item) => item.createdAt <= to);
      }
      if (args.orderBy?.createdAt === 'desc') {
        list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      if (args.take) {
        list = list.slice(0, args.take);
      }
      return list.map((item) => ({
        ...item,
        customer: args.include?.customer
          ? state.customers.get(item.customerId)
            ? { ...state.customers.get(item.customerId)! }
            : null
          : undefined,
      }));
    }),
    groupBy: jest.fn(async (args: any) => {
      let list = state.participants.slice();
      if (args.where?.merchantId) {
        list = list.filter((item) => item.merchantId === args.where.merchantId);
      }
      if (args.where?.joinedAt?.gte) {
        const from = new Date(args.where.joinedAt.gte);
        list = list.filter((item) => item.joinedAt >= from);
      }
      if (args.where?.joinedAt?.lte) {
        const to = new Date(args.where.joinedAt.lte);
        list = list.filter((item) => item.joinedAt <= to);
      }
      const grouped = new Map<string, ParticipantRecord[]>();
      list.forEach((item) => {
        grouped.set(item.promotionId, [...(grouped.get(item.promotionId) ?? []), item]);
      });
      const rows: any[] = [];
      grouped.forEach((items, promotionId) => {
        const count = items.length;
        const sum = items.reduce((acc, val) => acc + (val.pointsIssued ?? 0), 0);
        rows.push({
          promotionId,
          _count: { _all: count },
          _sum: { pointsIssued: sum },
        });
      });
      return rows;
    }),
    count: jest.fn(async (args: any = {}) => {
      let list = state.participants.slice();
      if (args.where?.merchantId) {
        list = list.filter((item) => item.merchantId === args.where.merchantId);
      }
      if (args.where?.joinedAt?.gte) {
        const from = new Date(args.where.joinedAt.gte);
        list = list.filter((item) => item.joinedAt >= from);
      }
      if (args.where?.joinedAt?.lte) {
        const to = new Date(args.where.joinedAt.lte);
        list = list.filter((item) => item.joinedAt <= to);
      }
      if (Array.isArray(args.distinct) && args.distinct.includes('customerId')) {
        return new Set(list.map((item) => item.customerId)).size;
      }
      return list.length;
    }),
  },
  customer: {
    findMany: jest.fn(async ({ where }: any) => {
      if (!where?.id?.in) return [];
      return where.id.in
        .map((id: string) => state.customers.get(id))
        .filter((item): item is CustomerRecord => !!item && item.email !== null)
        .map((item) => ({ ...item }));
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      if (!where?.id) return null;
      const found = state.customers.get(where.id);
      return found ? { ...found } : null;
    }),
  },
  pushDevice: {
    findMany: jest.fn(async ({ where }: any = {}) => {
      let list = state.pushDevices.slice();
      if (where?.merchantId) {
        list = list.filter((item) => item.merchantId === where.merchantId);
      }
      if (where?.customerId) {
        if (Array.isArray(where.customerId?.in)) {
          list = list.filter((item) => where.customerId.in.includes(item.customerId));
        } else {
          list = list.filter((item) => item.customerId === where.customerId);
        }
      }
      if (where?.isActive !== undefined) {
        list = list.filter((item) => item.isActive === where.isActive);
      }
      return list.map((item) => ({ ...item }));
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const device = state.pushDevices.find((item) => item.id === where.id);
      if (!device) throw new Error('Device not found');
      Object.assign(device, data);
      return { ...device };
    }),
    upsert: jest.fn(async ({ where, create, update }: any) => {
      const existing = state.pushDevices.find((item) => item.customerId === where.customerId_outletId.customerId && item.outletId === where.customerId_outletId.outletId);
      if (existing) {
        Object.assign(existing, update);
        return { ...existing };
      }
      const id = `device-${pushDeviceSeq++}`;
      const record = { id, ...create };
      state.pushDevices.push(record);
      return { ...record };
    }),
  },
  pushNotification: {
    create: jest.fn(async ({ data }: any) => {
      state.pushNotifications.push({ ...data });
      return { ...data, id: `push-${state.pushNotifications.length}` };
    }),
  },
  emailNotification: {
    create: jest.fn(async ({ data }: any) => {
      state.emailNotifications.push({ ...data });
      return { ...data, id: `mail-${state.emailNotifications.length}` };
    }),
  },
  transaction: {
    findMany: jest.fn(async () => []),
    aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })),
  },
  wallet: {
    count: jest.fn(async () => 0),
    aggregate: jest.fn(async () => ({ _avg: { balance: 0 } })),
  },
};

const metricsStub = { inc: jest.fn(), gauge: jest.fn(), observe: jest.fn() };

const analyticsStub: Partial<AnalyticsService> = {
  async getBirthdays() {
    return [];
  },
  async getDashboard() {
    return {
      revenue: { totalRevenue: 0, averageCheck: 0, transactionCount: 0, revenueGrowth: 0, hourlyDistribution: [], dailyRevenue: [] },
      customers: { totalCustomers: 0, newCustomers: 0, activeCustomers: 0, churnRate: 0, retentionRate: 0, customerLifetimeValue: 0, averageVisitsPerCustomer: 0, topCustomers: [] },
      loyalty: { totalPointsIssued: 0, totalPointsRedeemed: 0, pointsRedemptionRate: 0, averageBalance: 0, activeWallets: 0, programROI: 0, conversionRate: 0 },
      campaigns: { activeCampaigns: 0, campaignROI: 0, totalRewardsIssued: 0, campaignConversion: 0, topCampaigns: [] },
      operations: { topOutlets: [], topStaff: [], peakHours: [], outletUsage: [] },
    };
  },
  async getRevenueMetrics() {
    return { dailyRevenue: [] } as any;
  },
};

const pushServiceStub = {
  registerDevice: jest.fn(),
  sendPush: jest.fn(),
  sendToTopic: jest.fn(),
  deactivateDevice: jest.fn(),
  getPushStats: jest.fn(),
  getPushTemplates: jest.fn(),
  sendTestPush: jest.fn(),
  async sendCampaignNotification(campaignId: string, customerIds: string[], title: string, body: string) {
    const promotion = await prismaMock.loyaltyPromotion.findUnique({ where: { id: campaignId } });
    if (!promotion) {
      throw new BadRequestException('Кампания не найдена');
    }
    return {
      merchantId: promotion.merchantId,
      campaignId,
      title,
      body,
      customerIds,
      campaignName: promotion.name,
      campaignKind: ((promotion.metadata as any)?.legacyCampaign?.kind) ?? 'LOYALTY_PROMOTION',
    };
  },
};

const emailServiceStub = {
  async sendCampaignEmail(campaignId: string, customerIds: string[], subject: string, content: string) {
    const promotion = await prismaMock.loyaltyPromotion.findUnique({ where: { id: campaignId }, include: { merchant: true } });
    if (!promotion) {
      return { sent: 0, failed: customerIds.length, total: customerIds.length };
    }
    const recipients = await prismaMock.customer.findMany({ where: { id: { in: customerIds } } });
    recipients.forEach((customer: any) => {
      state.emailNotifications.push({
        merchantId: promotion.merchantId,
        customerId: customer.id,
        campaignId,
        subject,
        content,
      });
    });
    const sent = recipients.length;
    return { sent, failed: customerIds.length - sent, total: customerIds.length };
  },
  sendEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
  sendTransactionEmail: jest.fn(),
  sendPointsReminder: jest.fn(),
  getTemplates: jest.fn(async () => []),
};

describe('LoyaltyPromotion integration (e2e)', () => {
  let app: INestApplication;
  let portalToken: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.WORKERS_ENABLED = '0';
    process.env.PORTAL_JWT_SECRET = 'test-portal-secret';
    process.env.API_KEY = 'test-key';

    resetState();
    state.customers.set('C1', { id: 'C1', merchantId: 'M-1', email: 'user@example.com', phone: '+79990000000', name: 'Demo User' });
    state.customers.set('C2', { id: 'C2', merchantId: 'M-1', email: null, phone: '+79991111111', name: 'Anon' });
    state.pushDevices.push({ id: `device-${pushDeviceSeq}`, outletId: `outlet-${pushDeviceSeq}`, merchantId: 'M-1', customerId: 'C1', token: 'push-token', isActive: true }); pushDeviceSeq++;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        LoyaltyProgramModule,
        NotificationsModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(MetricsService)
      .useValue(metricsStub)
      .overrideProvider(AnalyticsService)
      .useValue(analyticsStub)
      .overrideProvider(PushService)
      .useValue(pushServiceStub)
      .overrideProvider(EmailService)
      .useValue(emailServiceStub)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const { SignJWT } = await getJose();
    const now = Math.floor(Date.now() / 1000);
    portalToken = await new SignJWT({ sub: 'M-1', role: 'MERCHANT' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(new TextEncoder().encode(process.env.PORTAL_JWT_SECRET!));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetState();
    state.customers.set('C1', { id: 'C1', merchantId: 'M-1', email: 'user@example.com', phone: '+79990000000', name: 'Demo User' });
    state.customers.set('C2', { id: 'C2', merchantId: 'M-1', email: null, phone: '+79991111111', name: 'Anon' });
    state.pushDevices.push({ id: `device-${pushDeviceSeq}`, outletId: `outlet-${pushDeviceSeq}`, merchantId: 'M-1', customerId: 'C1', token: 'push-token', isActive: true }); pushDeviceSeq++;
  });

  it('creates, updates and reads promotion usage stats', async () => {
    const createPayload = {
      name: 'Регистрация +50',
      description: 'Дополнительные баллы новым клиентам',
      type: 'BONUS',
      status: 'ACTIVE',
      startDate: new Date().toISOString(),
      endDate: null,
      rules: {},
      reward: { type: 'POINTS', value: 50 },
      metadata: { reminderOffsetHours: 48, pushOnStart: true },
    };

    const created = await request(app.getHttpServer())
      .post('/portal/loyalty/promotions')
      .set('authorization', `Bearer ${portalToken}`)
      .send(createPayload)
      .expect(201);

    expect(created.body).toHaveProperty('id');
    expect(created.body.status).toBe('ACTIVE');

    const promotionId = created.body.id;

    const paused = await request(app.getHttpServer())
      .post(`/portal/loyalty/promotions/${promotionId}/status`)
      .set('authorization', `Bearer ${portalToken}`)
      .send({ status: 'PAUSED' })
      .expect(201);

    expect(paused.body.status).toBe('PAUSED');

    const now = new Date();
    state.participants.push(
      {
        id: `pp-${participantSeq++}`,
        promotionId,
        merchantId: 'M-1',
        customerId: 'C1',
        pointsIssued: 120,
        joinedAt: now,
        createdAt: now,
      },
      {
        id: `pp-${participantSeq++}`,
        promotionId,
        merchantId: 'M-1',
        customerId: 'C2',
        pointsIssued: 60,
        joinedAt: now,
        createdAt: now,
      },
    );

    const details = await request(app.getHttpServer())
      .get(`/portal/loyalty/promotions/${promotionId}`)
      .set('authorization', `Bearer ${portalToken}`)
      .expect(200);

    expect(details.body?.stats?.totalUsage).toBe(2);
    expect(details.body?.stats?.totalReward).toBe(180);
    expect(details.body?.stats?.uniqueCustomers).toBe(2);
    expect(Array.isArray(details.body?.usages)).toBe(true);
    expect(details.body.usages.length).toBe(2);
  });

  it('sends promotion notifications through email and push stubs', async () => {
    const promotion = await prismaMock.loyaltyPromotion.create({
      data: {
        merchantId: 'M-1',
        name: 'Flash Sale',
        status: PromotionStatus.ACTIVE,
        rewardType: 'CUSTOM',
        rewardMetadata: { type: 'POINTS', value: 200 },
        metadata: { legacyCampaign: { kind: 'FLASH', startDate: '2024-01-01', endDate: '2024-01-07' } },
      },
    });

    const emailRes = await request(app.getHttpServer())
      .post('/email/campaign')
      .set('x-api-key', 'test-key')
      .send({ campaignId: promotion.id, customerIds: ['C1', 'C2'], subject: 'Flash', content: '200 баллов' })
      .expect(201);

    expect(emailRes.body).toEqual({ sent: 1, failed: 1, total: 2 });
    expect(state.emailNotifications).toHaveLength(1);
    expect(state.emailNotifications[0]).toMatchObject({ campaignId: promotion.id, merchantId: 'M-1' });

    const pushResult = await pushServiceStub.sendCampaignNotification(promotion.id, ['C1'], 'Включили акцию', 'Баллы ждут');
    expect(pushResult).toMatchObject({ merchantId: 'M-1', campaignId: promotion.id, campaignName: 'Flash Sale' });
    expect(pushResult.campaignKind).toBe('FLASH');
  });
});
