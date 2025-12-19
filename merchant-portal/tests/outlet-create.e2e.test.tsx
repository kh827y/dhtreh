import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

const originalFetch = global.fetch;

const routerStub = {
  back: () => {},
  forward: () => {},
  prefetch: async () => {},
  push: () => {},
  refresh: () => {},
  replace: () => {},
};

const renderWithRouter = (ui: React.ReactElement) =>
  render(
    <AppRouterContext.Provider value={routerStub}>
      <PathParamsContext.Provider value={null}>{ui}</PathParamsContext.Provider>
    </AppRouterContext.Provider>,
  );

describe("outlet create page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;

  beforeEach(() => {
    fetchMock = undefined;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
  });

  it("creates outlet with devices", async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];
    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (url.endsWith("/api/portal/outlets") && method === "POST") {
        calls.push({ url, method, body });
        return new Response(JSON.stringify({ id: "o1" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CreateOutletPage } = await import("../app/outlets/new/page");
    renderWithRouter(React.createElement(CreateOutletPage));

    fireEvent.change(screen.getByPlaceholderText("Например: Магазин на Ленина"), { target: { value: "Флагман" } });
    fireEvent.change(screen.getByPlaceholderText("Внешний ID (напр. POS-05)"), { target: { value: "POS-01" } });
    fireEvent.click(screen.getByLabelText("Добавить устройство"));

    fireEvent.click(screen.getByText("Сохранить"));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.name, "Флагман");
    assert.equal(calls[0].body.devices.length, 1);
    assert.equal(calls[0].body.devices[0].code, "POS-01");
  });

  it("blocks save when review link is invalid", async () => {
    fetchMock = mock.method(global, "fetch", async () => {
      throw new Error("Unexpected fetch");
    });

    const { default: CreateOutletPage } = await import("../app/outlets/new/page");
    renderWithRouter(React.createElement(CreateOutletPage));

    fireEvent.change(screen.getByPlaceholderText("Например: Магазин на Ленина"), { target: { value: "Флагман" } });
    fireEvent.change(screen.getByPlaceholderText("https://yandex.ru/maps/..."), { target: { value: "not-a-url" } });
    fireEvent.click(screen.getByText("Сохранить"));

    await screen.findByText("Некорректная ссылка для отзывов: Яндекс");
  });
});
