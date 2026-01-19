import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildChartPoints,
  calcDelta,
  formatCurrency,
  formatDayLabel,
  formatDecimal,
  formatNumber,
  formatPeriodLabel,
  hasTimelineData,
} from "../src/app/analytics/summary-utils";

describe("analytics summary utils", () => {
  it("форматирует числа и валюту", () => {
    assert.equal(formatNumber(12345), "12\u00a0345");
    assert.equal(formatDecimal(12.345), "12,3");
    assert.equal(formatCurrency(5000), "5\u00a0000\u00a0₽");
  });

  it("строит точки графика и выравнивает прошлый период", () => {
    const points = buildChartPoints({
      current: [
        { date: "2025-11-01", registrations: 2, salesCount: 3, salesAmount: 5000 },
        { date: "2025-11-02", registrations: 1, salesCount: 0, salesAmount: 0 },
      ],
      previous: [{ date: "2025-10-31", registrations: 5, salesCount: 2, salesAmount: 4200 }],
      grouping: "day",
    });

    assert.equal(points.length, 2);
    assert.deepEqual(points[0], {
      label: "01.11",
      revenue: 5000,
      prevRevenue: 4200,
      registrations: 2,
      prevRegistrations: 5,
    });
    assert.equal(points[1].prevRevenue, 0);
  });

  it("считает дельту и направления", () => {
    const up = calcDelta(120, 100);
    assert.equal(up.direction, "up");
    assert.equal(Math.round((up.value || 0) * 10) / 10, 20);

    const down = calcDelta(50, 100);
    assert.equal(down.direction, "down");
    assert.equal(Math.round((down.value || 0) * 10) / 10, -50);

    const neutral = calcDelta(10, 0);
    assert.equal(neutral.value, null);
    assert.equal(neutral.direction, "neutral");
  });

  it("определяет наличие данных с учетом прошлого периода", () => {
    const empty = { current: [], previous: [], grouping: "day" as const };
    const hasCurrent = {
      current: [{ date: "2025-11-01", registrations: 0, salesCount: 1, salesAmount: 0 }],
      previous: [],
      grouping: "day" as const,
    };
    const hasPrevious = {
      current: [],
      previous: [{ date: "2025-10-31", registrations: 1, salesCount: 0, salesAmount: 0 }],
      grouping: "day" as const,
    };

    assert.equal(hasTimelineData(empty), false);
    assert.equal(hasTimelineData(hasCurrent), true);
    assert.equal(hasTimelineData(hasPrevious), true);
  });

  it("форматирует день и период", () => {
    assert.equal(formatDayLabel("2025-11-17"), "17.11");
    const label = formatPeriodLabel({
      from: "2025-11-01T00:00:00Z",
      to: "2025-11-30T23:59:59Z",
      type: "month",
    }).toLowerCase();
    assert.equal(label.includes("ноябрь"), true);
    assert.equal(label.includes("2025"), true);
  });
});
