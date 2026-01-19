import {
  computePromotionRedeemRevenueFromData,
  type PromotionRedeemParticipant,
  type PromotionRedeemReceipt,
} from './promotion-redeem-revenue';

describe('computePromotionRedeemRevenueFromData', () => {
  it('распределяет выручку и списания по одной акции', () => {
    const participants: PromotionRedeemParticipant[] = [
      {
        promotionId: 'p1',
        customerId: 'c1',
        joinedAt: new Date('2024-01-01T00:00:00Z'),
        pointsIssued: 100,
      },
    ];

    const receipts: PromotionRedeemReceipt[] = [
      {
        customerId: 'c1',
        createdAt: new Date('2024-01-02T10:00:00Z'),
        redeemApplied: 50,
        total: 1000,
      },
    ];

    const result = computePromotionRedeemRevenueFromData(
      participants,
      receipts,
    );
    expect(result.get('p1')).toEqual({
      dates: ['2024-01-02'],
      series: [950],
      netTotal: 950,
      redeemedTotal: 50,
      grossTotal: 1000,
    });
  });

  it('распределяет списания FIFO между несколькими акциями одного клиента', () => {
    const participants: PromotionRedeemParticipant[] = [
      {
        promotionId: 'p1',
        customerId: 'c1',
        joinedAt: new Date('2024-01-01T00:00:00Z'),
        pointsIssued: 100,
      },
      {
        promotionId: 'p2',
        customerId: 'c1',
        joinedAt: new Date('2024-01-05T00:00:00Z'),
        pointsIssued: 100,
      },
    ];

    const receipts: PromotionRedeemReceipt[] = [
      {
        customerId: 'c1',
        createdAt: new Date('2024-01-02T10:00:00Z'),
        redeemApplied: 50,
        total: 1000,
      },
      {
        customerId: 'c1',
        createdAt: new Date('2024-01-06T12:00:00Z'),
        redeemApplied: 150,
        total: 500,
      },
    ];

    const result = computePromotionRedeemRevenueFromData(
      participants,
      receipts,
    );

    expect(result.get('p1')).toEqual({
      dates: ['2024-01-02', '2024-01-06'],
      series: [950, 117],
      netTotal: 1067,
      redeemedTotal: 100,
      grossTotal: 1167,
    });

    expect(result.get('p2')).toEqual({
      dates: ['2024-01-06'],
      series: [233],
      netTotal: 233,
      redeemedTotal: 100,
      grossTotal: 333,
    });
  });

  it('не списывает больше остатка по акциям и игнорирует чеки до вступления', () => {
    const participants: PromotionRedeemParticipant[] = [
      {
        promotionId: 'p1',
        customerId: 'c1',
        joinedAt: new Date('2024-01-10T00:00:00Z'),
        pointsIssued: 10,
      },
    ];

    const receipts: PromotionRedeemReceipt[] = [
      {
        customerId: 'c1',
        createdAt: new Date('2024-01-09T10:00:00Z'),
        redeemApplied: 5,
        total: 100,
      },
      {
        customerId: 'c1',
        createdAt: new Date('2024-01-10T10:00:00Z'),
        redeemApplied: 50,
        total: 200,
      },
      {
        customerId: 'c1',
        createdAt: new Date('2024-01-11T10:00:00Z'),
        redeemApplied: 50,
        total: 200,
      },
    ];

    const result = computePromotionRedeemRevenueFromData(
      participants,
      receipts,
    );
    expect(result.get('p1')).toEqual({
      dates: ['2024-01-10'],
      series: [150],
      netTotal: 150,
      redeemedTotal: 10,
      grossTotal: 160,
    });
  });

  it('работает для нескольких клиентов и нескольких акций', () => {
    const participants: PromotionRedeemParticipant[] = [
      {
        promotionId: 'p1',
        customerId: 'c1',
        joinedAt: new Date('2024-01-01T00:00:00Z'),
        pointsIssued: 100,
      },
      {
        promotionId: 'p2',
        customerId: 'c1',
        joinedAt: new Date('2024-01-02T00:00:00Z'),
        pointsIssued: 100,
      },
      {
        promotionId: 'p3',
        customerId: 'c1',
        joinedAt: new Date('2024-01-03T00:00:00Z'),
        pointsIssued: 100,
      },
      {
        promotionId: 'p3',
        customerId: 'c2',
        joinedAt: new Date('2024-01-01T00:00:00Z'),
        pointsIssued: 60,
      },
    ];

    const receipts: PromotionRedeemReceipt[] = [
      {
        customerId: 'c1',
        createdAt: new Date('2024-01-04T10:00:00Z'),
        redeemApplied: 300,
        total: 1300,
      },
      {
        customerId: 'c2',
        createdAt: new Date('2024-01-02T10:00:00Z'),
        redeemApplied: 60,
        total: 260,
      },
    ];

    const result = computePromotionRedeemRevenueFromData(
      participants,
      receipts,
    );

    expect(result.get('p1')).toEqual({
      dates: ['2024-01-04'],
      series: [333],
      netTotal: 333,
      redeemedTotal: 100,
      grossTotal: 433,
    });

    expect(result.get('p2')).toEqual({
      dates: ['2024-01-04'],
      series: [333],
      netTotal: 333,
      redeemedTotal: 100,
      grossTotal: 433,
    });

    expect(result.get('p3')).toEqual({
      dates: ['2024-01-02', '2024-01-04'],
      series: [200, 333],
      netTotal: 533,
      redeemedTotal: 160,
      grossTotal: 693,
    });
  });
});
