import { PromotionRewardType, PromotionStatus } from '@prisma/client';
import { PromotionsController } from './promotions.controller';

type ServiceMock = {
  listPromotions: jest.Mock;
  createPromotion: jest.Mock;
  getPromotion: jest.Mock;
  updatePromotion: jest.Mock;
  changePromotionStatus: jest.Mock;
  bulkUpdatePromotionStatus: jest.Mock;
};

const baseReq = {
  portalMerchantId: 'm-1',
} as any;

function createServiceMock(): ServiceMock {
  return {
    listPromotions: jest.fn(),
    createPromotion: jest.fn(),
    getPromotion: jest.fn(),
    updatePromotion: jest.fn(),
    changePromotionStatus: jest.fn(),
    bulkUpdatePromotionStatus: jest.fn(),
  };
}

function makePromotion(overrides: Record<string, any> = {}) {
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
  };
}

describe('PromotionsController — portal payload mapping', () => {
  it('передает аудиторию, даты и ограничения в сервис', async () => {
    const service = createServiceMock();
    service.createPromotion.mockResolvedValue({ id: 'promo-1' });
    service.getPromotion.mockResolvedValue(makePromotion());
    const controller = new PromotionsController(service as any);

    const body: any = {
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

    await controller.create(baseReq, body);

    expect(service.createPromotion).toHaveBeenCalledTimes(1);
    const payload = service.createPromotion.mock.calls[0][1];
    expect(payload.segmentId).toBe('seg-1');
    expect(payload.startAt).toBe(body.startAt);
    expect(payload.endAt).toBe(body.endAt);
    expect(payload.metadata.usageLimit).toBe('once_per_day');
  });

  it('возвращает метрики и аудиторию для карточек', async () => {
    const service = createServiceMock();
    service.listPromotions.mockResolvedValue([
      makePromotion({
        metrics: {
          revenueGenerated: 12000,
          discountTotal: 3000,
          participantsCount: 7,
        },
        audience: {
          id: 'seg-1',
          name: 'VIP',
          _count: { customers: 5 },
        },
      }),
    ]);
    const controller = new PromotionsController(service as any);

    const response = await controller.list(baseReq, 'ALL');

    expect(response).toHaveLength(1);
    expect(response[0].metrics.revenueGenerated).toBe(12000);
    expect(response[0].metrics.discountTotal).toBe(3000);
    expect(response[0].metrics.participantsCount).toBe(7);
    expect(response[0].audience.id).toBe('seg-1');
    expect(response[0].audience.name).toBe('VIP');
  });
});
