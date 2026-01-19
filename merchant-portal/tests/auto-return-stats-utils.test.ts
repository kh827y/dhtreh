import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatBucketLabel,
  groupAttemptsTimeline,
  groupRevenueTimeline,
  groupRfmReturnsTimeline,
} from "../src/app/loyalty/mechanics/auto-return/stats-utils";

describe("auto-return stats utils", () => {
  it("groups attempts by weeks", () => {
    const points = [
      { date: "2025-11-01", invitations: 2, returns: 1 },
      { date: "2025-11-03", invitations: 1, returns: 0 },
      { date: "2025-11-08", invitations: 1, returns: 1 },
    ];

    const result = groupAttemptsTimeline(points, "week");

    assert.deepEqual(result, [
      { bucket: "2025-10-27", invitations: 2, returns: 1 },
      { bucket: "2025-11-03", invitations: 2, returns: 1 },
    ]);
  });

  it("groups revenue by month", () => {
    const points = [
      { date: "2025-11-01", total: 1000, firstPurchases: 400 },
      { date: "2025-11-20", total: 500, firstPurchases: 0 },
      { date: "2025-12-01", total: 250, firstPurchases: 150 },
    ];

    const result = groupRevenueTimeline(points, "month");

    assert.deepEqual(result, [
      { bucket: "2025-11-01", total: 1500, firstPurchases: 400 },
      { bucket: "2025-12-01", total: 250, firstPurchases: 150 },
    ]);
  });

  it("groups RFM returns per bucket and segment", () => {
    const points = [
      { date: "2025-11-01", segment: "5-5-5", returned: 1 },
      { date: "2025-11-02", segment: "5-5-5", returned: 2 },
      { date: "2025-11-10", segment: "4-3-2", returned: 1 },
    ];

    const result = groupRfmReturnsTimeline(points, "week");

    assert.deepEqual(result, [
      { bucket: "2025-10-27", segment: "5-5-5", returned: 3 },
      { bucket: "2025-11-10", segment: "4-3-2", returned: 1 },
    ]);
  });

  it("formats bucket labels", () => {
    assert.equal(formatBucketLabel("2025-11-03", "week"), "Неделя с 03.11");
    assert.equal(formatBucketLabel("2025-11-01", "month"), "11.2025");
    assert.equal(formatBucketLabel("2025-11-07", "day"), "07.11");
  });
});
