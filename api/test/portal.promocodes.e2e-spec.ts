import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';
import { PromoCodeStatus } from '@prisma/client';
import { PortalGuard } from './../src/portal-auth/portal.guard';
import { MetricsService } from './../src/metrics.service';

type PromoCodeRow = {
  id: string;
  merchantId: string;
  code: string;
  status: PromoCodeStatus;
  grantPoints: boolean;
  pointsAmount: number | null;
  pointsExpireInDays: number | null;
  assignTierId: string | null;
  usageLimitType: string;
  usageLimitValue: number | null;
  perCustomerLimit: number | null;
  cooldownDays: number | null;
  requireVisit: boolean;
  visitLookbackHours: number | null;
  activeFrom: Date | null;
  activeUntil: Date | null;
  metadata: any;
  description?: string | null;
  name?: string | null;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

describe('Portal promocodes (e2e)', () => {
  let app: INestApplication;

  const state = {
    promoCodes: [] as PromoCodeRow[],
  };

  const metricsMock = {
    inc: jest.fn(),
    observe: jest.fn(),
  } as unknown as MetricsService;

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    promoCode: {
      findFirst: async (args: any) => {
        const where = args?.where || {};
        return (
          state.promoCodes.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.merchantId && c.merchantId !== where.merchantId) return false;
            if (where.code && c.code !== where.code) return false;
            return true;
          }) || null
        );
      },
      findMany: async (args: any) => {
        const where = args?.where || {};
        let arr = state.promoCodes.slice();
        if (where.merchantId) arr = arr.filter((c) => c.merchantId === where.merchantId);
        if (where.status) {
          if (typeof where.status === 'string') {
            arr = arr.filter((c) => c.status === where.status);
          } else if (Array.isArray(where.status?.in)) {
            const allowed = new Set(where.status.in);
            arr = arr.filter((c) => allowed.has(c.status));
          }
        }
        arr = arr.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (typeof args?.take === 'number') arr = arr.slice(0, args.take);
        const includeMetrics = args?.include?.metrics;
        return arr.map((row) =>
          includeMetrics
            ? { ...row, metrics: { totalIssued: 0, totalPointsIssued: 0 } }
            : { ...row },
        );
      },
      create: async (args: any) => {
        const now = new Date();
        const row: PromoCodeRow = {
          id: args.data.id || `pc_${state.promoCodes.length + 1}`,
          merchantId: args.data.merchantId,
          code: args.data.code,
          status: args.data.status || PromoCodeStatus.ACTIVE,
          grantPoints: !!args.data.grantPoints,
          pointsAmount: args.data.pointsAmount ?? null,
          pointsExpireInDays: args.data.pointsExpireInDays ?? null,
          assignTierId: args.data.assignTierId ?? null,
          usageLimitType: args.data.usageLimitType || 'UNLIMITED',
          usageLimitValue: args.data.usageLimitValue ?? null,
          perCustomerLimit: args.data.perCustomerLimit ?? null,
          cooldownDays: args.data.cooldownDays ?? null,
          requireVisit: !!args.data.requireVisit,
          visitLookbackHours: args.data.visitLookbackHours ?? null,
          activeFrom: args.data.activeFrom ?? null,
          activeUntil: args.data.activeUntil ?? null,
          metadata: args.data.metadata ?? null,
          description: args.data.description ?? null,
          name: args.data.name ?? args.data.code ?? null,
          createdAt: now,
          updatedAt: now,
        };
        state.promoCodes.push(row);
        return { ...row };
      },
      update: async (args: any) => {
        const idx = state.promoCodes.findIndex((c) => c.id === args.where.id);
        if (idx < 0) return null;
        const current = state.promoCodes[idx];
        const updated: PromoCodeRow = {
          ...current,
          ...args.data,
          updatedAt: new Date(),
        };
        if ('pointsAmount' in args.data) updated.pointsAmount = args.data.pointsAmount ?? null;
        if ('pointsExpireInDays' in args.data) updated.pointsExpireInDays = args.data.pointsExpireInDays ?? null;
        if ('assignTierId' in args.data) updated.assignTierId = args.data.assignTierId ?? null;
        if ('usageLimitValue' in args.data) updated.usageLimitValue = args.data.usageLimitValue ?? null;
        if ('perCustomerLimit' in args.data) updated.perCustomerLimit = args.data.perCustomerLimit ?? null;
        if ('cooldownDays' in args.data) updated.cooldownDays = args.data.cooldownDays ?? null;
        if ('visitLookbackHours' in args.data) updated.visitLookbackHours = args.data.visitLookbackHours ?? null;
        if ('metadata' in args.data) updated.metadata = args.data.metadata ?? null;
        state.promoCodes[idx] = updated;
        return { ...updated };
      },
    },
  };

  beforeAll(async () => {
    const now = new Date();
    state.promoCodes.push({
      id: 'pc-base-1',
      merchantId: 'M-PORTAL',
      code: 'WELCOME10',
      status: PromoCodeStatus.ACTIVE,
      grantPoints: true,
      pointsAmount: 10,
      pointsExpireInDays: 30,
      assignTierId: null,
      usageLimitType: 'ONCE_PER_CUSTOMER',
      usageLimitValue: null,
      perCustomerLimit: 1,
      cooldownDays: null,
      requireVisit: false,
      visitLookbackHours: null,
      activeFrom: null,
      activeUntil: null,
      metadata: { awardPoints: true },
      description: 'Бонус за регистрацию',
      name: 'WELCOME10',
      createdAt: now,
      updatedAt: now,
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(MetricsService)
      .useValue(metricsMock)
      .overrideGuard(PortalGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    metricsMock.inc.mockClear();
  });

  it('issues new promo code via portal and returns it in list', async () => {
    const res = await request(app.getHttpServer())
      .post('/portal/promocodes/issue')
      .send({
        code: 'HELLO50',
        description: 'Приветственный бонус',
        awardPoints: true,
        points: 50,
        burnEnabled: true,
        burnDays: 21,
        usageLimit: 'once_per_customer',
        usagePeriodEnabled: true,
        usagePeriodDays: 7,
      })
      .expect(201);

    expect(res.body.ok).toBe(true);
    expect(res.body.promoCodeId).toBeTruthy();

    const list = await request(app.getHttpServer())
      .get('/portal/promocodes')
      .query({ status: 'ACTIVE' })
      .expect(200);

    expect(Array.isArray(list.body.items)).toBe(true);
    const created = list.body.items.find((item: any) => item.code === 'HELLO50');
    expect(created).toBeTruthy();
    expect(created.metadata.usageLimit).toBe('once_per_customer');
    expect(created.metadata.usagePeriod.days).toBe(7);

    expect(metricsMock.inc).toHaveBeenCalledWith('portal_promocodes_changed_total', { action: 'create' }, 1);
    expect(metricsMock.inc).toHaveBeenCalledWith('portal_loyalty_promocodes_changed_total', { action: 'create' }, 1);
    expect(metricsMock.inc).toHaveBeenCalledWith('portal_loyalty_promocodes_list_total', undefined, undefined);
  });

  it('deactivates and reactivates promo code, filtering by status', async () => {
    const existing = state.promoCodes.find((c) => c.code === 'WELCOME10');
    expect(existing).toBeTruthy();

    await request(app.getHttpServer())
      .post('/portal/promocodes/deactivate')
      .send({ promoCodeId: existing!.id })
      .expect(201);

    expect(state.promoCodes.find((c) => c.id === existing!.id)?.status).toBe(PromoCodeStatus.ARCHIVED);

    const archived = await request(app.getHttpServer())
      .get('/portal/promocodes')
      .query({ status: 'ARCHIVE' })
      .expect(200);
    expect(archived.body.items.some((item: any) => item.code === 'WELCOME10')).toBe(true);

    await request(app.getHttpServer())
      .post('/portal/promocodes/activate')
      .send({ promoCodeId: existing!.id })
      .expect(201);

    expect(state.promoCodes.find((c) => c.id === existing!.id)?.status).toBe(PromoCodeStatus.ACTIVE);

    expect(metricsMock.inc).toHaveBeenCalledWith('portal_promocodes_changed_total', { action: 'status' }, 1);
    expect(metricsMock.inc).toHaveBeenCalledWith('portal_loyalty_promocodes_changed_total', { action: 'status' }, 1);
    expect(metricsMock.inc).toHaveBeenCalledWith('portal_loyalty_promocodes_list_total', undefined, undefined);
    expect(metricsMock.inc.mock.calls.filter((call) => call[0] === 'portal_promocodes_changed_total' && call[1]?.action === 'status')).toHaveLength(2);
    expect(metricsMock.inc.mock.calls.filter((call) => call[0] === 'portal_loyalty_promocodes_changed_total' && call[1]?.action === 'status')).toHaveLength(2);
  });

  it('updates promo code configuration from portal', async () => {
    const target = state.promoCodes.find((c) => c.code === 'HELLO50');
    expect(target).toBeTruthy();

    await request(app.getHttpServer())
      .put(`/portal/promocodes/${target!.id}`)
      .send({
        code: 'HELLO50',
        awardPoints: true,
        points: 75,
        burnEnabled: true,
        burnDays: 14,
        levelEnabled: true,
        levelId: 'silver',
        usageLimit: 'once_total',
        recentVisitEnabled: true,
        recentVisitHours: 48,
      })
      .expect(200);

    const updated = state.promoCodes.find((c) => c.id === target!.id)!;
    expect(updated.pointsAmount).toBe(75);
    expect(updated.pointsExpireInDays).toBe(14);
    expect(updated.assignTierId).toBe('silver');
    expect(updated.usageLimitType).toBe('ONCE_TOTAL');
    expect(updated.requireVisit).toBe(true);
    expect(updated.visitLookbackHours).toBe(48);

    expect(metricsMock.inc).toHaveBeenCalledWith('portal_promocodes_changed_total', { action: 'update' }, 1);
    expect(metricsMock.inc).toHaveBeenCalledWith('portal_loyalty_promocodes_changed_total', { action: 'update' }, 1);
  });
});
