import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const originalFetch = global.fetch;
const restoreFetch = () => {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
};

describe("cashier history and rating", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;

  beforeEach(() => {
    window.localStorage.clear();
    fetchMock = undefined;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    restoreFetch();
  });

  it("показывает историю, фильтры и пагинацию", async () => {
    Object.defineProperty(window, "matchMedia", {
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        },
      }),
      writable: true,
      configurable: true,
    });
    const today = new Date();
    const todayValue = today.toISOString().split("T")[0];
    const makeDate = (offsetMinutes: number) => new Date(today.getTime() - offsetMinutes * 60_000).toISOString();
    const items = Array.from({ length: 9 }, (_, idx) => ({
      id: `tx-${idx + 1}`,
      mode: idx === 8 ? "REFUND" : "PURCHASE",
      type: idx === 8 ? "REFUND" : "EARN",
      purchaseAmount: 1000 + idx * 10,
      earnApplied: idx === 8 ? 0 : 20,
      redeemApplied: 0,
      refundEarn: idx === 8 ? 30 : 0,
      refundRedeem: 0,
      receiptNumber: `RC-${idx + 1}`,
      createdAt: makeDate(idx * 5),
      staffName: idx % 2 === 0 ? "Сотрудник А" : "Сотрудник Б",
      customerName: `Клиент ${idx + 1}`,
    }));

    fetchMock = mock.method(global, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || "GET";

      if (url.endsWith("/loyalty/cashier/session") && method === "GET") {
        return new Response(
          JSON.stringify({
            active: true,
            merchantId: "M-123",
            sessionId: "CS-1",
            staff: { id: "S-1", login: "alice", firstName: "Алиса", lastName: "Фриман", role: "CASHIER" },
            outlet: { id: "O-1", name: "Флагманский магазин" },
            startedAt: "2025-01-01T00:00:00.000Z",
            rememberPin: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/loyalty/cashier/outlet-transactions") && method === "GET") {
        return new Response(
          JSON.stringify({
            items,
            nextBefore: null,
            shiftStats: {
              revenue: 1337,
              checks: 2,
              scope: "staff",
              timezone: "MSK+4",
              from: today.toISOString(),
              to: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
            },
          }),
          {
          status: 200,
          headers: { "Content-Type": "application/json" },
          },
        );
      }

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CashierPage } = await import("../src/app/page");
    render(React.createElement(CashierPage));

    await screen.findByText("Терминал лояльности");
    fireEvent.click(screen.getByLabelText("История"));

    const historyHeading = await screen.findByRole("heading", { name: "История операций", level: 2 });
    const historyMain = historyHeading.closest("main");
    if (!historyMain) {
      throw new Error("History main container not found");
    }
    const historyScope = within(historyMain);

    const dateInput = await historyScope.findByDisplayValue(todayValue);
    fireEvent.change(dateInput, { target: { value: "" } });

    await historyScope.findByText("Клиент 1");

    const countLabel = historyScope.getByText(/Найдено:/);
    assert.ok(countLabel.textContent?.includes(String(items.length)));

    fireEvent.change(historyScope.getByPlaceholderText("№ Чека или Имя клиента..."), { target: { value: "Клиент 5" } });
    await waitFor(() => {
      const labelText = historyScope.getByText(/Найдено:/).textContent ?? "";
      assert.ok(labelText.includes("1"));
    });

    fireEvent.change(historyScope.getByPlaceholderText("№ Чека или Имя клиента..."), { target: { value: "" } });
    const returnFilter = historyScope.getAllByRole("button", { name: "Возврат" }).find((btn) => btn.textContent === "Возврат");
    if (!returnFilter) {
      throw new Error("Return filter button not found");
    }
    fireEvent.click(returnFilter);

    await waitFor(() => {
      const labelText = historyScope.getByText(/Найдено:/).textContent ?? "";
      assert.ok(labelText.includes("1"));
    });
  });

  it("считает смену только по сегодняшним продажам", async () => {
    Object.defineProperty(window, "matchMedia", {
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        },
      }),
      writable: true,
      configurable: true,
    });

    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const items = [
      {
        id: "tx-1",
        mode: "PURCHASE",
        type: "EARN",
        purchaseAmount: 1000,
        earnApplied: 10,
        redeemApplied: 0,
        receiptNumber: "RC-1",
        createdAt: today.toISOString(),
        staffId: "S-1",
        staffName: "Сотрудник А",
        customerName: "Клиент 1",
      },
      {
        id: "tx-2",
        mode: "REFUND",
        type: "REFUND",
        purchaseAmount: 900,
        refundEarn: 10,
        refundRedeem: 0,
        receiptNumber: "RC-2",
        createdAt: today.toISOString(),
        staffId: "S-1",
        staffName: "Сотрудник А",
        customerName: "Клиент 2",
      },
      {
        id: "tx-3",
        mode: "PURCHASE",
        type: "EARN",
        purchaseAmount: 700,
        earnApplied: 5,
        redeemApplied: 0,
        receiptNumber: "RC-3",
        createdAt: today.toISOString(),
        staffId: "S-2",
        staffName: "Сотрудник Б",
        customerName: "Клиент 3",
      },
      {
        id: "tx-4",
        mode: "PURCHASE",
        type: "EARN",
        purchaseAmount: 500,
        earnApplied: 5,
        redeemApplied: 0,
        receiptNumber: "RC-4",
        createdAt: yesterday.toISOString(),
        staffId: "S-2",
        staffName: "Сотрудник Б",
        customerName: "Клиент 4",
      },
    ];

    fetchMock = mock.method(global, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || "GET";

      if (url.endsWith("/loyalty/cashier/session") && method === "GET") {
        return new Response(
          JSON.stringify({
            active: true,
            merchantId: "M-123",
            sessionId: "CS-1",
            staff: { id: "S-1", login: "alice", firstName: "Алиса", lastName: "Фриман", role: "CASHIER" },
            outlet: { id: "O-1", name: "Флагманский магазин" },
            startedAt: "2025-01-01T00:00:00.000Z",
            rememberPin: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/loyalty/cashier/outlet-transactions") && method === "GET") {
        return new Response(
          JSON.stringify({
            items,
            nextBefore: null,
            shiftStats: {
              revenue: 1337,
              checks: 2,
              scope: "staff",
              timezone: "MSK+3",
              from: today.toISOString(),
              to: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CashierPage } = await import("../src/app/page");
    render(React.createElement(CashierPage));

    await screen.findByText("Терминал лояльности");

    const expectedRevenue = new Intl.NumberFormat("ru-RU").format(1337);
    const expectedCompact = expectedRevenue.replace(/\s/g, "");
    const shiftHeadings = await screen.findAllByText("Ваши операции за сегодня");
    const shiftHeading = shiftHeadings.find((node) => node.closest("aside")) ?? shiftHeadings[0];
    const shiftContainer = shiftHeading.closest("aside") ?? shiftHeading.parentElement ?? shiftHeading;
    const shiftScope = within(shiftContainer);

    const revenueLabel = shiftScope.getByText("Выручка");
    const revenueCard = revenueLabel.closest("div")?.parentElement ?? shiftContainer;
    const revenueNode = await within(revenueCard).findByText((text) =>
      text.replace(/\s/g, "").includes(expectedCompact),
    );
    assert.ok(revenueNode.textContent?.includes("₽"));
    const checksLabel = shiftScope.getByText("Чеков");
    const checksCard = checksLabel.closest("div")?.parentElement ?? shiftContainer;
    within(checksCard).getByText("2");
  });

  it("показывает рейтинг сотрудников", async () => {
    Object.defineProperty(window, "matchMedia", {
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        },
      }),
      writable: true,
      configurable: true,
    });
    fetchMock = mock.method(global, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || "GET";

      if (url.endsWith("/loyalty/cashier/session") && method === "GET") {
        return new Response(
          JSON.stringify({
            active: true,
            merchantId: "M-123",
            sessionId: "CS-1",
            staff: { id: "S-1", login: "alice", firstName: "Алиса", lastName: "Фриман", role: "CASHIER" },
            outlet: { id: "O-1", name: "Флагманский магазин" },
            startedAt: "2025-01-01T00:00:00.000Z",
            rememberPin: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/loyalty/cashier/outlet-transactions") && method === "GET") {
        return new Response(JSON.stringify({ items: [], nextBefore: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/loyalty/cashier/leaderboard") && method === "GET") {
        return new Response(
          JSON.stringify({
            enabled: true,
            settings: { pointsForNewCustomer: 10, pointsForExistingCustomer: 2, leaderboardPeriod: "week" },
            period: { kind: "week", label: "Последние 7 дней" },
            items: [
              { staffId: "S-1", staffName: "Алиса Ф.", outletName: "Флагманский магазин", points: 1200 },
              { staffId: "S-2", staffName: "Боб С.", outletName: "Флагманский магазин", points: 900 },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CashierPage } = await import("../src/app/page");
    render(React.createElement(CashierPage));

    await screen.findByText("Терминал лояльности");
    fireEvent.click(screen.getByLabelText("Рейтинг"));

    await screen.findByText("Рейтинг сотрудников");
    await screen.findByText("Топ сотрудников");
    await screen.findByText("Алиса Ф.");
    await screen.findByText("Боб С.");
  });
});
