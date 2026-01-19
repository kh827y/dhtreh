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

describe("products page (new design)", () => {
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

  it("renders products and deletes item", async () => {
    let products = [
      {
        id: "p1",
        name: "Капучино 0.3",
        categoryId: "c1",
        externalId: "COF-001",
        accruePoints: true,
        allowRedeem: true,
        redeemPercent: 25,
      },
    ];
    const categories = [{ id: "c1", name: "Кофе" }];

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.startsWith("/api/portal/catalog/categories") && method === "GET") {
        return new Response(JSON.stringify(categories), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/portal/catalog/products") && method === "GET") {
        return new Response(JSON.stringify({ items: products, total: products.length }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/portal/catalog/products/p1") && method === "DELETE") {
        products = [];
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: ProductsPage } = await import("../src/app/products/page");
    renderWithRouter(React.createElement(ProductsPage));

    await screen.findByText("Товары");
    await screen.findByText("Капучино 0.3");
    await screen.findByText("до 25%");

    fireEvent.click(screen.getByLabelText("Удалить"));

    await screen.findByText("Товары не найдены.");
    assert.equal(products.length, 0);
  });

  it("creates product with disabled point payment", async () => {
    let createPayload: any = null;
    const categories = [{ id: "c1", name: "Кофе" }];
    let products: any[] = [];

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.startsWith("/api/portal/catalog/categories") && method === "GET") {
        return new Response(JSON.stringify(categories), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/portal/catalog/products") && method === "GET") {
        return new Response(JSON.stringify({ items: products, total: products.length }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/portal/catalog/products") && method === "POST") {
        createPayload = JSON.parse(init?.body || "{}");
        const created = {
          id: "p-new",
          name: createPayload.name,
          categoryId: createPayload.categoryId,
          externalId: createPayload.externalId,
          accruePoints: createPayload.accruePoints,
          allowRedeem: createPayload.allowRedeem,
          redeemPercent: createPayload.redeemPercent,
        };
        products = [created];
        return new Response(JSON.stringify(created), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: ProductsPage } = await import("../src/app/products/page");
    renderWithRouter(React.createElement(ProductsPage));

    await screen.findByText("Товары");

    fireEvent.click(screen.getByText("Добавить товар"));

    await screen.findByText("Новый товар");

    fireEvent.change(screen.getByPlaceholderText("Например: Капучино 0.3"), {
      target: { value: "Эспрессо" },
    });
    fireEvent.change(screen.getByDisplayValue("Выберите категорию"), {
      target: { value: "c1" },
    });
    fireEvent.click(screen.getByLabelText("Разрешить оплату баллами"));

    fireEvent.click(screen.getByText("Сохранить"));

    await screen.findByText("Товары");
    await screen.findByText("Эспрессо");

    assert.equal(createPayload.allowRedeem, false);
    assert.equal(createPayload.redeemPercent, 0);
  });
});
