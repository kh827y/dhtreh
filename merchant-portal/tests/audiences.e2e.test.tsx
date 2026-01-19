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

describe("audiences page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;
  let originalConfirm: typeof globalThis.confirm | undefined;

  beforeEach(() => {
    fetchMock = undefined;
    originalConfirm = globalThis.confirm;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
    if (originalConfirm) globalThis.confirm = originalConfirm;
  });

  it("показывает аудитории, фильтрует и блокирует системную", async () => {
    const audiencesPayload = [
      {
        id: "aud-all",
        name: "Все клиенты",
        isSystem: true,
        systemKey: "all-customers",
        customerCount: 1200,
        createdAt: "2024-01-10T00:00:00.000Z",
        description: "Системная аудитория",
      },
      {
        id: "aud-vip",
        name: "VIP",
        isSystem: false,
        systemKey: null,
        customerCount: 50,
        createdAt: "2024-02-10T00:00:00.000Z",
        description: "VIP клиенты",
      },
    ];

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: AudiencesPage } = await import("../src/app/audiences/page");
    renderWithRouter(React.createElement(AudiencesPage));

    await screen.findByText("Все клиенты");
    await screen.findByText("VIP");

    fireEvent.click(screen.getByTitle("Системную аудиторию нельзя редактировать"));
    await screen.findByText("Системную аудиторию нельзя редактировать");

    fireEvent.change(screen.getByPlaceholderText("Поиск аудитории..."), { target: { value: "VIP" } });
    assert.equal(screen.queryByText("Все клиенты"), null);
  });

  it("создает аудиторию и отправляет корректный payload", async () => {
    let audiencesPayload: any[] = [];
    let lastPost: any = null;

    const outletsPayload = { items: [{ id: "out-1", name: "Центральный магазин" }] };
    const productsPayload = {
      items: [{ id: "p1", name: "Капучино Классический", categoryId: "c1", categoryName: "Кофе" }],
    };
    const categoriesPayload = [{ id: "c1", name: "Кофе", status: "ACTIVE" }];
    const tiersPayload = { items: [{ id: "lvl-1", name: "Gold" }] };

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";

      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/portal/outlets?status=ACTIVE") && method === "GET") {
        return new Response(JSON.stringify(outletsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/catalog/products") && method === "GET") {
        return new Response(JSON.stringify(productsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/catalog/categories") && method === "GET") {
        return new Response(JSON.stringify(categoriesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/loyalty/tiers") && method === "GET") {
        return new Response(JSON.stringify(tiersPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/audiences") && method === "POST") {
        lastPost = JSON.parse(String(init?.body || "{}"));
        audiencesPayload = [
          {
            id: "aud-new",
            name: lastPost.name,
            description: lastPost.description,
            isSystem: false,
            systemKey: null,
            customerCount: 1,
            createdAt: "2024-03-01T00:00:00.000Z",
            filters: lastPost.filters,
          },
        ];
        return new Response(JSON.stringify(audiencesPayload[0]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: AudiencesPage } = await import("../src/app/audiences/page");
    renderWithRouter(React.createElement(AudiencesPage));

    await screen.findByText("Аудитории");
    fireEvent.click(screen.getByText("Создать аудиторию"));

    await screen.findByText("Новая аудитория");
    fireEvent.change(screen.getByPlaceholderText("Например: Покупатели кофе"), { target: { value: "Покупатели кофе" } });

    await screen.findByText("Центральный магазин");
    fireEvent.click(screen.getByText("Центральный магазин"));

    await screen.findByText("Капучино Классический");
    fireEvent.click(screen.getByText("Капучино Классический"));

    const genderSelect = screen.getByRole("combobox");
    fireEvent.change(genderSelect, { target: { value: "M" } });

    fireEvent.click(screen.getByText("Сохранить"));

    await screen.findByText("Покупатели кофе");

    assert.ok(lastPost);
    assert.equal(lastPost.name, "Покупатели кофе");
    assert.deepEqual(lastPost.filters.outlets, ["out-1"]);
    assert.deepEqual(lastPost.filters.productIds, ["p1"]);
    assert.deepEqual(lastPost.filters.gender, ["male"]);
    assert.equal(typeof lastPost.description, "string");
  });

  it("создает аудиторию по категориям и отправляет categoryIds", async () => {
    let audiencesPayload: any[] = [];
    let lastPost: any = null;

    const outletsPayload = { items: [] };
    const productsPayload = {
      items: [{ id: "p1", name: "Латте", categoryId: "c1", categoryName: "Кофе" }],
    };
    const categoriesPayload = [{ id: "c1", name: "Кофе", status: "ACTIVE" }];
    const tiersPayload = { items: [] };

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";

      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/portal/outlets?status=ACTIVE") && method === "GET") {
        return new Response(JSON.stringify(outletsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/catalog/products") && method === "GET") {
        return new Response(JSON.stringify(productsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/catalog/categories") && method === "GET") {
        return new Response(JSON.stringify(categoriesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/loyalty/tiers") && method === "GET") {
        return new Response(JSON.stringify(tiersPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/audiences") && method === "POST") {
        lastPost = JSON.parse(String(init?.body || "{}"));
        audiencesPayload = [
          {
            id: "aud-new",
            name: lastPost.name,
            description: lastPost.description,
            isSystem: false,
            systemKey: null,
            customerCount: 1,
            createdAt: "2024-03-01T00:00:00.000Z",
            filters: lastPost.filters,
          },
        ];
        return new Response(JSON.stringify(audiencesPayload[0]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: AudiencesPage } = await import("../src/app/audiences/page");
    renderWithRouter(React.createElement(AudiencesPage));

    await screen.findByText("Аудитории");
    fireEvent.click(screen.getByText("Создать аудиторию"));

    await screen.findByText("Новая аудитория");
    fireEvent.change(screen.getByPlaceholderText("Например: Покупатели кофе"), { target: { value: "Покупатели кофе (категории)" } });

    fireEvent.click(screen.getByText("Категории"));

    await screen.findByText("Кофе");
    fireEvent.click(screen.getByText("Кофе"));

    fireEvent.click(screen.getByText("Сохранить"));

    await screen.findByText("Покупатели кофе (категории)");

    assert.ok(lastPost);
    assert.deepEqual(lastPost.filters.categoryIds, ["c1"]);
    assert.equal(lastPost.filters.productIds, undefined);
  });

  it("открывает состав аудитории и загружает участников", async () => {
    const audiencesPayload = [
      {
        id: "aud-1",
        name: "VIP",
        isSystem: false,
        systemKey: null,
        customerCount: 2,
        createdAt: "2024-01-10T00:00:00.000Z",
        description: "VIP клиенты",
      },
    ];
    const outletsPayload = { items: [] };
    const productsPayload = { items: [] };
    const categoriesPayload: any[] = [];
    const tiersPayload = { items: [{ id: "lvl-base", name: "Base", thresholdAmount: 0, isInitial: true }] };

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/outlets?status=ACTIVE") && method === "GET") {
        return new Response(JSON.stringify(outletsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/catalog/products") && method === "GET") {
        return new Response(JSON.stringify(productsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/catalog/categories") && method === "GET") {
        return new Response(JSON.stringify(categoriesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/loyalty/tiers") && method === "GET") {
        return new Response(JSON.stringify(tiersPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.startsWith("/api/customers?") && method === "GET") {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "c1",
                name: "Иван Петров",
                phone: "+79990000001",
                spendTotal: 12000,
                daysSinceLastVisit: 5,
                levelName: "Base",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: AudiencesPage } = await import("../src/app/audiences/page");
    renderWithRouter(React.createElement(AudiencesPage));

    await screen.findByText("VIP");

    fireEvent.click(screen.getByTitle("Просмотр состава"));

    await screen.findByText("Иван Петров");
  });

  it("редактирует аудиторию и отправляет PUT", async () => {
    const audiencesPayload = [
      {
        id: "aud-2",
        name: "Любители кофе",
        isSystem: false,
        systemKey: null,
        customerCount: 10,
        createdAt: "2024-02-10T00:00:00.000Z",
        description: "Кофейные клиенты",
        filters: { gender: ["female"], age: { min: 18, max: 35 } },
      },
    ];
    const outletsPayload = { items: [] };
    const productsPayload = { items: [] };
    const categoriesPayload = [];
    const tiersPayload = { items: [] };
    let lastPut: any = null;

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/outlets?status=ACTIVE") && method === "GET") {
        return new Response(JSON.stringify(outletsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/catalog/products") && method === "GET") {
        return new Response(JSON.stringify(productsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/catalog/categories") && method === "GET") {
        return new Response(JSON.stringify(categoriesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/loyalty/tiers") && method === "GET") {
        return new Response(JSON.stringify(tiersPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/audiences/aud-2") && method === "PUT") {
        lastPut = JSON.parse(String(init?.body || "{}"));
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: AudiencesPage } = await import("../src/app/audiences/page");
    renderWithRouter(React.createElement(AudiencesPage));

    await screen.findByText("Любители кофе");
    fireEvent.click(screen.getByTitle("Редактировать"));

    await screen.findByText("Редактирование аудитории");
    const nameInput = screen.getByDisplayValue("Любители кофе");
    fireEvent.change(nameInput, { target: { value: "Новые любители кофе" } });

    const genderSelect = screen.getByRole("combobox");
    assert.equal((genderSelect as HTMLSelectElement).value, "F");

    fireEvent.click(screen.getByText("Сохранить"));

    await screen.findByText("Аудитории");

    assert.ok(lastPut);
    assert.equal(lastPut.name, "Новые любители кофе");
    assert.deepEqual(lastPut.filters.gender, ["female"]);
  });
});
