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

describe("customer card page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;

  beforeEach(() => {
    fetchMock = undefined;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
  });

  it("blocks customer with full restriction", async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];
    const customerPayload = {
      id: "c1",
      phone: "+7 (900) 111-22-33",
      email: "client@example.com",
      firstName: "Анна",
      lastName: "Смирнова",
      gender: "female",
      birthday: "1995-10-25",
      registeredAt: "2024-01-15T10:00:00.000Z",
      levelName: "Base",
      levelId: "lvl-base",
      bonusBalance: 1200,
      pendingBalance: 100,
      spendTotal: 8000,
      spendCurrentMonth: 1200,
      spendPreviousMonth: 2000,
      averageCheck: 600,
      visits: 12,
      visitFrequencyDays: 14,
      daysSinceLastVisit: 7,
      comment: "Частый клиент.",
      accrualsBlocked: false,
      redemptionsBlocked: false,
      transactions: [],
      expiry: [],
      reviews: [],
      invited: [],
      referrer: null,
    };

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.endsWith("/api/customers/c1") && method === "GET") {
        return new Response(JSON.stringify(customerPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/customers") && method === "GET") {
        return new Response(JSON.stringify([customerPayload]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/portal/outlets") && method === "GET") {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/portal/loyalty/tiers") && method === "GET") {
        return new Response(
          JSON.stringify({ items: [{ id: "lvl-base", name: "Base", isInitial: true, thresholdAmount: 0 }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/customers/c1") && method === "PUT") {
        calls.push({ url, method, body });
        return new Response(
          JSON.stringify({ ...customerPayload, accrualsBlocked: true, redemptionsBlocked: true }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CustomersPage } = await import("../src/app/customers/page");
    renderWithRouter(React.createElement(CustomersPage), "customerId=c1");

    await screen.findByText("Карточка клиента");
    await screen.findByText("Анна Смирнова");

    fireEvent.click(screen.getByText("Блокировка"));
    const fullBlock = await screen.findByLabelText("Полная блокировка");
    fireEvent.click(fullBlock);
    fireEvent.click(screen.getByRole("button", { name: "Заблокировать" }));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.accrualsBlocked, true);
    assert.equal(calls[0].body.redemptionsBlocked, true);
  });
});
