import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildChartOption,
  buildMetricCards,
  formatDayLabel,
  hasTimelineData,
  SummaryMetrics,
  SummaryTimelinePoint,
} from "../app/analytics/summary-utils";

describe("analytics summary utils", () => {
  it("formats metric cards for all elements", () => {
    const metrics: SummaryMetrics = {
      salesAmount: 12345,
      averageCheck: 411,
      newCustomers: 7,
      activeCustomers: 3,
      averagePurchasesPerCustomer: 2.34,
      visitFrequencyDays: 5.8,
    };

    const cards = buildMetricCards(metrics);
    const lookup = new Map(cards.map((card) => [card.title, card.value]));

    assert.equal(lookup.get("Сумма продаж"), "12\u00a0345\u00a0₽");
    assert.equal(lookup.get("Средний чек"), "411\u00a0₽");
    assert.equal(lookup.get("Новые клиенты"), "7");
    assert.equal(lookup.get("Активные клиенты"), "3");
    assert.equal(lookup.get("Среднее количество покупок"), "2,3");
    assert.equal(lookup.get("Частота визитов"), "5,8 дн.");
  });

  it("handles empty metrics", () => {
    const cards = buildMetricCards(undefined as unknown as SummaryMetrics);
    cards.forEach((card) => assert.equal(card.value, "—"));
  });

  it("detects timeline data presence", () => {
    const emptyTimeline: SummaryTimelinePoint[] = [
      { date: "2025-11-15", registrations: 0, salesCount: 0, salesAmount: 0 },
    ];
    const filledTimeline: SummaryTimelinePoint[] = [
      { date: "2025-11-15", registrations: 0, salesCount: 2, salesAmount: 1500 },
    ];

    assert.equal(hasTimelineData([]), false);
    assert.equal(hasTimelineData(emptyTimeline), false);
    assert.equal(hasTimelineData(filledTimeline), true);
  });

  it("builds chart option with separate axes and no point labels", () => {
    const option = buildChartOption([
      { date: "2025-11-01", registrations: 2, salesCount: 3, salesAmount: 5000 },
      { date: "2025-11-02", registrations: 1, salesCount: 0, salesAmount: 0 },
    ]);

    assert.equal((option as any).yAxis.length, 3);
    const series = (option as any).series;
    assert.equal(series[0].yAxisIndex, 0);
    assert.equal(series[1].yAxisIndex, 1);
    assert.equal(series[2].yAxisIndex, 2);
    series.forEach((item: any) => assert.equal(item.label?.show, false));
    assert.deepEqual((option as any).xAxis.data, ["01.11", "02.11"]);
    (option as any).yAxis.forEach((axis: any) => {
      assert.equal(axis.axisLabel?.show, false);
      assert.equal(axis.splitLine?.show, false);
      assert.equal(axis.name, undefined);
    });
  });

  it("formats day labels", () => {
    assert.equal(formatDayLabel("2025-11-17"), "17.11");
  });
});
