import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const originalFetch = global.fetch;

describe("registration bonus page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;
  let lastPut: any = null;

  beforeEach(() => {
    lastPut = null;
    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/loyalty/registration-bonus") && method === "GET") {
        return new Response(
          JSON.stringify({
            enabled: true,
            points: 500,
            burnEnabled: true,
            burnTtlDays: 30,
            delayEnabled: false,
            delayHours: 1,
            pushEnabled: true,
            text: "Добро пожаловать в клуб! Вам начислено %bonus% приветственных баллов.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/portal/loyalty/registration-bonus") && method === "PUT") {
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

  it("загружает и сохраняет настройки регистрации", async () => {
    const { default: RegistrationBonusPage } = await import("../app/loyalty/mechanics/registration-bonus/page");
    render(React.createElement(RegistrationBonusPage));

    await screen.findByText("Баллы за регистрацию");

    fireEvent.change(screen.getByLabelText("Количество баллов"), { target: { value: "600" } });
    fireEvent.click(screen.getByText("Сохранить"));

    await screen.findByText("Готово");
    assert.equal(lastPut.points, 600);
    assert.equal(lastPut.enabled, true);
    assert.equal(lastPut.burnEnabled, true);
    assert.equal(lastPut.burnTtlDays, 30);
    assert.equal(lastPut.delayEnabled, false);
    assert.equal(lastPut.delayHours, 0);
    assert.equal(lastPut.pushEnabled, true);
  });

  it("валидирует пустой текст push", async () => {
    const { default: RegistrationBonusPage } = await import("../app/loyalty/mechanics/registration-bonus/page");
    render(React.createElement(RegistrationBonusPage));

    await screen.findByText("Баллы за регистрацию");
    fireEvent.change(screen.getByLabelText("Текст Push-уведомления"), { target: { value: " " } });
    fireEvent.click(screen.getByText("Сохранить"));

    await screen.findByText("Введите текст Push-уведомления");
    assert.equal(lastPut, null);
  });
});

