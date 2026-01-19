import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const originalFetch = global.fetch;

describe("expiration reminder page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;
  let lastPut: any = null;

  beforeEach(() => {
    lastPut = null;
    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/loyalty/ttl") && method === "GET") {
        return new Response(
          JSON.stringify({
            enabled: true,
            daysBefore: 3,
            text: "Уважаемый %username%, у вас сгорает %amount% баллов %burn_date%. Успейте потратить!",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/portal/loyalty/ttl") && method === "PUT") {
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

  it("вставляет плейсхолдеры и сохраняет", async () => {
    const { default: ExpirationReminderPage } = await import("../src/app/loyalty/mechanics/ttl/page");
    render(React.createElement(ExpirationReminderPage));

    await screen.findByText("Напоминание о сгорании");

    fireEvent.click(screen.getByText("Дата сгорания"));
    fireEvent.change(screen.getByLabelText("За сколько дней отправлять"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Сохранить"));

    await screen.findByText("Готово");
    assert.equal(lastPut.enabled, true);
    assert.equal(lastPut.daysBefore, 5);
    assert.ok(String(lastPut.text).includes("%burn_date%"));
  });
});

