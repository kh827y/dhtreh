import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

const originalFetch = global.fetch;

const routerStub = {
  back: () => {},
  forward: () => {},
  prefetch: async () => {},
  push: () => {},
  refresh: () => {},
  replace: () => {},
};

const renderWithRouter = (ui: React.ReactElement, searchParams = "") =>
  render(
    <AppRouterContext.Provider value={routerStub}>
      <SearchParamsContext.Provider value={new URLSearchParams(searchParams)}>
        {ui}
      </SearchParamsContext.Provider>
    </AppRouterContext.Provider>,
  );

describe("customers page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;

  beforeEach(() => {
    fetchMock = undefined;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
  });

  it("renders list and creates customer", async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];
    const baseCustomer = {
      id: "c1",
      phone: "+7 (900) 111-22-33",
      email: "client@example.com",
      firstName: "Иван",
      lastName: "Петров",
      gender: "male",
      levelName: "Base",
      levelId: "lvl-base",
      bonusBalance: 0,
      pendingBalance: 0,
      spendTotal: 0,
      spendCurrentMonth: 0,
      spendPreviousMonth: 0,
      averageCheck: 0,
      visits: 0,
      transactions: [],
      expiry: [],
      reviews: [],
      invited: [],
    };

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.startsWith("/api/customers") && method === "GET") {
        return new Response(JSON.stringify([baseCustomer]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/portal/loyalty/tiers") && method === "GET") {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/customers") && method === "POST") {
        calls.push({ url, method, body });
        return new Response(JSON.stringify({ ...baseCustomer, id: "c2", phone: "+7 (900) 222-33-44" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CustomersPage } = await import("../app/customers/page");
    renderWithRouter(React.createElement(CustomersPage));

    await screen.findByText("Клиенты");
    await screen.findByText("База данных покупателей, управление профилями и начислениями.");
    await screen.findByText("+7 (900) 111-22-33");

    fireEvent.click(screen.getByText("Добавить клиента"));
    fireEvent.change(screen.getByPlaceholderText("+7"), { target: { value: "+7 (900) 222-33-44" } });
    fireEvent.click(screen.getByText("Создать"));

    await screen.findByText("Клиент создан");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.phone, "+7 (900) 222-33-44");
  });
});
