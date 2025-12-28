import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const originalFetch = global.fetch;

describe("points promotions page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;

  beforeEach(() => {
    fetchMock = undefined;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
  });

  it("отображает карточку акции и реальные метрики", async () => {
    const audiencesPayload = [{ id: "all", name: "Все клиенты", isSystem: true, systemKey: "all-customers" }];
    const promotionsPayload = [
      {
        id: "p1",
        name: "Приветственные 500 бонусов",
        status: "ACTIVE",
        startAt: "2024-01-02T00:00:00.000Z",
        endAt: null,
        segmentId: null,
        rewardType: "POINTS",
        rewardValue: 500,
        rewardMetadata: { pointsExpire: true, pointsExpireAfterEnd: true },
        metrics: { revenueGenerated: 1067, pointsRedeemed: 100 },
        pushOnStart: true,
        pushReminderEnabled: false,
        metadata: {
          pushMessage: "Мы запустили акцию {name}!",
          pushReminderMessage: "",
        },
      },
    ];

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/loyalty/promotions") && method === "GET") {
        return new Response(JSON.stringify(promotionsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PointsPromotionsPage } = await import("../app/loyalty/actions-earn/page");
    render(React.createElement(PointsPromotionsPage));

    await screen.findByText("Акции с начислением баллов");
    await screen.findByText("Приветственные 500 бонусов");
    await screen.findByText(/Бессрочно/);
    await screen.findByText("Сгораемые");
    await screen.findByText("PUSH");

    const rubles = await screen.findAllByText((text) => text.includes("₽"));
    assert.ok(rubles.length >= 3);
  });

  it("для акций без startDate показывает дату создания вместо тире", async () => {
    const audiencesPayload = [{ id: "all", name: "Все клиенты", isSystem: true, systemKey: "all-customers" }];
    const createdAt = "2024-03-05T12:00:00.000Z";
    const promotionsPayload = [
      {
        id: "p2",
        name: "Акция стартует сразу",
        status: "ACTIVE",
        startAt: null,
        endAt: null,
        createdAt,
        segmentId: null,
        rewardType: "POINTS",
        rewardValue: 10,
        rewardMetadata: { pointsExpire: false },
        metrics: { revenueGenerated: 0, pointsRedeemed: 0 },
      },
    ];

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/loyalty/promotions") && method === "GET") {
        return new Response(JSON.stringify(promotionsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PointsPromotionsPage } = await import("../app/loyalty/actions-earn/page");
    render(React.createElement(PointsPromotionsPage));

    await screen.findByText("Акции с начислением баллов");
    await screen.findByText("Акция стартует сразу");

    const expected = new Date(createdAt).toLocaleDateString("ru-RU");
    await screen.findByText((text) => text.includes(expected));
    assert.equal(screen.queryByText("—"), null);
  });

  it("создаёт новую акцию и отправляет корректный payload", async () => {
    const audiencesPayload = [{ id: "all", name: "Все клиенты", isSystem: true, systemKey: "all-customers" }];
    const initialPromotions: any[] = [];
    const createdPromotion = {
      id: "p_new",
      name: "Бонусы за регистрацию",
      status: "DRAFT",
      startAt: "2024-01-02T00:00:00.000Z",
      endAt: null,
      segmentId: null,
      rewardType: "POINTS",
      rewardValue: 100,
      rewardMetadata: { pointsExpire: false },
      metrics: { revenueGenerated: 0, pointsRedeemed: 0 },
    };

    let lastPost: any = null;

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
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

    const { default: PointsPromotionsPage } = await import("../app/loyalty/actions-earn/page");
    render(React.createElement(PointsPromotionsPage));

    await screen.findByText("Акции с начислением баллов");
    fireEvent.click(screen.getByText("Создать акцию"));

    await screen.findByText("Создание акции");
    fireEvent.change(screen.getByPlaceholderText("Например: Бонусы за регистрацию"), { target: { value: "Бонусы за регистрацию" } });
    fireEvent.click(screen.getByText("Сохранить"));

    await screen.findByText("Бонусы за регистрацию");
    assert.ok(lastPost);
    assert.equal(lastPost.name, "Бонусы за регистрацию");
    assert.equal(lastPost.status, "DRAFT");
    assert.equal(lastPost.rewardType, "POINTS");
    assert.ok(Number(lastPost.rewardValue) > 0);
  });

  it("удаляет акцию через DELETE", async () => {
    const audiencesPayload = [{ id: "all", name: "Все клиенты", isSystem: true, systemKey: "all-customers" }];
    const promotionsPayload = [
      {
        id: "p1",
        name: "Приветственные 500 бонусов",
        status: "ACTIVE",
        startAt: "2024-01-02T00:00:00.000Z",
        endAt: null,
        segmentId: null,
        rewardType: "POINTS",
        rewardValue: 500,
        rewardMetadata: { pointsExpire: false },
        metrics: { revenueGenerated: 0, pointsRedeemed: 0 },
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
      if (url.endsWith("/api/portal/loyalty/promotions") && method === "GET") {
        return new Response(JSON.stringify(deleted ? [] : promotionsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/loyalty/promotions/p1") && method === "DELETE") {
        deleted = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PointsPromotionsPage } = await import("../app/loyalty/actions-earn/page");
    render(React.createElement(PointsPromotionsPage));

    await screen.findByText("Приветственные 500 бонусов");
    fireEvent.click(screen.getByTitle("Удалить"));

    await screen.findByText("Здесь пока ничего нет");
    assert.equal(deleted, true);
  });
});
