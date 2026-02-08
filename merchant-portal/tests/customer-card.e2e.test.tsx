import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import CustomerCard from "../src/app/customers/customer-card";

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
    const unexpectedCalls: Array<{ url: string; method: string }> = [];
    let tiersGetCount = 0;
    let customerGetCount = 0;
    let customersListGetCount = 0;
    let outletsGetCount = 0;
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
        customerGetCount += 1;
        return new Response(JSON.stringify(customerPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/customers") && method === "GET") {
        customersListGetCount += 1;
        return new Response(JSON.stringify([customerPayload]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/portal/outlets") && method === "GET") {
        outletsGetCount += 1;
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/portal/loyalty/tiers") && method === "GET") {
        tiersGetCount += 1;
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
      unexpectedCalls.push({ url, method });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
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
    assert.equal(tiersGetCount, 1);
    assert.equal(customerGetCount, 1);
    assert.equal(customersListGetCount, 1);
    assert.equal(outletsGetCount, 0);
    assert.equal(unexpectedCalls.length, 0, JSON.stringify(unexpectedCalls));
  });

  it("dedupes in-flight customer fetch under strict effects", async () => {
    let customerGetCount = 0;
    const unexpectedCalls: Array<{ url: string; method: string }> = [];
    const customerPayload = {
      id: "c-strict",
      login: "+79001112233",
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
      tags: [],
      transactions: [],
      expiry: [],
      reviews: [],
      invited: [],
      referrer: null,
    };

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/customers/c-strict") && method === "GET") {
        customerGetCount += 1;
        return new Response(JSON.stringify(customerPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      unexpectedCalls.push({ url, method });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    renderWithRouter(
      <React.StrictMode>
        <CustomerCard
          customerId="c-strict"
          initialCustomer={customerPayload as any}
          initialLevelRank={null}
          levelsCatalog={[{ id: "lvl-base", name: "Base", label: "Base", isInitial: true, thresholdAmount: 0 }]}
          existingLoginsCatalog={["+79001112233"]}
          onBack={() => {}}
          onNavigateToCustomer={() => {}}
        />
      </React.StrictMode>,
    );

    await screen.findByText("Карточка клиента");
    await screen.findByText("Анна Смирнова");
    assert.equal(customerGetCount, 1);
    assert.equal(unexpectedCalls.length, 0, JSON.stringify(unexpectedCalls));
  });
});
