import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const originalFetch = global.fetch;
const restoreFetch = () => {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
};

describe("cashier checkout flow", () => {
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

  it("оформляет начисление баллов и проводит операцию", async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];

    fetchMock = mock.method(global, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;

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
        calls.push({ url, method, body });
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

      if (url.endsWith("/loyalty/quote") && method === "POST") {
        calls.push({ url, method, body });
        return new Response(
          JSON.stringify({ canEarn: true, pointsToEarn: 50, holdId: "H-1" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/loyalty/commit") && method === "POST") {
        calls.push({ url, method, body });
        return new Response(
          JSON.stringify({ ok: true, earnApplied: 50, redeemApplied: 0 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CashierPage } = await import("../src/app/page");
    render(React.createElement(CashierPage));

    await screen.findByText("Терминал лояльности");

    fireEvent.change(screen.getByPlaceholderText("Введите код или сканируйте QR"), {
      target: { value: "token-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await screen.findByText("Сумма покупки");

    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    fireEvent.click(await screen.findByRole("button", { name: /Начислить баллы/ }));

    await screen.findByText("Подтвердите операцию");
    fireEvent.click(screen.getByRole("button", { name: "Провести" }));

    await screen.findByText("Оплата прошла");

    const quoteCall = calls.find((call) => call.url.endsWith("/loyalty/quote"));
    assert.ok(quoteCall);
    assert.equal(quoteCall.body.mode, "earn");
    assert.equal(quoteCall.body.total, 1000);
    assert.equal(quoteCall.body.userToken, "token-123");
    assert.equal(quoteCall.body.staffId, "S-1");
    assert.equal(quoteCall.body.outletId, "O-1");

    const commitCall = calls.find((call) => call.url.endsWith("/loyalty/commit"));
    assert.ok(commitCall);
    assert.equal(commitCall.body.holdId, "H-1");
    assert.equal(commitCall.body.staffId, "S-1");
    assert.equal(commitCall.body.outletId, "O-1");
  });

  it("передает сумму списания при расчете", async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];

    fetchMock = mock.method(global, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;

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
          JSON.stringify({ customerId: "C-1", name: "Михаил И.", balance: 500 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/levels/") && method === "GET") {
        return new Response(JSON.stringify({ current: { name: "Gold" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/loyalty/quote") && method === "POST") {
        calls.push({ url, method, body });
        return new Response(
          JSON.stringify({
            canRedeem: true,
            discountToApply: 150,
            pointsToBurn: 150,
            finalPayable: 850,
            holdId: "H-2",
            postEarnPoints: 10,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CashierPage } = await import("../src/app/page");
    render(React.createElement(CashierPage));

    await screen.findByText("Терминал лояльности");

    fireEvent.change(screen.getByPlaceholderText("Введите код или сканируйте QR"), {
      target: { value: "token-555" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await screen.findByText("Сумма покупки");

    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    fireEvent.click(await screen.findByRole("button", { name: /Списать баллы/ }));

    const redeemInput = await screen.findByRole("spinbutton");
    fireEvent.change(redeemInput, { target: { value: "150" } });

    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    await screen.findByText("Подтвердите операцию");

    const quoteCall = calls.find((call) => call.url.endsWith("/loyalty/quote"));
    assert.ok(quoteCall);
    assert.equal(quoteCall.body.mode, "redeem");
    assert.equal(quoteCall.body.redeemAmount, 150);
  });

  it("ограничивает списание по уровню клиента", async () => {
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
          JSON.stringify({ customerId: "C-1", name: "Михаил И.", balance: 1000 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/levels/") && method === "GET") {
        return new Response(
          JSON.stringify({ current: { name: "Gold", redeemRateBps: 2500, minPaymentAmount: 100 } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CashierPage } = await import("../src/app/page");
    render(React.createElement(CashierPage));

    await screen.findByText("Терминал лояльности");

    fireEvent.change(screen.getByPlaceholderText("Введите код или сканируйте QR"), {
      target: { value: "token-999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await screen.findByText("Сумма покупки");

    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    fireEvent.click(await screen.findByRole("button", { name: /Списать баллы/ }));

    await screen.findByText("Доступно: 250");

    const redeemInput = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Максимум" }));
    assert.equal(redeemInput.value, "250");

    fireEvent.change(redeemInput, { target: { value: "300" } });
    const nextButton = screen.getByRole("button", { name: "Далее" }) as HTMLButtonElement;
    assert.equal(nextButton.disabled, true);
  });

  it("использует лимит списания из профиля клиента", async () => {
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
          JSON.stringify({ customerId: "C-1", name: "Михаил И.", balance: 2000, redeemLimitBps: 3000 }),
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

    await screen.findByText("Терминал лояльности");

    fireEvent.change(screen.getByPlaceholderText("Введите код или сканируйте QR"), {
      target: { value: "token-888" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await screen.findByText("Сумма покупки");

    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    fireEvent.click(await screen.findByRole("button", { name: /Списать баллы/ }));

    await screen.findByText("Доступно: 300");

    const redeemInput = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Максимум" }));
    assert.equal(redeemInput.value, "300");
  });

  it("отменяет расчет при возврате с подтверждения", async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];

    fetchMock = mock.method(global, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;

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
          headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/loyalty/quote") && method === "POST") {
        calls.push({ url, method, body });
        return new Response(
          JSON.stringify({ canEarn: true, pointsToEarn: 50, holdId: "H-1" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/loyalty/cancel") && method === "POST") {
        calls.push({ url, method, body });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CashierPage } = await import("../src/app/page");
    render(React.createElement(CashierPage));

    await screen.findByText("Терминал лояльности");

    fireEvent.change(screen.getByPlaceholderText("Введите код или сканируйте QR"), {
      target: { value: "token-321" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await screen.findByText("Сумма покупки");

    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    fireEvent.click(await screen.findByRole("button", { name: /Начислить баллы/ }));
    await screen.findByText("Подтвердите операцию");

    fireEvent.click(screen.getByRole("button", { name: "Назад" }));

    await waitFor(() => {
      const cancelCall = calls.find((call) => call.url.endsWith("/loyalty/cancel"));
      assert.ok(cancelCall);
      assert.equal(cancelCall?.body?.holdId, "H-1");
    });
  });
});
