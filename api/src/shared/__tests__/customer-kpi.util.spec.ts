import {
  buildCustomerKpiSnapshot,
  computeDaysSinceLastVisit,
  computeVisitFrequencyDays,
} from '../common/customer-kpi.util';

describe('customer-kpi.util', () => {
  it('computes days since last visit with floor precision', () => {
    const now = new Date('2026-02-08T12:00:00.000Z');
    const lastVisit = new Date('2026-02-05T20:30:00.000Z');

    expect(computeDaysSinceLastVisit(lastVisit, now)).toBe(2);
  });

  it('returns null for missing last visit date', () => {
    expect(computeDaysSinceLastVisit(null)).toBeNull();
  });

  it('computes visit frequency only when enough visits and range > 0', () => {
    const first = new Date('2026-01-01T00:00:00.000Z');
    const last = new Date('2026-01-11T00:00:00.000Z');

    expect(computeVisitFrequencyDays(3, first, last, 2)).toBe(5);
    expect(computeVisitFrequencyDays(1, first, last, 2)).toBeNull();
    expect(computeVisitFrequencyDays(3, first, first, 2)).toBeNull();
  });

  it('builds snapshot using totalSpent/visits as source of truth', () => {
    const snapshot = buildCustomerKpiSnapshot({
      visits: 5,
      totalSpent: 12345,
      firstPurchaseAt: new Date('2026-01-01T00:00:00.000Z'),
      lastPurchaseAt: new Date('2026-01-11T00:00:00.000Z'),
      averageCheckPrecision: 0,
      visitFrequencyPrecision: 0,
      now: new Date('2026-01-15T00:00:00.000Z'),
    });

    expect(snapshot).toEqual({
      visits: 5,
      totalSpent: 12345,
      averageCheck: 2469,
      daysSinceLastVisit: 4,
      visitFrequencyDays: 3,
    });
  });

  it('uses fallback average check when visits are zero', () => {
    const snapshot = buildCustomerKpiSnapshot({
      visits: 0,
      totalSpent: 0,
      fallbackAverageCheck: 777.4,
      averageCheckPrecision: 0,
    });

    expect(snapshot.averageCheck).toBe(777);
    expect(snapshot.visitFrequencyDays).toBeNull();
  });
});
