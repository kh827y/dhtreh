import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const originalFetch = global.fetch;

describe("product promotions page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;

  beforeEach(() => {
    fetchMock = undefined;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
  });

  it("отображает карточку акции с товарами и метрики", async () => {
    const audiencesPayload = [
      { id: "all", name: "Все клиенты", isSystem: true, systemKey: "all-customers", _count: { customers: 10 } },
    ];
    const categoriesPayload = [{ id: "c1", name: "Кофе" }];
    const productsPayload = { items: [{ id: "p1", name: "Капучино", categoryId: "c1" }] };
    const promotionsPayload = [
      {
        id: "promo-1",
        name: "3 пиццы по цене 2х",
        status: "ACTIVE",
        startAt: "2024-01-02T00:00:00.000Z",
        endAt: null,
        rewardType: "DISCOUNT",
        rewardValue: 0,
        rewardMetadata: { kind: "NTH_FREE", buyQty: 2, freeQty: 1, productIds: ["p1"] },
        metrics: { revenueGenerated: 10000, pointsRedeemed: 2000, participantsCount: 12 },
      },
    ];

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/catalog/categories") && method === "GET") {
        return new Response(JSON.stringify(categoriesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/catalog/products") && method === "GET") {
        return new Response(JSON.stringify(productsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/loyalty/promotions") && method === "GET") {
        return new Response(JSON.stringify(promotionsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PromotionsPage } = await import("../app/loyalty/actions/page");
    render(React.createElement(PromotionsPage));

    await screen.findByText("Акции с товарами");
    await screen.findByText("3 пиццы по цене 2х");
    await screen.findByText("+400%");

    const rubles = await screen.findAllByText((text) => text.includes("₽"));
    assert.ok(rubles.length >= 2);
  });

  it("создаёт акцию с акционными баллами и отправляет корректный payload", async () => {
    const audiencesPayload = [
      { id: "all", name: "Все клиенты", isSystem: true, systemKey: "all-customers", _count: { customers: 10 } },
      { id: "seg-1", name: "VIP", _count: { customers: 5 } },
    ];
    const categoriesPayload = [{ id: "c1", name: "Кофе" }];
    const productsPayload = { items: [{ id: "p1", name: "Капучино", categoryId: "c1" }] };
    const initialPromotions: any[] = [];
    const createdPromotion = {
      id: "promo-new",
      name: "Акционные баллы на кофе",
      status: "DRAFT",
      startAt: "2024-01-02T00:00:00.000Z",
      endAt: null,
      rewardType: "POINTS",
      rewardValue: 0,
      rewardMetadata: { productIds: ["p1"], pointsRuleType: "multiplier", pointsValue: 3 },
      metrics: { revenueGenerated: 0, pointsRedeemed: 0, participantsCount: 0 },
    };

    let lastPost: any = null;

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/catalog/categories") && method === "GET") {
        return new Response(JSON.stringify(categoriesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/catalog/products") && method === "GET") {
        return new Response(JSON.stringify(productsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/loyalty/promotions") && method === "GET") {
        return new Response(JSON.stringify(lastPost ? [createdPromotion] : initialPromotions), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/portal/loyalty/promotions") && method === "POST") {
        lastPost = JSON.parse(String(init?.body || "{}"));
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PromotionsPage } = await import("../app/loyalty/actions/page");
    render(React.createElement(PromotionsPage));

    await screen.findByText("Акции с товарами");
    fireEvent.click(screen.getByText("Создать акцию"));
    fireEvent.click(screen.getByText("Акционные баллы на товары"));

    await screen.findByText("Создание акции");
    fireEvent.change(screen.getByPlaceholderText("Например: Двойные баллы на утренний кофе"), {
      target: { value: "Акционные баллы на кофе" },
    });
    fireEvent.change(screen.getByDisplayValue("Все клиенты"), { target: { value: "seg-1" } });
    fireEvent.change(screen.getByDisplayValue("Без ограничений"), { target: { value: "once_per_day" } });
    fireEvent.click(screen.getByLabelText("Начать сразу после создания"));
    const [startDateInput, endDateInput] = Array.from(
      document.querySelectorAll('input[type="date"]'),
    ) as HTMLInputElement[];
    fireEvent.change(startDateInput, { target: { value: "2024-02-10" } });
    fireEvent.change(endDateInput, { target: { value: "2024-03-01" } });
    fireEvent.click(screen.getByText("Капучино"));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Сохранить"));

    await screen.findByText("Акционные баллы на кофе");
    assert.ok(lastPost);
    assert.equal(lastPost.name, "Акционные баллы на кофе");
    assert.equal(lastPost.status, "DRAFT");
    assert.equal(lastPost.rewardType, "POINTS");
    assert.equal(lastPost.segmentId, "seg-1");
    assert.equal(lastPost.metadata?.usageLimit, "once_per_day");
    assert.equal(new Date(lastPost.startAt).toLocaleDateString("en-CA"), "2024-02-10");
    assert.equal(new Date(lastPost.endAt).toLocaleDateString("en-CA"), "2024-03-01");
    assert.equal(lastPost.rewardValue, 0);
    assert.deepEqual(lastPost.rewardMetadata?.productIds, ["p1"]);
    assert.equal(lastPost.rewardMetadata?.pointsRuleType, "multiplier");
    assert.equal(Number(lastPost.rewardMetadata?.pointsValue), 3);
  });

  it("сохраняет выбранные товары и категории при переключении вкладок", async () => {
    const audiencesPayload = [
      { id: "all", name: "Все клиенты", isSystem: true, systemKey: "all-customers", _count: { customers: 10 } },
    ];
    const categoriesPayload = [
      { id: "c1", name: "Кофе" },
      { id: "c2", name: "Десерты" },
    ];
    const productsPayload = { items: [{ id: "p1", name: "Капучино", categoryId: "c1" }] };
    const promotionsPayload: any[] = [];

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/catalog/categories") && method === "GET") {
        return new Response(JSON.stringify(categoriesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/catalog/products") && method === "GET") {
        return new Response(JSON.stringify(productsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/loyalty/promotions") && method === "GET") {
        return new Response(JSON.stringify(promotionsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PromotionsPage } = await import("../app/loyalty/actions/page");
    render(React.createElement(PromotionsPage));

    await screen.findByText("Акции с товарами");
    fireEvent.click(screen.getByText("Создать акцию"));
    fireEvent.click(screen.getByText("Акционные баллы на товары"));

    await screen.findByText("Создание акции");
    fireEvent.click(screen.getByText("Капучино"));
    await screen.findByText("Выбрано: 1");

    fireEvent.click(screen.getByRole("button", { name: "Категории" }));
    await screen.findByText("Выбрано: 0");
    fireEvent.click(screen.getByText("Десерты"));
    await screen.findByText("Выбрано: 1");

    fireEvent.click(screen.getByRole("button", { name: "Товары" }));
    await screen.findByText("Выбрано: 1");
    fireEvent.click(screen.getByText("Капучино"));
    await screen.findByText("Выбрано: 0");
  });

  it("удаляет акцию через DELETE", async () => {
    const audiencesPayload = [
      { id: "all", name: "Все клиенты", isSystem: true, systemKey: "all-customers", _count: { customers: 10 } },
    ];
    const categoriesPayload = [{ id: "c1", name: "Кофе" }];
    const productsPayload = { items: [{ id: "p1", name: "Капучино", categoryId: "c1" }] };
    const promotionsPayload = [
      {
        id: "promo-1",
        name: "2+1 на кофе",
        status: "ACTIVE",
        startAt: "2024-01-02T00:00:00.000Z",
        endAt: null,
        rewardType: "DISCOUNT",
        rewardValue: 0,
        rewardMetadata: { kind: "NTH_FREE", buyQty: 2, freeQty: 1, productIds: ["p1"] },
        metrics: { revenueGenerated: 0, pointsRedeemed: 0, participantsCount: 0 },
      },
    ];

    let deleted = false;
    (globalThis as any).window.confirm = () => true;

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/catalog/categories") && method === "GET") {
        return new Response(JSON.stringify(categoriesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/catalog/products") && method === "GET") {
        return new Response(JSON.stringify(productsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/loyalty/promotions") && method === "GET") {
        return new Response(JSON.stringify(deleted ? [] : promotionsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/loyalty/promotions/promo-1") && method === "DELETE") {
        deleted = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PromotionsPage } = await import("../app/loyalty/actions/page");
    render(React.createElement(PromotionsPage));

    await screen.findByText("2+1 на кофе");
    fireEvent.click(screen.getByTitle("Удалить"));

    await screen.findByText("Здесь пока ничего нет");
    assert.equal(deleted, true);
  });
});
