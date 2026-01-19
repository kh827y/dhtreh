import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TimezoneProvider from "../src/components/TimezoneProvider";

const originalFetch = global.fetch;

describe("system settings page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;

  beforeEach(() => {
    fetchMock = undefined;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
  });

  it("загружает и сохраняет системные настройки", async () => {
    const timezone = {
      code: "MSK+0",
      label: "Москва (Центр России, МСК±0, UTC+3)",
      city: "Москва",
      description: "Центр России",
      mskOffset: 0,
      utcOffsetMinutes: 180,
      iana: "Europe/Moscow",
    };
    const nextTimezone = {
      ...timezone,
      code: "MSK+1",
      iana: "Europe/Samara",
    };

    const namePayload = { name: "Моя Компания", initialName: "Моя Компания" };
    const supportPayload = { supportTelegram: "" };
    const qrPayload = { requireJwtForQuote: false };
    const updatedNamePayload = { ok: true, name: "Новая Компания ✓", initialName: "Моя Компания" };
    const updatedTimezonePayload = {
      ok: true,
      timezone: nextTimezone,
      options: [],
    };

    const calls: Array<{ url: string; method: string; body: any }> = [];

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.endsWith("/api/portal/settings/name") && method === "GET") {
        return new Response(JSON.stringify(namePayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/settings/support") && method === "GET") {
        return new Response(JSON.stringify(supportPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/settings/qr") && method === "GET") {
        return new Response(JSON.stringify(qrPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/settings/name") && method === "PUT") {
        calls.push({ url, method, body });
        return new Response(JSON.stringify(updatedNamePayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/settings/timezone") && method === "PUT") {
        calls.push({ url, method, body });
        return new Response(JSON.stringify(updatedTimezonePayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: SettingsSystemPage } = await import("../src/app/settings/system/page");
    render(
      React.createElement(
        TimezoneProvider,
        { timezone, options: [timezone, nextTimezone] },
        React.createElement(SettingsSystemPage),
      ),
    );

    await screen.findByText("Системные настройки");
    await screen.findByDisplayValue("Моя Компания");

    const input = screen.getByPlaceholderText("Введите название");
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    assert.equal(select.value, "MSK+0");

    fireEvent.change(input, { target: { value: "Новая Компания" } });
    fireEvent.change(select, { target: { value: "MSK+1" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await screen.findByDisplayValue("Новая Компания ✓");

    assert.equal(calls.length, 2);
    const byUrl = new Map(calls.map((call) => [call.url, call]));

    assert.deepEqual(byUrl.get("/api/portal/settings/name")?.body, { name: "Новая Компания" });
    assert.deepEqual(byUrl.get("/api/portal/settings/timezone")?.body, { code: "MSK+1" });

    await screen.findByText("Готово");
    await screen.findByText("Системные настройки сохранены!");
  });
});
