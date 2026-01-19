import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ActivityMetric,
  RecencyResponse,
  TimeActivityResponse,
  toDayOfWeekData,
  toHeatmapData,
  toHourOfDayData,
  toRecencyChartData,
} from "../src/app/analytics/time/utils";

const sampleRecency: RecencyResponse = {
  group: "week",
  totalCustomers: 7,
  buckets: [
    { index: 0, value: 1, label: "1 неделя", customers: 3 },
    { index: 1, value: 2, label: "2 недели", customers: 4 },
  ],
};

const sampleActivity: TimeActivityResponse = {
  dayOfWeek: [
    { day: 1, orders: 2, customers: 1, revenue: 500, averageCheck: 250 },
    { day: 3, orders: 1, customers: 1, revenue: 300, averageCheck: 300 },
  ],
  hours: [
    { hour: 10, orders: 3, customers: 2, revenue: 900, averageCheck: 300 },
    { hour: 21, orders: 1, customers: 1, revenue: 450, averageCheck: 450 },
  ],
  heatmap: [
    { day: 1, hour: 10, orders: 2, customers: 1, revenue: 500, averageCheck: 250 },
    { day: 3, hour: 21, orders: 1, customers: 1, revenue: 450, averageCheck: 450 },
  ],
};

const getMetric = (metric: ActivityMetric, activity = sampleActivity) =>
  toHeatmapData(activity, metric);

describe("analytics time utils", () => {
  it("builds recency chart data with labels", () => {
    const chart = toRecencyChartData(sampleRecency);
    assert.equal(chart.length, 2);
    assert.deepEqual(chart[0], { label: "1 неделя", value: 1, count: 3 });
    assert.deepEqual(chart[1], { label: "2 недели", value: 2, count: 4 });
  });

  it("normalizes day of week data and preserves order", () => {
    const days = toDayOfWeekData(sampleActivity, "sales");
    assert.equal(days.length, 7);
    assert.equal(days[0]?.value, 2); // Monday
    assert.equal(days[1]?.value, 0); // Tuesday missing -> zero
    assert.equal(days[2]?.value, 1); // Wednesday
  });

  it("builds hour data with all 24 positions", () => {
    const hours = toHourOfDayData(sampleActivity, "revenue");
    assert.equal(hours.length, 24);
    assert.equal(hours[10]?.value, 900);
    assert.equal(hours[21]?.value, 450);
    assert.equal(hours[5]?.value, 0);
  });

  it("computes heatmap grid and max value per metric", () => {
    const salesHeatmap = getMetric("sales");
    assert.equal(salesHeatmap.cells.length, 7 * 24);
    const mondayTen = salesHeatmap.cells.find(
      (cell) => cell.dayIndex === 0 && cell.hour === 10,
    );
    assert.equal(mondayTen?.value, 2);
    const emptyCell = salesHeatmap.cells.find(
      (cell) => cell.dayIndex === 2 && cell.hour === 5,
    );
    assert.equal(emptyCell?.value, 0);
    assert.equal(salesHeatmap.maxValue, 2);

    const revenueHeatmap = getMetric("revenue");
    const wedEvening = revenueHeatmap.cells.find(
      (cell) => cell.dayIndex === 2 && cell.hour === 21,
    );
    assert.equal(wedEvening?.value, 450);
    assert.equal(revenueHeatmap.maxValue, 500); // highest revenue in sample
  });

  it("uses average check when metric avg_check selected", () => {
    const avgChecks = toDayOfWeekData(sampleActivity, "avg_check");
    assert.equal(avgChecks[0]?.value, 250);
    assert.equal(avgChecks[2]?.value, 300);
  });
});
