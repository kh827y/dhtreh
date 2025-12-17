import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const originalFetch = global.fetch;

describe("promocodes page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;

  beforeEach(() => {
    fetchMock = undefined;
    (globalThis as any).alert = () => {};
    (globalThis as any).confirm = () => true;
    (globalThis as any).window.alert = () => {};
    (globalThis as any).window.confirm = () => true;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
  });

  it("отображает промокоды, корректно считает вкладки и форматирует даты", async () => {
    const tiersPayload = [
      { id: "silver", name: "Silver" },
      { id: "gold", name: "Gold" },
      { id: "platinum", name: "Platinum" },
    ];

    const promocodesPayload = {
      items: [
        {
          id: "p1",
          code: "WELCOME2024",
          description: "Приветственный бонус для новых участников программы.",
          value: 500,
          status: "ACTIVE",
          validFrom: "2024-01-01T00:00:00.000Z",
          validUntil: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          totalUsed: 12,
          usageLimitType: "UNLIMITED",
          usageLimitValue: null,
          perCustomerLimit: 1,
          cooldownDays: null,
          requireVisit: false,
          assignTierId: null,
          pointsExpireInDays: 30,
          metadata: {},
        },
        {
          id: "p2",
          code: "VIP_UPGRADE",
          description: "Мгновенное присвоение Золотого статуса и начисление бонусов.",
          value: 1000,
          status: "ARCHIVED",
          validFrom: null,
          validUntil: "2024-12-31T00:00:00.000Z",
          createdAt: "2024-12-01T00:00:00.000Z",
          totalUsed: 42,
          usageLimitType: "ONCE_TOTAL",
          usageLimitValue: 100,
          perCustomerLimit: 1,
          cooldownDays: 0,
          requireVisit: true,
          assignTierId: "gold",
          pointsExpireInDays: null,
          metadata: {},
        },
      ],
    };

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/loyalty/tiers") && method === "GET") {
        return new Response(JSON.stringify(tiersPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/portal/promocodes?") && method === "GET") {
        return new Response(JSON.stringify(promocodesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PromocodesPage } = await import("../app/promocodes/page");
    render(React.createElement(PromocodesPage));

    await screen.findByText("Промокоды");
    await screen.findByText("WELCOME2024");
    await screen.findByTitle("Сгорают через 30 дней");

    fireEvent.click(screen.getByText("Архивные"));
    await screen.findByText("VIP_UPGRADE");
    await screen.findByText("Gold");
    await screen.findByText("из 100");

    const expectedStart = new Date("2024-12-01T00:00:00.000Z").toLocaleDateString("ru-RU");
    const expectedEnd = new Date("2024-12-31T00:00:00.000Z").toLocaleDateString("ru-RU");
    await screen.findByText((text) => text.includes(expectedStart) && text.includes(expectedEnd));
  });

  it("копирует промокод через clipboard", async () => {
    const tiersPayload = [{ id: "silver", name: "Silver" }];
    const promocodesPayload = { items: [{ id: "p1", code: "WELCOME2024", description: "d", value: 100, status: "ACTIVE" }] };

    const writeText = mock.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/loyalty/tiers") && method === "GET") {
        return new Response(JSON.stringify(tiersPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/portal/promocodes?") && method === "GET") {
        return new Response(JSON.stringify(promocodesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PromocodesPage } = await import("../app/promocodes/page");
    render(React.createElement(PromocodesPage));

    await screen.findByText("WELCOME2024");
    fireEvent.click(screen.getByTitle("Копировать"));

    assert.equal(writeText.mock.calls.length, 1);
    assert.equal(writeText.mock.calls[0].arguments[0], "WELCOME2024");
  });

  it("создаёт новый промокод и отправляет корректный payload", async () => {
    const tiersPayload = [
      { id: "silver", name: "Silver" },
      { id: "gold", name: "Gold" },
    ];

    let created = false;
    let lastPost: any = null;

    const createdRow = {
      id: "p_new",
      code: "NEWCODE",
      description: "Описание",
      value: 250,
      status: "ACTIVE",
      validFrom: "2024-01-01T00:00:00.000Z",
      validUntil: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      totalUsed: 0,
      usageLimitType: "ONCE_TOTAL",
      usageLimitValue: 1000,
      perCustomerLimit: 3,
      cooldownDays: 7,
      requireVisit: true,
      assignTierId: "gold",
      pointsExpireInDays: 45,
      metadata: {},
    };

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/loyalty/tiers") && method === "GET") {
        return new Response(JSON.stringify(tiersPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/portal/promocodes?") && method === "GET") {
        return new Response(JSON.stringify({ items: created ? [createdRow] : [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/portal/promocodes/issue") && method === "POST") {
        lastPost = JSON.parse(String(init?.body || "{}"));
        created = true;
        return new Response(JSON.stringify({ ok: true, promoCodeId: "p_new" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PromocodesPage } = await import("../app/promocodes/page");
    render(React.createElement(PromocodesPage));

    await screen.findByText("Промокоды");
    const expectedStart = new Date().toISOString().split("T")[0];
    fireEvent.click(screen.getByText("Создать промокод"));
    await screen.findByText("Новый промокод");

    fireEvent.change(screen.getByPlaceholderText("CODE2024"), { target: { value: "newcode" } });
    fireEvent.change(screen.getByPlaceholderText("Для чего этот код..."), { target: { value: "Описание" } });

    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1]);

    const spinbuttons = screen.getAllByRole("spinbutton");
    fireEvent.change(spinbuttons[0], { target: { value: "250" } }); // points
    fireEvent.change(spinbuttons[1], { target: { value: "45" } }); // burn days

    const levelContainer = screen.getByText("Присвоить уровень").closest("div")?.parentElement;
    assert.ok(levelContainer);
    const levelCheckbox = levelContainer.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    assert.ok(levelCheckbox);
    fireEvent.click(levelCheckbox);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "gold" } });

    fireEvent.click(screen.getByLabelText(/Ограничить общее количество/));
    const spinbuttonsAfterLimit = screen.getAllByRole("spinbutton");
    fireEvent.change(spinbuttonsAfterLimit[2], { target: { value: "1000" } }); // total limit
    fireEvent.change(spinbuttonsAfterLimit[3], { target: { value: "3" } }); // per client

    fireEvent.click(screen.getByLabelText(/Период использования в днях/));
    const spinbuttonsAfterFrequency = screen.getAllByRole("spinbutton");
    fireEvent.change(spinbuttonsAfterFrequency[4], { target: { value: "7" } }); // frequency days

    fireEvent.click(screen.getByLabelText(/Активен только если был визит/));
    fireEvent.click(screen.getByLabelText("Бессрочно"));

    fireEvent.click(screen.getByText("Сохранить"));

    await screen.findByText("NEWCODE");
    assert.ok(lastPost);

    assert.equal(lastPost.code, "NEWCODE");
    assert.equal(lastPost.description, "Описание");
    assert.equal(lastPost.awardPoints, true);
    assert.equal(lastPost.points, 250);
    assert.equal(lastPost.burnEnabled, true);
    assert.equal(lastPost.burnDays, 45);
    assert.equal(lastPost.levelEnabled, true);
    assert.equal(lastPost.levelId, "gold");
    assert.equal(lastPost.usageLimit, "once_total");
    assert.equal(lastPost.usageLimitValue, 1000);
    assert.equal(lastPost.perCustomerLimit, 3);
    assert.equal(lastPost.usagePeriodEnabled, true);
    assert.equal(lastPost.usagePeriodDays, 7);
    assert.equal(lastPost.recentVisitEnabled, true);
    assert.equal(lastPost.validFrom, expectedStart);
    assert.equal("validUntil" in lastPost, false);
  });

  it("редактирует промокод и отправляет PUT", async () => {
    const tiersPayload = [{ id: "silver", name: "Silver" }];
    let updated = false;
    let lastPut: any = null;

    const baseRow = {
      id: "p1",
      code: "WELCOME2024",
      description: updated ? "Новая" : "Старая",
      value: 100,
      status: "ACTIVE",
      validFrom: "2024-01-01T00:00:00.000Z",
      validUntil: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      totalUsed: 0,
      usageLimitType: "UNLIMITED",
      usageLimitValue: null,
      perCustomerLimit: updated ? 2 : 1,
      cooldownDays: 0,
      requireVisit: false,
      assignTierId: null,
      pointsExpireInDays: null,
      metadata: {},
    };

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/loyalty/tiers") && method === "GET") {
        return new Response(JSON.stringify(tiersPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/portal/promocodes?") && method === "GET") {
        return new Response(JSON.stringify({ items: [baseRow] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/promocodes/p1") && method === "PUT") {
        lastPut = JSON.parse(String(init?.body || "{}"));
        updated = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PromocodesPage } = await import("../app/promocodes/page");
    render(React.createElement(PromocodesPage));

    await screen.findByText("WELCOME2024");
    fireEvent.click(screen.getByTitle("Редактировать"));
    await screen.findByText("Редактирование");

    fireEvent.change(screen.getByPlaceholderText("Для чего этот код..."), { target: { value: "Новая" } });
    const spinbuttons = screen.getAllByRole("spinbutton");
    fireEvent.change(spinbuttons[1], { target: { value: "2" } }); // per client
    fireEvent.click(screen.getByText("Сохранить"));

    await screen.findByText("WELCOME2024");
    assert.ok(lastPut);
    assert.equal(lastPut.description, "Новая");
    assert.equal(lastPut.perCustomerLimit, 2);
  });

  it("архивирует и восстанавливает промокод", async () => {
    const tiersPayload = [{ id: "silver", name: "Silver" }];
    let archived = false;

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/loyalty/tiers") && method === "GET") {
        return new Response(JSON.stringify(tiersPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/portal/promocodes?") && method === "GET") {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "p1",
                code: "WELCOME2024",
                description: "d",
                value: 100,
                status: archived ? "ARCHIVED" : "ACTIVE",
                validFrom: "2024-01-01T00:00:00.000Z",
                validUntil: null,
                createdAt: "2024-01-01T00:00:00.000Z",
                totalUsed: 0,
                usageLimitType: "UNLIMITED",
                usageLimitValue: null,
                perCustomerLimit: 1,
                cooldownDays: 0,
                requireVisit: false,
                assignTierId: null,
                pointsExpireInDays: null,
                metadata: {},
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/portal/promocodes/deactivate") && method === "POST") {
        archived = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/promocodes/activate") && method === "POST") {
        archived = false;
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PromocodesPage } = await import("../app/promocodes/page");
    render(React.createElement(PromocodesPage));

    await screen.findByText("WELCOME2024");
    fireEvent.click(screen.getByTitle("В архив"));
    await screen.findByText("Нет активных промокодов");

    fireEvent.click(screen.getByText("Архивные"));
    await screen.findByText("WELCOME2024");
    fireEvent.click(screen.getByTitle("Восстановить"));

    fireEvent.click(screen.getByText("Активные"));
    await screen.findByText("WELCOME2024");
  });

  it("при конфликте кода повторяет запрос с overwrite", async () => {
    const tiersPayload = [{ id: "silver", name: "Silver" }];
    const calls: any[] = [];
    let allowOverwrite = false;
    let created = false;

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/loyalty/tiers") && method === "GET") {
        return new Response(JSON.stringify(tiersPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/api/portal/promocodes?") && method === "GET") {
        return new Response(
          JSON.stringify({
            items: created
              ? [
                  {
                    id: "p1",
                    code: "DUPCODE",
                    description: "d",
                    value: 100,
                    status: "ACTIVE",
                    validFrom: null,
                    validUntil: null,
                    createdAt: "2024-01-01T00:00:00.000Z",
                    totalUsed: 0,
                    usageLimitType: "UNLIMITED",
                    usageLimitValue: null,
                    perCustomerLimit: 1,
                    cooldownDays: 0,
                    requireVisit: false,
                    assignTierId: null,
                    pointsExpireInDays: null,
                    metadata: {},
                  },
                ]
              : [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/portal/promocodes/issue") && method === "POST") {
        const body = JSON.parse(String(init?.body || "{}"));
        calls.push(body);
        if (!allowOverwrite) {
          allowOverwrite = true;
          return new Response("Промокод с таким названием уже существует, перезаписать?", { status: 400 });
        }
        created = true;
        return new Response(JSON.stringify({ ok: true, promoCodeId: "p1" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    (globalThis as any).confirm = () => true;

    const { default: PromocodesPage } = await import("../app/promocodes/page");
    render(React.createElement(PromocodesPage));

    await screen.findByText("Промокоды");
    fireEvent.click(screen.getByText("Создать промокод"));
    await screen.findByText("Новый промокод");

    fireEvent.change(screen.getByPlaceholderText("CODE2024"), { target: { value: "dupcode" } });
    fireEvent.click(screen.getByText("Сохранить"));

    await screen.findByText("DUPCODE");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].overwrite, undefined);
    assert.equal(calls[1].overwrite, true);
  });
});
