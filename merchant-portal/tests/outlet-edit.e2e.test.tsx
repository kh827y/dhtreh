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

const renderWithRouter = (ui: React.ReactElement, params: Record<string, string>) =>
  render(
    <AppRouterContext.Provider value={routerStub}>
      <PathParamsContext.Provider value={params}>{ui}</PathParamsContext.Provider>
    </AppRouterContext.Provider>,
  );

describe("outlet edit page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;

  beforeEach(() => {
    fetchMock = undefined;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
  });

  it("loads outlet, staff, and saves changes", async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.endsWith("/api/portal/outlets/o1") && method === "GET") {
        return new Response(
          JSON.stringify({
            id: "o1",
            name: "Флагман",
            works: true,
            reviewsShareLinks: { yandex: "", twogis: "", google: "" },
            devices: [{ id: "d1", code: "POS-01" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/api/portal/staff") && method === "GET") {
        return new Response(
          JSON.stringify({ items: [{ id: "s1", firstName: "Анна", lastName: "Иванова" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/portal/outlets/o1") && method === "PUT") {
        calls.push({ url, method, body });
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: EditOutletPage } = await import("../app/outlets/[id]/page");
    renderWithRouter(React.createElement(EditOutletPage), { id: "o1" });

    await screen.findByText("Редактирование точки");
    await screen.findByText("Анна Иванова");

    fireEvent.change(screen.getByPlaceholderText("Например: Магазин на Ленина"), { target: { value: "Новая точка" } });
    fireEvent.change(screen.getByPlaceholderText("Внешний ID (напр. POS-05)"), { target: { value: "POS-02" } });
    fireEvent.click(screen.getByLabelText("Добавить устройство"));
    fireEvent.click(screen.getByText("Сохранить"));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.name, "Новая точка");
    assert.equal(calls[0].body.devices.length, 2);
  });

  it("blocks save when review link is invalid", async () => {
    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/outlets/o1") && method === "GET") {
        return new Response(
          JSON.stringify({
            id: "o1",
            name: "Флагман",
            works: true,
            reviewsShareLinks: { yandex: "", twogis: "", google: "" },
            devices: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/api/portal/staff") && method === "GET") {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "PUT") {
        throw new Error("Unexpected save");
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: EditOutletPage } = await import("../app/outlets/[id]/page");
    renderWithRouter(React.createElement(EditOutletPage), { id: "o1" });

    await screen.findByText("Редактирование точки");
    fireEvent.change(screen.getByPlaceholderText("https://yandex.ru/maps/..."), { target: { value: "bad-link" } });
    fireEvent.click(screen.getByText("Сохранить"));

    await screen.findByText("Некорректная ссылка для отзывов: Яндекс");
  });
});
