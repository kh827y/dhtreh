import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeBonusProgress,
  computeDeltaPercent,
  formatCurrency,
  formatNumber,
  formatShortDate,
  hasTimelineData,
  normalizeTimeline,
  type ReferralTimelinePoint,
} from "../src/app/analytics/referrals/utils";

describe("referral analytics utils", () => {
  it("normalizes and sorts timeline points", () => {
    const timeline: ReferralTimelinePoint[] = [
      { date: "2025-01-02", registrations: 0.4, firstPurchases: 1 },
      { date: "2025-01-01", registrations: 2.2, firstPurchases: 0 },
      { date: "2025-01-02", registrations: 1, firstPurchases: 0 },
    ];
    const normalized = normalizeTimeline(timeline);
    assert.deepEqual(normalized, [
      { date: "2025-01-01", registrations: 2, firstPurchases: 0 },
      { date: "2025-01-02", registrations: 1, firstPurchases: 1 },
    ]);
  });

  it("detects when timeline contains data", () => {
    assert.equal(hasTimelineData([]), false);
    assert.equal(
      hasTimelineData([{ date: "2025-01-01", registrations: 0, firstPurchases: 0 }]),
      false,
    );
    assert.equal(
      hasTimelineData([{ date: "2025-01-01", registrations: 1, firstPurchases: 0 }]),
      true,
    );
  });

  it("formats numeric values for ru locale", () => {
    assert.equal(formatNumber(12345.6), "12\u00a0346");
    assert.equal(formatNumber(undefined), "—");
    assert.equal(formatCurrency(5000.2), "₽5\u00a0000");
  });

  it("formats ISO dates as short labels without trailing dots", () => {
    assert.equal(formatShortDate("2025-11-07"), "7 Ноя");
    assert.equal(formatShortDate("invalid"), "invalid");
  });

  it("computes bonus progress ratio with capping", () => {
    assert.equal(computeBonusProgress(0, 1000), 0);
    assert.equal(computeBonusProgress(100, 0), 100);
    assert.equal(computeBonusProgress(120, 200), 60);
    assert.equal(computeBonusProgress(500, 200), 100);
  });

  it("computes delta percent with rounding and guards", () => {
    assert.equal(computeDeltaPercent(110, 100), 10);
    assert.equal(computeDeltaPercent(90, 100), -10);
    assert.equal(computeDeltaPercent(100, 0), null);
    assert.equal(computeDeltaPercent(undefined, 100), null);
  });
});
