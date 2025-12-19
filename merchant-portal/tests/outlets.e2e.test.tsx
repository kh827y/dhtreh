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

describe("outlets page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;
  let originalConfirm: typeof globalThis.confirm | undefined;

  beforeEach(() => {
    fetchMock = undefined;
    originalConfirm = globalThis.confirm;
    globalThis.confirm = () => true;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
    if (originalConfirm) globalThis.confirm = originalConfirm;
  });

  it("renders outlets and deletes item", async () => {
    let activeItems = [
      {
        id: "o1",
        name: "Флагман",
        works: true,
        staffCount: 2,
        devices: [{ id: "d1", code: "POS-01" }],
        reviewsShareLinks: { yandex: "https://yandex.ru/maps" },
      },
    ];
    const inactiveItems = [
      {
        id: "o2",
        name: "Сезонная",
        works: false,
        staffCount: 0,
        devices: [],
        reviewsShareLinks: {},
      },
    ];

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.startsWith("/api/portal/outlets?status=ACTIVE") && method === "GET") {
        return new Response(JSON.stringify({ items: activeItems, total: activeItems.length }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/portal/outlets?status=INACTIVE") && method === "GET") {
        return new Response(JSON.stringify({ items: inactiveItems, total: inactiveItems.length }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/portal/outlets/o1") && method === "DELETE") {
        activeItems = [];
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: OutletsPage } = await import("../app/outlets/page");
    renderWithRouter(React.createElement(OutletsPage));

    await screen.findByText("Торговые точки");
    await screen.findByText("Флагман");
    await screen.findByText("2");

    fireEvent.click(screen.getByLabelText("Удалить"));

    await screen.findByText("Нет торговых точек в этом разделе.");
    assert.equal(activeItems.length, 0);
  });
});
