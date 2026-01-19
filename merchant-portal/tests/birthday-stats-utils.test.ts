import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatBucketLabel, groupRevenue, groupTimeline } from "../src/app/loyalty/mechanics/birthday/stats-utils";

describe("birthday stats utils", () => {
  it("aggregates timeline by weeks with sorting", () => {
    const items = [
      { date: "2025-11-01", greetings: 1, purchases: 2 },
      { date: "2025-11-02", greetings: 2, purchases: 1 },
      { date: "2025-11-08", greetings: 1, purchases: 1 },
    ];

    const result = groupTimeline(items, "week");

    assert.deepEqual(result, [
      { bucket: "2025-10-27", greetings: 3, purchases: 3 },
      { bucket: "2025-11-03", greetings: 1, purchases: 1 },
    ]);
  });

  it("aggregates revenue by month", () => {
    const revenue = [
      { date: "2025-11-01", revenue: 1000 },
      { date: "2025-11-15", revenue: 2000 },
      { date: "2025-12-01", revenue: 500 },
    ];

    const result = groupRevenue(revenue, "month");

    assert.deepEqual(result, [
      { bucket: "2025-11-01", revenue: 3000 },
      { bucket: "2025-12-01", revenue: 500 },
    ]);
  });

  it("formats bucket labels", () => {
    assert.equal(formatBucketLabel("2025-11-03", "week"), "Неделя с 03.11");
    assert.equal(formatBucketLabel("2025-11-01", "month"), "11.2025");
    assert.equal(formatBucketLabel("2025-11-07", "day"), "07.11");
  });
});
