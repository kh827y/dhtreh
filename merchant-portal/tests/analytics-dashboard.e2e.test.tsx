import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { JSDOM } from "jsdom";
import type { DashboardResponse } from "../app/analytics/summary-utils";

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

mock.module("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="chart">{children}</div>,
  ComposedChart: ({ children }: any) => <div>{children}</div>,
  CartesianGrid: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Area: () => <div />,
  Line: () => <div />,
  Bar: () => <div />,
  PieChart: ({ children }: any) => <div data-testid="pie">{children}</div>,
  Pie: ({ children }: any) => <div>{children}</div>,
  Cell: () => <div />,
}));

describe("analytics dashboard e2e", () => {
  let fetchMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
    (global as any).window = dom.window;
    (global as any).document = dom.window.document;
    (global as any).navigator = dom.window.navigator;
    (global as any).HTMLElement = dom.window.HTMLElement;
    (global as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    fetchMock = mock.method(global, "fetch", async () =>
      new Response(JSON.stringify(dashboardFixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    cleanup();
    mock.reset();
    delete (global as any).window;
    delete (global as any).document;
    delete (global as any).navigator;
    delete (global as any).HTMLElement;
    delete (global as any).ResizeObserver;
  });

  it("отображает ключевые KPI и retention", async () => {
    const { default: AnalyticsDashboardPage } = await import("../app/analytics/page");
    render(React.createElement(AnalyticsDashboardPage));

    await screen.findByText("Сводный отчет");
    assert.equal(fetchMock.mock.calls.length, 1);

    const revenue = await screen.findByText((text) => text.includes("₽"));
    assert.ok(revenue.textContent?.includes("1"));

    assert.ok(screen.getByText("+5"));
    assert.ok(screen.getByText(/60%/));
    assert.ok(screen.getByText(/чеков/));
  });
});
