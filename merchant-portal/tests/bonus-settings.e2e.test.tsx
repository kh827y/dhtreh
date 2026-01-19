import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const originalFetch = global.fetch;

describe("bonus settings page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;
  let lastPut: any = null;

  beforeEach(() => {
    lastPut = null;
    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/loyalty/redeem-limits") && method === "GET") {
        return new Response(
          JSON.stringify({
            ttlEnabled: true,
            ttlDays: 365,
            allowSameReceipt: true,
            delayEnabled: true,
            delayDays: 7,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/portal/loyalty/redeem-limits") && method === "PUT") {
        lastPut = JSON.parse(String(init?.body || "{}"));
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
  });

  it("загружает настройки и сохраняет без изменений", async () => {
    const { default: BonusSettingsPage } = await import("../src/app/loyalty/mechanics/bonus-settings/page");
    render(React.createElement(BonusSettingsPage));

    await screen.findByText("Настройки бонусов за покупки");
    fireEvent.click(screen.getByText("Сохранить"));

    await screen.findByText("Готово");
    assert.deepEqual(lastPut, {
      ttlEnabled: true,
      ttlDays: 365,
      allowSameReceipt: true,
      delayEnabled: true,
      delayDays: 7,
    });
  });

  it("меняет TTL, смешанную оплату и задержку", async () => {
    const { default: BonusSettingsPage } = await import("../src/app/loyalty/mechanics/bonus-settings/page");
    render(React.createElement(BonusSettingsPage));

    await screen.findByText("Настройки бонусов за покупки");

    fireEvent.click(screen.getByLabelText("Баллы не сгорают"));
    fireEvent.click(screen.getByLabelText("Разрешить смешанную оплату"));
    fireEvent.change(screen.getByLabelText("Дней до активации"), { target: { value: "0" } });

    fireEvent.click(screen.getByText("Сохранить"));
    await screen.findByText("Готово");

    assert.deepEqual(lastPut, {
      ttlEnabled: false,
      ttlDays: 0,
      allowSameReceipt: false,
      delayEnabled: false,
      delayDays: 0,
    });
  });
});
