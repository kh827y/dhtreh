import { PromotionRewardType, PromotionStatus } from '@prisma/client';
import { PromotionsController } from './promotions.controller';
import type {
  LoyaltyProgramService,
  PromotionPayload,
} from '../loyalty-program.service';

type PromotionDetail = Awaited<
  ReturnType<LoyaltyProgramService['getPromotion']>
>;
type PortalPromotionPayload = Omit<PromotionPayload, 'actorId'>;
type PortalRequest = {
  portalMerchantId?: string;
  portalPermissions?: { allowAll?: boolean };
  portalActor?: string;
  portalStaffId?: string;
};

type ServiceMock = {
  listPromotions: jest.MockedFunction<LoyaltyProgramService['listPromotions']>;
  createPromotion: jest.MockedFunction<
    LoyaltyProgramService['createPromotion']
  >;
  getPromotion: jest.MockedFunction<LoyaltyProgramService['getPromotion']>;
  updatePromotion: jest.MockedFunction<
    LoyaltyProgramService['updatePromotion']
  >;
  changePromotionStatus: jest.MockedFunction<
    LoyaltyProgramService['changePromotionStatus']
  >;
  bulkUpdatePromotionStatus: jest.MockedFunction<
    LoyaltyProgramService['bulkUpdatePromotionStatus']
  >;
};

const mockFn = <Fn extends (...args: unknown[]) => unknown>() =>
  jest.fn<ReturnType<Fn>, Parameters<Fn>>();

const baseReq: PortalRequest = {
  portalMerchantId: 'm-1',
  portalPermissions: { allowAll: true },
};

function createServiceMock(): ServiceMock {
  return {
    listPromotions: mockFn<LoyaltyProgramService['listPromotions']>(),
    createPromotion: mockFn<LoyaltyProgramService['createPromotion']>(),
    getPromotion: mockFn<LoyaltyProgramService['getPromotion']>(),
    updatePromotion: mockFn<LoyaltyProgramService['updatePromotion']>(),
    changePromotionStatus:
      mockFn<LoyaltyProgramService['changePromotionStatus']>(),
    bulkUpdatePromotionStatus:
      mockFn<LoyaltyProgramService['bulkUpdatePromotionStatus']>(),
  };
}

function makePromotion(
  overrides: Partial<PromotionDetail> = {},
): PromotionDetail {
  return {
    id: 'promo-1',
    merchantId: 'm-1',
    name: 'Акция',
    description: null,
    status: PromotionStatus.ACTIVE,
    rewardType: PromotionRewardType.POINTS,
    rewardValue: 0,
    rewardMetadata: {
      productIds: ['p1'],
      pointsRuleType: 'multiplier',
      pointsValue: 2,
    },
    pointsExpireInDays: null,
    startAt: new Date('2024-02-01T00:00:00.000Z'),
    endAt: new Date('2024-02-10T00:00:00.000Z'),
    segmentId: 'seg-1',
    metadata: { usageLimit: 'once_per_day' },
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    archivedAt: null,
    metrics: null,
    audience: null,
    participants: [],
    ...overrides,
  } as PromotionDetail;
}

describe('PromotionsController — portal payload mapping', () => {
  it('передает аудиторию, даты и ограничения в сервис', async () => {
    const service = createServiceMock();
    service.createPromotion.mockResolvedValue(makePromotion({ id: 'promo-1' }));
    service.getPromotion.mockResolvedValue(makePromotion());
    const controller = new PromotionsController(
      service as unknown as LoyaltyProgramService,
    );

    const body: PortalPromotionPayload = {
      name: 'Баллы на кофе',
      description: '',
      status: 'ACTIVE',
      rewardType: 'POINTS',
      startAt: '2024-02-01T00:00:00.000Z',
      endAt: '2024-02-10T00:00:00.000Z',
      segmentId: 'seg-1',
      metadata: { usageLimit: 'once_per_day' },
      rewardValue: 0,
      rewardMetadata: {
        productIds: ['p1'],
        pointsRuleType: 'multiplier',
        pointsValue: 2,
      },
    };

    await controller.create(
      baseReq as Parameters<PromotionsController['create']>[0],
      body,
    );

    expect(service.createPromotion).toHaveBeenCalledTimes(1);
    const payload = service.createPromotion.mock.calls[0][1];
    expect(payload.segmentId).toBe('seg-1');
    expect(payload.startAt).toBe(body.startAt);
    expect(payload.endAt).toBe(body.endAt);
    const metadata = payload.metadata as { usageLimit?: string } | undefined;
    expect(metadata?.usageLimit).toBe('once_per_day');
  });

  it('возвращает метрики и аудиторию для карточек', async () => {
    const service = createServiceMock();
    const createdAt = new Date('2024-01-01T00:00:00.000Z');
    service.listPromotions.mockResolvedValue([
      makePromotion({
        metrics: {
          id: 'metric-1',
          merchantId: 'm-1',
          promotionId: 'promo-1',
          createdAt,
          updatedAt: createdAt,
          pointsIssued: 0,
          pointsRedeemed: 0,
          revenueGenerated: 12000,
          revenueRedeemed: 3000,
          participantsCount: 7,
          charts: {},
        },
        audience: {
          id: 'seg-1',
          merchantId: 'm-1',
          name: 'VIP',
          description: null,
          type: 'DYNAMIC',
          rules: {},
          filters: null,
          metricsSnapshot: null,
          customerCount: 0,
          isActive: true,
          tags: [],
          color: null,
          definitionVersion: 1,
          source: 'builder',
          createdAt,
          updatedAt: createdAt,
          createdById: null,
          updatedById: null,
          archivedAt: null,
          lastEvaluatedAt: null,
          systemKey: null,
          isSystem: false,
          _count: { customers: 5 },
        },
      }),
    ]);
    const controller = new PromotionsController(
      service as unknown as LoyaltyProgramService,
    );

    const response = await controller.list(
      baseReq as Parameters<PromotionsController['list']>[0],
      'ALL',
    );

    expect(response).toHaveLength(1);
    const item = response[0];
    expect(item.metrics).not.toBeNull();
    expect(item.audience).not.toBeNull();
    const metrics = item.metrics!;
    const audience = item.audience!;
    expect(metrics.revenueGenerated).toBe(12000);
    expect(metrics.revenueRedeemed).toBe(3000);
    expect(metrics.participantsCount).toBe(7);
    expect(audience.id).toBe('seg-1');
    expect(audience.name).toBe('VIP');
  });
});
