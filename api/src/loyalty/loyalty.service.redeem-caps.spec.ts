import { LoyaltyService } from './loyalty.service';

describe('LoyaltyService redeem caps', () => {
  const metrics = {
    inc: jest.fn(),
    observe: jest.fn(),
    setGauge: jest.fn(),
  } as any;

  const makeService = () =>
    new LoyaltyService({} as any, metrics, undefined as any, undefined as any, {} as any);

  it('limits redeem by product percent caps', async () => {
    const service = makeService();
    jest.spyOn(service as any, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 100,
        amount: 100,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 25,
      } as any,
      {
        qty: 1,
        price: 100,
        amount: 100,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 100,
      } as any,
    ]);
    jest.spyOn(service, 'balance').mockResolvedValue({
      merchantId: 'm-1',
      customerId: 'c-1',
      balance: 1000,
    });
    jest.spyOn(service, 'getBaseRatesForCustomer').mockResolvedValue({
      earnBps: 0,
      redeemLimitBps: 10000,
    });

    const result = await service.calculateBonusPreview({
      merchantId: 'm-1',
      customerId: 'c-1',
      items: [
        { qty: 1, price: 100 },
        { qty: 1, price: 100 },
      ],
    });

    expect(result.max_pay_bonus).toBe(125);
    expect(result.products?.map((p) => p.max_pay_bonus)).toEqual([25, 100]);
  });

  it('ignores items with disallowed point payment', async () => {
    const service = makeService();
    jest.spyOn(service as any, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 200,
        amount: 200,
        accruePoints: true,
        allowEarnAndPay: false,
        promotionMultiplier: 1,
        redeemPercent: 100,
      } as any,
      {
        qty: 1,
        price: 200,
        amount: 200,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 50,
      } as any,
    ]);
    jest.spyOn(service, 'balance').mockResolvedValue({
      merchantId: 'm-2',
      customerId: 'c-2',
      balance: 1000,
    });
    jest.spyOn(service, 'getBaseRatesForCustomer').mockResolvedValue({
      earnBps: 0,
      redeemLimitBps: 10000,
    });

    const result = await service.calculateBonusPreview({
      merchantId: 'm-2',
      customerId: 'c-2',
      items: [
        { qty: 1, price: 200 },
        { qty: 1, price: 200 },
      ],
    });

    expect(result.max_pay_bonus).toBe(100);
    expect(result.products?.map((p) => p.max_pay_bonus)).toEqual([0, 100]);
  });

  it('keeps per-item caps when overall limit is lower', async () => {
    const service = makeService();
    jest.spyOn(service as any, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 500,
        amount: 500,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 25,
      } as any,
      {
        qty: 1,
        price: 500,
        amount: 500,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 50,
      } as any,
    ]);
    jest.spyOn(service, 'balance').mockResolvedValue({
      merchantId: 'm-3',
      customerId: 'c-3',
      balance: 1000,
    });
    jest.spyOn(service, 'getBaseRatesForCustomer').mockResolvedValue({
      earnBps: 0,
      redeemLimitBps: 2500,
    });

    const result = await service.calculateBonusPreview({
      merchantId: 'm-3',
      customerId: 'c-3',
      items: [
        { qty: 1, price: 500 },
        { qty: 1, price: 500 },
      ],
    });

    expect(result.max_pay_bonus).toBe(250);
    expect(result.products?.map((p) => p.max_pay_bonus)).toEqual([125, 250]);
  });

  it('does not shrink redeem limit when item has accruePoints=false', async () => {
    const service = makeService();
    jest.spyOn(service as any, 'resolvePositions').mockResolvedValue([
      {
        qty: 1,
        price: 500,
        amount: 500,
        accruePoints: false,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 25,
      } as any,
      {
        qty: 1,
        price: 500,
        amount: 500,
        accruePoints: true,
        allowEarnAndPay: true,
        promotionMultiplier: 1,
        redeemPercent: 50,
      } as any,
    ]);
    jest.spyOn(service, 'balance').mockResolvedValue({
      merchantId: 'm-4',
      customerId: 'c-4',
      balance: 1000,
    });
    jest.spyOn(service, 'getBaseRatesForCustomer').mockResolvedValue({
      earnBps: 0,
      redeemLimitBps: 5000,
    });

    const result = await service.calculateBonusPreview({
      merchantId: 'm-4',
      customerId: 'c-4',
      items: [
        { qty: 1, price: 500 },
        { qty: 1, price: 500 },
      ],
    });

    expect(result.max_pay_bonus).toBe(375);
    expect(result.products?.map((p) => p.max_pay_bonus)).toEqual([125, 250]);
  });
});
