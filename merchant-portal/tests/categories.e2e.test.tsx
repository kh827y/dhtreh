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

describe("categories page (new design)", () => {
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

  it("creates category and links product", async () => {
    let categories: any[] = [];
    let products = [{ id: "p1", name: "Капучино 0.3", categoryId: null }];
    let createPayload: any = null;

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
      if (url.startsWith("/api/portal/catalog/categories") && method === "POST") {
        createPayload = JSON.parse(init?.body || "{}");
        const created = {
          id: "c-new",
          name: createPayload.name,
          description: createPayload.description,
          parentId: createPayload.parentId,
          status: createPayload.status,
        };
        categories = [created];
        if (Array.isArray(createPayload.assignProductIds)) {
          products = products.map((prod) =>
            createPayload.assignProductIds.includes(prod.id) ? { ...prod, categoryId: created.id } : prod,
          );
        }
        return new Response(JSON.stringify(created), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CategoriesPage } = await import("../src/app/categories/page");
    renderWithRouter(React.createElement(CategoriesPage));

    await screen.findByText("Категории товаров");

    fireEvent.click(screen.getByText("Создать категорию"));

    await screen.findByText("Новая категория");

    fireEvent.change(screen.getByPlaceholderText("Например: Десерты"), {
      target: { value: "Напитки" },
    });
    fireEvent.click(screen.getByLabelText("Статус категории"));

    fireEvent.click(screen.getByLabelText("Добавить в категорию"));

    fireEvent.click(screen.getByText("Сохранить"));

    await screen.findByText("Категории товаров");
    await screen.findByText("Напитки");
    await screen.findByText("Архив");

    assert.equal(createPayload.status, "ARCHIVED");
    assert.deepEqual(createPayload.assignProductIds, ["p1"]);
  });
});
