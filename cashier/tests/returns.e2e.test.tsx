import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const originalFetch = global.fetch;
const restoreFetch = () => {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
};

describe("cashier returns flow", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;
  const alertMock = mock.fn();

  beforeEach(() => {
    window.localStorage.clear();
    fetchMock = undefined;
    (globalThis as unknown as { alert: typeof alert }).alert = alertMock as unknown as typeof alert;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    restoreFetch();
    alertMock.mock.resetCalls();
  });

  it("находит чек и оформляет возврат", async () => {
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
    const items = [
      {
        id: "tx-100",
        mode: "PURCHASE",
        type: "EARN",
        purchaseAmount: 2500,
        earnApplied: 100,
        redeemApplied: 50,
        receiptNumber: "RC-100",
        orderId: "O-100",
        createdAt: new Date().toISOString(),
        staffName: "Сотрудник А",
        customerName: "Мария И.",
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

      if (url.endsWith("/loyalty/refund") && method === "POST") {
        return new Response(JSON.stringify({ ok: true, share: 0, pointsRestored: 50, pointsRevoked: 100 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CashierPage } = await import("../src/app/page");
    render(React.createElement(CashierPage));

    await screen.findByText("Терминал лояльности");

    fireEvent.click(screen.getByRole("button", { name: "Возврат" }));

    await screen.findByRole("heading", { name: "Оформление возврата", level: 2 });

    fireEvent.change(screen.getByPlaceholderText("№ Чека"), { target: { value: "O-100" } });
    await screen.findByDisplayValue("O-100");
    fireEvent.click(screen.getByRole("button", { name: "Найти операцию" }));

    await screen.findByText("Подтверждение возврата");

    fireEvent.click(screen.getByRole("button", { name: "Выполнить возврат" }));

    await screen.findByText("Оформление возврата");
  });
});
