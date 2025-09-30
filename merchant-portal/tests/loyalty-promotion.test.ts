import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapLoyaltyPromotion, mapLoyaltyPromotions, type LoyaltyPromotionApi } from '../lib/loyalty-promotion';

const now = new Date('2024-02-01T00:00:00.000Z');

test('mapLoyaltyPromotion maps status, period and reward', () => {
  const api: LoyaltyPromotionApi = {
    id: 'promo-1',
    name: 'Двойные баллы',
    status: 'SCHEDULED',
    startDate: '2024-02-10T00:00:00.000Z',
    endDate: null,
    reward: { type: 'POINTS', value: 200 },
    metadata: { legacyCampaign: { kind: 'PRODUCT_BONUS', pushOnStart: true } },
    stats: { totalUsage: 5, totalReward: 800, uniqueCustomers: 4 },
    pushReminderEnabled: false,
  };

  const mapped = mapLoyaltyPromotion(api, now);
  assert.equal(mapped.id, 'promo-1');
  assert.equal(mapped.tab, 'UPCOMING');
  assert.equal(mapped.period.label, 'с 10.02.2024');
  assert.equal(mapped.rewardLabel, '200 баллов');
  assert.deepEqual(mapped.badges.sort(), ['PRODUCT_BONUS', 'Бессрочная', 'Скоро старт'].sort());
  assert.deepEqual(mapped.usage, { total: 5, reward: 800, unique: 4 });
  assert.equal(mapped.push.onStart, true);
  assert.equal(mapped.push.reminder, false);
});

test('mapLoyaltyPromotions handles past promotions and legacy reward', () => {
  const list: LoyaltyPromotionApi[] = [
    {
      id: 'promo-2',
      name: 'Флеш-распродажа',
      status: 'ARCHIVED',
      startDate: '2023-12-01T00:00:00.000Z',
      endDate: '2023-12-10T23:59:59.000Z',
      metadata: { legacyCampaign: { kind: 'FLASH', reward: { points: 150 }, pushReminder: true } },
    },
  ];

  const [mapped] = mapLoyaltyPromotions(list, now);
  assert.equal(mapped.tab, 'PAST');
  assert.equal(mapped.period.label, '01.12.2023 — 10.12.2023');
  assert.equal(mapped.rewardLabel, '150 баллов');
  assert.equal(mapped.push.reminder, true);
});
