import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

const originalFetch = global.fetch;

describe("login page", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;
  beforeEach(() => {
    fetchMock = undefined;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
  });

  it("показывает ошибку при неверных данных", async () => {
    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/session/login") && method === "POST") {
        return new Response("Неверный email или пароль", { status: 401 });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PortalLoginPage } = await import("../app/login/page");
    render(
      React.createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams("") },
        React.createElement(PortalLoginPage),
      ),
    );

    fireEvent.change(await screen.findByPlaceholderText("name@company.com"), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "password" } });
    fireEvent.click(screen.getByText("Войти"));

    await screen.findByText("Неверный email или пароль");
  });

  it("запрашивает 2FA и отправляет код повторно", async () => {
    const calls: Array<{ url: string; body: any }> = [];

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/session/login") && method === "POST") {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ url, body });
        if (calls.length === 1) {
          return new Response("TOTP required", { status: 401 });
        }
        return new Response("Неверный код", { status: 401 });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PortalLoginPage } = await import("../app/login/page");
    render(
      React.createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams("redirect=/dashboard") },
        React.createElement(PortalLoginPage),
      ),
    );

    fireEvent.change(await screen.findByPlaceholderText("name@company.com"), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "password" } });
    fireEvent.click(screen.getByText("Войти"));

    await screen.findByText("Требуется код из аутентификатора");
    await screen.findByText("Код 2FA");

    fireEvent.change(screen.getByPlaceholderText("123456"), { target: { value: "654321" } });
    fireEvent.click(screen.getByText("Войти"));

    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.code, "654321");
  });
});
