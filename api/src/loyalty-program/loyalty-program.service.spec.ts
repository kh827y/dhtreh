import { PromotionRewardType, PromotionStatus } from '@prisma/client';
import { LoyaltyProgramService } from './loyalty-program.service';

describe('LoyaltyProgramService — updatePromotion', () => {
  const metrics: any = {
    inc: jest.fn(),
    observe: jest.fn(),
    setGauge: jest.fn(),
  };

  it('очищает аудиторию и дату завершения при передаче null', async () => {
    const updateMock = jest.fn().mockResolvedValue({
      id: 'promo-1',
      status: PromotionStatus.ACTIVE,
    });
    const prisma: any = {
      loyaltyPromotion: {
        findFirst: jest.fn().mockResolvedValue({
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

    const service = new LoyaltyProgramService(prisma, metrics, {} as any);
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
    const data = updateMock.mock.calls[0][0].data;
    expect(data.segmentId).toBeNull();
    expect(data.endAt).toBeNull();
    expect(data.startAt).toEqual(new Date('2024-01-10T00:00:00.000Z'));
  });
});
