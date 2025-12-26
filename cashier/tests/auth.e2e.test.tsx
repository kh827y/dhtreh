import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const originalFetch = global.fetch;
const restoreFetch = () => {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
};

describe("cashier auth flow", () => {
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

  it("авторизуется по коду активации и PIN", async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];

    fetchMock = mock.method(global, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.endsWith("/loyalty/cashier/session") && method === "GET") {
        return new Response(JSON.stringify({ active: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/loyalty/cashier/device") && method === "GET") {
        return new Response(JSON.stringify({ active: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/loyalty/cashier/activate") && method === "POST") {
        calls.push({ url, method, body });
        return new Response(
          JSON.stringify({
            ok: true,
            merchantId: "M-123",
            login: "greenmarket-01",
            expiresAt: "2025-01-04T00:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/loyalty/cashier/session") && method === "POST") {
        calls.push({ url, method, body });
        return new Response(
          JSON.stringify({
            ok: true,
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

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CashierPage } = await import("../src/app/page");
    render(React.createElement(CashierPage));

    await screen.findByText("Авторизация устройства");

    fireEvent.change(screen.getByPlaceholderText("Например: shop_01"), { target: { value: "GreenMarket-01" } });
    fireEvent.change(screen.getByPlaceholderText("•••••••••"), { target: { value: "123456789" } });

    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    await screen.findByText("Вход сотрудника");

    fireEvent.pointerDown(screen.getByRole("button", { name: "1" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "2" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "3" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "4" }));

    await screen.findByText("Терминал лояльности");

    assert.equal(window.localStorage.getItem("cashier_merchant_login"), "greenmarket-01");

    assert.deepEqual(
      calls.map((call) => ({ url: call.url, method: call.method, body: call.body })),
      [
        {
          url: "/loyalty/cashier/activate",
          method: "POST",
          body: { merchantLogin: "greenmarket-01", activationCode: "123456789" },
        },
        {
          url: "/loyalty/cashier/session",
          method: "POST",
          body: { merchantLogin: "greenmarket-01", pinCode: "1234", rememberPin: false },
        },
      ],
    );
  });

  it("показывает ошибку при неверном коде активации", async () => {
    fetchMock = mock.method(global, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || "GET";

      if (url.endsWith("/loyalty/cashier/session") && method === "GET") {
        return new Response(JSON.stringify({ active: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/loyalty/cashier/device") && method === "GET") {
        return new Response(JSON.stringify({ active: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/loyalty/cashier/activate") && method === "POST") {
        return new Response(JSON.stringify({ message: "Invalid or expired activation code" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CashierPage } = await import("../src/app/page");
    render(React.createElement(CashierPage));

    await screen.findByText("Авторизация устройства");

    fireEvent.change(screen.getByPlaceholderText("Например: shop_01"), { target: { value: "greenmarket-01" } });
    fireEvent.change(screen.getByPlaceholderText("•••••••••"), { target: { value: "000000000" } });

    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    await screen.findByText("Неверный или истёкший код активации");
  });

  it("пропускает активацию, если устройство уже активно", async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];

    fetchMock = mock.method(global, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.endsWith("/loyalty/cashier/session") && method === "GET") {
        return new Response(JSON.stringify({ active: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/loyalty/cashier/device") && method === "GET") {
        return new Response(
          JSON.stringify({
            active: true,
            merchantId: "M-123",
            login: "greenmarket-01",
            expiresAt: "2025-06-30T00:00:00.000Z",
            lastSeenAt: "2025-01-01T00:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/loyalty/cashier/session") && method === "POST") {
        calls.push({ url, method, body });
        return new Response(
          JSON.stringify({
            ok: true,
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

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CashierPage } = await import("../src/app/page");
    render(React.createElement(CashierPage));

    await screen.findByText("Вход сотрудника");

    fireEvent.pointerDown(screen.getByRole("button", { name: "1" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "2" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "3" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "4" }));

    await screen.findByText("Терминал лояльности");

    assert.deepEqual(calls, [
      {
        url: "/loyalty/cashier/session",
        method: "POST",
        body: { merchantLogin: "greenmarket-01", pinCode: "1234", rememberPin: false },
      },
    ]);
  });
});
