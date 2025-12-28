import { LoyaltyService } from './loyalty.service';

function makeService(prismaOverrides: Record<string, any> = {}) {
  const metrics = {
    inc: jest.fn(),
    observe: jest.fn(),
    setGauge: jest.fn(),
  } as any;
  const prisma = {
    loyaltyPromotion: {
      findMany: jest.fn(),
    },
    ...prismaOverrides,
  } as any;
  return new LoyaltyService(
    prisma,
    metrics,
    {} as any,
    {} as any,
    {} as any,
  );
}

describe('LoyaltyService.calculateAction', () => {
  it('разбивает позиции по акции NTH_FREE и возвращает base_price только для бесплатных', async () => {
    const svc = makeService();
    const promo = {
      id: '12',
      name: '3 пиццы по цене 2х',
      kind: 'NTH_FREE',
      buyQty: 2,
      freeQty: 1,
      productIds: new Set(['prod-1']),
      categoryIds: new Set<string>(),
    };

    (svc as any).resolvePositions = jest.fn().mockResolvedValue([
      {
        externalId: 'picca-01',
        name: 'Пицца',
        qty: 3,
        price: 500,
        amount: 1500,
        resolvedProductId: 'prod-1',
        resolvedCategoryId: null,
        promotionMultiplier: 1,
        accruePoints: true,
      },
    ]);
    (svc as any).loadActivePromotionRules = jest.fn().mockResolvedValue([promo]);

    const result = await svc.calculateAction({
      merchantId: 'M-1',
      items: [{ id_product: 'picca-01', qty: 3, price: 500 }],
    });

    expect(result.positions).toHaveLength(2);
    expect(result.positions[0]).toEqual(
      expect.objectContaining({
        id_product: 'picca-01',
        qty: 1,
        price: 0,
        base_price: 500,
        actions_id: ['12'],
        actions_names: ['3 пиццы по цене 2х'],
      }),
    );
    expect(result.positions[1]).toEqual(
      expect.objectContaining({
        id_product: 'picca-01',
        qty: 2,
        price: 500,
        base_price: null,
        actions_id: [],
        actions_names: [],
      }),
    );
    expect(result.info).toContain(
      'Применена акция: 3 пиццы по цене 2х — 1 шт. бесплатно для товара "Пицца"',
    );
  });

  it('применяет акционную цену и переносит исходную стоимость в base_price', async () => {
    const svc = makeService();
    const promo = {
      id: 'p-fixed',
      name: 'Спеццена',
      kind: 'FIXED_PRICE',
      fixedPrice: 150,
      productIds: new Set(['prod-2']),
      categoryIds: new Set<string>(),
    };

    (svc as any).resolvePositions = jest.fn().mockResolvedValue([
      {
        externalId: 'latte-01',
        name: 'Латте',
        qty: 1,
        price: 200,
        amount: 200,
        resolvedProductId: 'prod-2',
        resolvedCategoryId: null,
        promotionMultiplier: 1,
        accruePoints: true,
      },
    ]);
    (svc as any).loadActivePromotionRules = jest.fn().mockResolvedValue([promo]);

    const result = await svc.calculateAction({
      merchantId: 'M-1',
      items: [{ id_product: 'latte-01', qty: 1, price: 200 }],
    });

    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toEqual(
      expect.objectContaining({
        id_product: 'latte-01',
        qty: 1,
        price: 150,
        base_price: 200,
        actions_id: ['p-fixed'],
        actions_names: ['Спеццена'],
      }),
    );
    expect(result.info).toContain(
      'Применена акция: Спеццена — цена 150 вместо 200 для товара "Латте"',
    );
  });

  it('для балльных акций не меняет цену и не заполняет base_price', async () => {
    const svc = makeService();
    const promo = {
      id: 'p-mult',
      name: 'Х2 баллы',
      kind: 'POINTS_MULTIPLIER',
      multiplier: 2,
      productIds: new Set(['prod-3']),
      categoryIds: new Set<string>(),
    };

    (svc as any).resolvePositions = jest.fn().mockResolvedValue([
      {
        externalId: 'cake-01',
        name: 'Чизкейк',
        qty: 1,
        price: 300,
        amount: 300,
        resolvedProductId: 'prod-3',
        resolvedCategoryId: null,
        promotionMultiplier: 1,
        accruePoints: true,
      },
    ]);
    (svc as any).loadActivePromotionRules = jest.fn().mockResolvedValue([promo]);

    const result = await svc.calculateAction({
      merchantId: 'M-1',
      items: [{ id_product: 'cake-01', qty: 1, price: 300 }],
    });

    expect(result.positions[0]).toEqual(
      expect.objectContaining({
        id_product: 'cake-01',
        price: 300,
        base_price: null,
        actions_id: ['p-mult'],
        actions_names: ['Х2 баллы'],
      }),
    );
    expect(result.info).toContain(
      'Применена акция: Х2 баллы (x2) для товара "Чизкейк"',
    );
  });
});

describe('LoyaltyService.loadActivePromotionRules', () => {
  it('запрашивает акции с корректным фильтром endAt', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = makeService({ loyaltyPromotion: { findMany } });
    const now = new Date('2025-01-10T12:00:00.000Z');

    await (svc as any).loadActivePromotionRules('m-1', now);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ startAt: null }, { startAt: { lte: now } }],
          AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }],
        }),
      }),
    );
  });

  it('собирает правила по товарам и механикам акций', async () => {
    const now = new Date('2025-01-10T12:00:00.000Z');
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'p-1',
        name: 'x2 баллы',
        rewardType: 'POINTS',
        rewardMetadata: {
          pointsRuleType: 'multiplier',
          multiplier: 2,
          productIds: ['prod-1'],
        },
      },
      {
        id: 'p-2',
        name: '2+1',
        rewardType: 'DISCOUNT',
        rewardMetadata: {
          kind: 'NTH_FREE',
          buyQty: 2,
          freeQty: 1,
          productIds: ['prod-2'],
        },
      },
      {
        id: 'p-3',
        name: 'Цена 99',
        rewardType: 'DISCOUNT',
        rewardMetadata: {
          kind: 'FIXED_PRICE',
          price: 99,
          productIds: ['prod-3'],
        },
      },
    ]);
    const svc = makeService({ loyaltyPromotion: { findMany } });

    const rules = await (svc as any).loadActivePromotionRules('m-1', now);

    const ruleById = (id: string) => rules.find((rule: any) => rule.id === id);
    expect(ruleById('p-1')).toEqual(
      expect.objectContaining({
        kind: 'POINTS_MULTIPLIER',
        multiplier: 2,
      }),
    );
    expect(Array.from(ruleById('p-1').productIds)).toEqual(['prod-1']);

    expect(ruleById('p-2')).toEqual(
      expect.objectContaining({
        kind: 'NTH_FREE',
        buyQty: 2,
        freeQty: 1,
      }),
    );
    expect(Array.from(ruleById('p-2').productIds)).toEqual(['prod-2']);

    expect(ruleById('p-3')).toEqual(
      expect.objectContaining({
        kind: 'FIXED_PRICE',
        fixedPrice: 99,
      }),
    );
    expect(Array.from(ruleById('p-3').productIds)).toEqual(['prod-3']);
  });
});
