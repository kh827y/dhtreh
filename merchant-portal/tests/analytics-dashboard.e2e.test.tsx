import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import type { DashboardResponse } from "../app/analytics/summary-utils";

const originalFetch = global.fetch;

if (!(globalThis as any).document) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  (globalThis as any).window = dom.window;
  (globalThis as any).document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  });
  (globalThis as any).HTMLElement = dom.window.HTMLElement;
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const dashboardFixture: DashboardResponse = {
  period: { from: "2024-01-01T00:00:00Z", to: "2024-01-07T23:59:59Z", type: "week" },
  previousPeriod: { from: "2023-12-25T00:00:00Z", to: "2023-12-31T23:59:59Z", type: "week" },
  metrics: {
    salesAmount: 1000,
    orders: 12,
    averageCheck: 200,
    newCustomers: 5,
    activeCustomers: 8,
    averagePurchasesPerCustomer: 1.5,
    visitFrequencyDays: 4.5,
    pointsBurned: 300,
  },
  previousMetrics: {
    salesAmount: 800,
    orders: 10,
    averageCheck: 180,
    newCustomers: 3,
    activeCustomers: 7,
    averagePurchasesPerCustomer: 1.4,
    visitFrequencyDays: 5.5,
    pointsBurned: 200,
  },
  timeline: {
    current: [
      { date: "2024-01-01", registrations: 1, salesCount: 2, salesAmount: 200 },
      { date: "2024-01-02", registrations: 2, salesCount: 3, salesAmount: 300 },
    ],
    previous: [
      { date: "2023-12-25", registrations: 1, salesCount: 1, salesAmount: 150 },
      { date: "2023-12-26", registrations: 0, salesCount: 0, salesAmount: 0 },
    ],
    grouping: "day",
  },
  composition: { newChecks: 5, repeatChecks: 7 },
  retention: { activeCurrent: 8, activePrevious: 10, retained: 6, retentionRate: 60, churnRate: 40 },
};

describe("analytics dashboard e2e", () => {
  let fetchMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    fetchMock = mock.method(global, "fetch", async () =>
      new Response(JSON.stringify(dashboardFixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
    cleanup();
  });

  it("отображает ключевые KPI и retention", async () => {
    const { default: AnalyticsDashboardPage } = await import("../app/analytics/page");
    render(React.createElement(AnalyticsDashboardPage));

    await screen.findByText("Сводный отчет");
    assert.equal(fetchMock.mock.calls.length, 1);

    const revenues = await screen.findAllByText((text) => text.includes("₽"));
    assert.ok(revenues.length > 0);

    assert.ok(screen.getByText("+5"));
    const revenueLabels = screen.getAllByText(/выручка/i);
    assert.ok(revenueLabels.length > 0);
  });
});
