import { PromotionRewardType, PromotionStatus } from '@prisma/client';
import { LoyaltyProgramService } from './loyalty-program.service';
import { PromotionRulesService } from './services/promotion-rules.service';
import type { CommunicationsService } from '../communications/communications.service';
import type { MetricsService } from '../../core/metrics/metrics.service';
import type { PrismaService } from '../../core/prisma/prisma.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type MetricsStub = {
  inc: MockFn;
  observe: MockFn;
  setGauge: MockFn;
};
type PromotionRecord = {
  id: string;
  merchantId: string;
  name: string;
  description: string | null;
  segmentId: string | null;
  targetTierId: string | null;
  status: PromotionStatus;
  rewardType: PromotionRewardType;
  rewardValue: number;
  rewardMetadata: Record<string, unknown>;
  pointsExpireInDays: number | null;
  pushTemplateStartId: string | null;
  pushTemplateReminderId: string | null;
  pushOnStart: boolean;
  pushReminderEnabled: boolean;
  reminderOffsetHours: number | null;
  autoLaunch: boolean;
  startAt: Date | null;
  endAt: Date | null;
  metadata: Record<string, unknown> | null;
  updatedById: string | null;
};
type UpdateArgs = {
  data: { segmentId: string | null; endAt: Date | null; startAt: Date | null };
};
type PrismaStub = {
  loyaltyPromotion: {
    findFirst: MockFn<Promise<PromotionRecord | null>, [unknown?]>;
    update: MockFn<
      Promise<{ id: string; status: PromotionStatus }>,
      [UpdateArgs]
    >;
  };
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asCommunicationsService = (stub: CommunicationsService) =>
  stub as unknown as CommunicationsService;
const makePromotionRules = (prisma: PrismaStub) =>
  new PromotionRulesService(asPrismaService(prisma));

describe('LoyaltyProgramService — updatePromotion', () => {
  const metrics: MetricsStub = {
    inc: mockFn(),
    observe: mockFn(),
    setGauge: mockFn(),
  };

  it('очищает аудиторию и дату завершения при передаче null', async () => {
    const updateMock: MockFn<
      Promise<{ id: string; status: PromotionStatus }>,
      [UpdateArgs]
    > = mockFn<
      Promise<{ id: string; status: PromotionStatus }>,
      [UpdateArgs]
    >().mockResolvedValue({
      id: 'promo-1',
      status: PromotionStatus.ACTIVE,
    });
    const prisma: PrismaStub = {
      loyaltyPromotion: {
        findFirst: mockFn<
          Promise<PromotionRecord | null>,
          [unknown?]
        >().mockResolvedValue({
          id: 'promo-1',
          merchantId: 'm-1',
          name: 'Старая акция',
          description: null,
          segmentId: 'seg-1',
          targetTierId: null,
          status: PromotionStatus.ACTIVE,
          rewardType: PromotionRewardType.POINTS,
          rewardValue: 10,
          rewardMetadata: {
            productIds: ['prod-1'],
            pointsRuleType: 'multiplier',
            pointsValue: 2,
          },
          pointsExpireInDays: null,
          pushTemplateStartId: null,
          pushTemplateReminderId: null,
          pushOnStart: false,
          pushReminderEnabled: false,
          reminderOffsetHours: null,
          autoLaunch: false,
          startAt: new Date('2024-01-01T00:00:00.000Z'),
          endAt: new Date('2024-02-01T00:00:00.000Z'),
          metadata: { usageLimit: 'unlimited' },
          updatedById: null,
        }),
        update: updateMock,
      },
    };

    const service = new LoyaltyProgramService(
      asPrismaService(prisma),
      asMetricsService(metrics),
      asCommunicationsService({} as CommunicationsService),
      makePromotionRules(prisma),
    );
    await service.updatePromotion('m-1', 'promo-1', {
      name: 'Обновленная акция',
      segmentId: null,
      rewardType: PromotionRewardType.POINTS,
      rewardValue: 5,
      rewardMetadata: {
        productIds: ['prod-1'],
        pointsRuleType: 'multiplier',
        pointsValue: 2,
      },
      startAt: '2024-01-10T00:00:00.000Z',
      endAt: null,
      metadata: { usageLimit: 'unlimited' },
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const [updateArgs] = updateMock.mock.calls[0];
    const data = updateArgs.data;
    expect(data.segmentId).toBeNull();
    expect(data.endAt).toBeNull();
    expect(data.startAt).toEqual(new Date('2024-01-10T00:00:00.000Z'));
  });
});
