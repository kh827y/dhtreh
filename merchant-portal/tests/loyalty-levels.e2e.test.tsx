import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const originalFetch = global.fetch;

describe("loyalty levels page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;

  beforeEach(() => {
    fetchMock = undefined;
  });

  afterEach(() => {
    cleanup();
    (global as any).fetch = originalFetch;
  });

  it("отображает уровни и блокирует удаление стартового", async () => {
    const tiersPayload = [
      {
        id: "base",
        name: "Base",
        description: "Базовый уровень",
        thresholdAmount: 0,
        minPaymentAmount: 0,
        earnRateBps: 300,
        redeemRateBps: 5000,
        isInitial: true,
        isHidden: false,
        customersCount: 120,
      },
      {
        id: "vip",
        name: "VIP",
        description: "Лучшие клиенты",
        thresholdAmount: 50000,
        minPaymentAmount: 0,
        earnRateBps: 700,
        redeemRateBps: 8000,
        isInitial: false,
        isHidden: true,
        customersCount: 12,
      },
    ];

    fetchMock = mock.method(global, "fetch", async (input: any) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.endsWith("/api/portal/loyalty/levels")) {
        return new Response(JSON.stringify({ periodDays: 365 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(tiersPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const { default: LevelsPage } = await import("../app/loyalty/mechanics/levels/page");
    render(React.createElement(LevelsPage));

    await screen.findByText("Base");
    await screen.findByText("VIP");

    assert.ok(fetchMock.mock.calls.some((call) => (call.arguments[0] as any).toString().includes("/loyalty/tiers")));
    assert.ok(screen.getByText("Старт"));
    assert.ok(screen.getByText("Скрыт"));

    const deleteStarter = screen.getByTitle("Нельзя удалить стартовый уровень") as HTMLButtonElement;
    assert.equal(deleteStarter.disabled, true);
  });

  it("валидирует форму и создаёт новый уровень", async () => {
    const tiersPayload = [
      {
        id: "base",
        name: "Base",
        description: "",
        thresholdAmount: 0,
        minPaymentAmount: 0,
        earnRateBps: 300,
        redeemRateBps: 5000,
        isInitial: true,
        isHidden: false,
        customersCount: 10,
      },
    ];

    const created = {
      id: "silver",
      name: "Silver",
      description: "Повторные",
      thresholdAmount: 15000,
      minPaymentAmount: 500,
      earnRateBps: 500,
      redeemRateBps: 6000,
      isInitial: false,
      isHidden: false,
      customersCount: 0,
    };

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/loyalty/tiers") && method === "GET") {
        return new Response(JSON.stringify(tiersPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/portal/loyalty/levels") && method === "GET") {
        return new Response(JSON.stringify({ periodDays: 365 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/portal/loyalty/tiers") && method === "POST") {
        return new Response(JSON.stringify(created), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: LevelsPage } = await import("../app/loyalty/mechanics/levels/page");
    render(React.createElement(LevelsPage));

    await screen.findByText("Base");
    fireEvent.click(screen.getByText("Добавить уровень"));

    const modalTitle = await screen.findByText("Новый уровень");
    const modalContainer = modalTitle.closest("div")?.parentElement?.parentElement;
    if (!modalContainer) {
      throw new Error("Modal container not found");
    }
    const modalScope = within(modalContainer);

    fireEvent.click(modalScope.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Укажите название уровня");

    fireEvent.change(modalScope.getByPlaceholderText("Например: Platinum"), {
      target: { value: "Silver" },
    });
    fireEvent.change(modalScope.getByLabelText("Порог перехода"), {
      target: { value: "15000" },
    });
    fireEvent.change(modalScope.getByLabelText("% Начисления"), {
      target: { value: "5" },
    });
    fireEvent.change(modalScope.getByLabelText("% Списания"), {
      target: { value: "60" },
    });
    fireEvent.click(modalScope.getByRole("button", { name: "Сохранить" }));

    await screen.findByText("Silver");
    assert.ok(fetchMock.mock.calls.some((call) => (call.arguments[0] as any).toString().includes("tiers") && (call.arguments[1]?.method || "GET") === "POST"));
  });

  it("открывает модалку состава и загружает участников", async () => {
    const tier = {
      id: "base",
      name: "Base",
      description: "",
      thresholdAmount: 0,
      minPaymentAmount: 0,
      earnRateBps: 300,
      redeemRateBps: 5000,
      isInitial: true,
      isHidden: false,
      customersCount: 2,
    };

    const membersFirst = {
      tierId: "base",
      total: 2,
      nextCursor: "c2",
      items: [
        {
          customerId: "c1",
          name: "Анна",
          phone: "+7 999 123-45-67",
          assignedAt: "2024-01-01T00:00:00Z",
          source: "auto",
          totalSpent: 12000,
          firstSeenAt: "2023-12-31T00:00:00Z",
        },
      ],
    };

    const membersSecond = {
      tierId: "base",
      total: 2,
      nextCursor: null,
      items: [
        {
          customerId: "c2",
          name: "Борис",
          phone: "+7 999 222-33-11",
          assignedAt: "2024-01-02T00:00:00Z",
          source: "manual",
          totalSpent: 8000,
          firstSeenAt: "2024-01-01T00:00:00Z",
        },
      ],
    };

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/loyalty/tiers") && method === "GET") {
        return new Response(JSON.stringify([tier]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/portal/loyalty/levels") && method === "GET") {
        return new Response(JSON.stringify({ periodDays: 365 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/customers") && !url.includes("cursor=")) {
        return new Response(JSON.stringify(membersFirst), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("cursor=c2")) {
        return new Response(JSON.stringify(membersSecond), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: LevelsPage } = await import("../app/loyalty/mechanics/levels/page");
    render(React.createElement(LevelsPage));

    const membersButton = await screen.findByRole("button", { name: "2" });
    fireEvent.click(membersButton);

    await screen.findByText("Анна");
    fireEvent.click(screen.getByText("Загрузить ещё"));
    await screen.findByText("Борис");

    assert.ok(fetchMock.mock.calls.some((call) => (call.arguments[0] as any).toString().includes("/customers")));
  });
});
