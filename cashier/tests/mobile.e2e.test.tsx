import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const originalFetch = global.fetch;
const restoreFetch = () => {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
};

describe("cashier mobile layout", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;
  let originalMatchMedia: typeof window.matchMedia | undefined;

  beforeEach(() => {
    window.localStorage.clear();
    fetchMock = undefined;
    originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      value: (query: string) => ({
        matches: true,
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
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    restoreFetch();
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("открывает мобильный сценарий и ищет клиента", async () => {
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

      if (url.endsWith("/loyalty/cashier/customer") && method === "POST") {
        return new Response(
          JSON.stringify({ customerId: "C-1", name: "Михаил И.", balance: 1200 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/levels/") && method === "GET") {
        return new Response(JSON.stringify({ current: { name: "Gold" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CashierPage } = await import("../src/app/page");
    render(React.createElement(CashierPage));

    await screen.findByText("Касса");
    fireEvent.click(screen.getByRole("button", { name: "Касса" }));
    await screen.findByText("Сканировать QR");

    fireEvent.click(screen.getByRole("button", { name: /Ввести вручную/ }));

    fireEvent.pointerDown(screen.getByRole("button", { name: "1" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "2" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "3" }));

    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await screen.findByText("Михаил И.");
    await screen.findByText("баллов");
  });

  it("переключает вкладки мобильного меню", async () => {
    const items = [
      {
        id: "tx-1",
        mode: "PURCHASE",
        type: "EARN",
        purchaseAmount: 500,
        earnApplied: 20,
        redeemApplied: 0,
        receiptNumber: "RC-1",
        createdAt: new Date().toISOString(),
        staffName: "Сотрудник А",
        customerName: "Клиент 1",
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
        return new Response(JSON.stringify({ items, nextBefore: null }), {
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
            items: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CashierPage } = await import("../src/app/page");
    render(React.createElement(CashierPage));

    await screen.findByText("Касса");

    fireEvent.click(screen.getByRole("button", { name: "История" }));
    await screen.findByPlaceholderText("Чек или клиент...");

    fireEvent.click(screen.getByRole("button", { name: "Рейтинг" }));
    await screen.findByText("Мой рейтинг");

    fireEvent.click(screen.getByRole("button", { name: "Возврат" }));
    await screen.findByText("Оформление возврата");
  });

  it("показывает корректные списание и возврат в истории возвратов", async () => {
    const items = [
      {
        id: "tx-1",
        mode: "REFUND",
        type: "REFUND",
        purchaseAmount: 1200,
        refundEarn: 40,
        refundRedeem: 60,
        receiptNumber: "RC-RETURN-1",
        createdAt: new Date().toISOString(),
        staffName: "Сотрудник А",
        customerName: "Клиент 1",
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
        return new Response(JSON.stringify({ items, nextBefore: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CashierPage } = await import("../src/app/page");
    render(React.createElement(CashierPage));

    await screen.findByText("Касса");

    fireEvent.click(screen.getByRole("button", { name: "История" }));

    const row = (await screen.findByText("Клиент 1")).closest(".cursor-pointer");
    if (!row) throw new Error("History row not found");
    fireEvent.click(row);

    await screen.findByText("Возврат");
    await screen.findByText("Списано баллов");
    await screen.findByText("Возвращено баллов");
    await screen.findByText("-40");
    await screen.findByText("+60");
  });
});
