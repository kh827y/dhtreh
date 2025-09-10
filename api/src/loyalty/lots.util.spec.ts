import { planConsume, planUnconsume, planRevoke, Lot } from './lots.util';

function lot(id: string, pts: number, consumed: number, at: number): Lot {
  return { id, points: pts, consumedPoints: consumed, earnedAt: new Date(at) } as any;
}

describe('lots.util', () => {
  const baseLots = [
    lot('A', 100, 0, 1),
    lot('B', 50, 10, 2),
    lot('C', 30, 0, 3),
  ];

  it('planConsume FIFO earliest first', () => {
    const up = planConsume(baseLots, 120);
    // Consume 100 from A and 20 from B (remain 40 in B)
    expect(up).toEqual([
      { id: 'A', deltaConsumed: 100 },
      { id: 'B', deltaConsumed: 20 },
    ]);
  });

  it('planUnconsume LIFO reduce from latest', () => {
    const lots = [lot('A', 100, 50, 1), lot('B', 50, 30, 2), lot('C', 30, 10, 3)];
    const up = planUnconsume(lots, 35);
    // Start from C: give back 10, then B: give back 25
    expect(up).toEqual([
      { id: 'C', deltaConsumed: -10 },
      { id: 'B', deltaConsumed: -25 },
    ]);
  });

  it('planRevoke LIFO mark latest as consumed', () => {
    const up = planRevoke(baseLots, 60);
    // Latest is C: take 30, then B: can take 40 but remain on B is 40 (50-10)
    expect(up).toEqual([
      { id: 'C', deltaConsumed: 30 },
      { id: 'B', deltaConsumed: 30 },
    ]);
  });
});

