import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const originalFetch = global.fetch;

describe("telegram notifications page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;

  beforeEach(() => {
    fetchMock = undefined;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
  });

  it("shows connected accounts and updates preferences", async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.endsWith("/api/portal/settings/telegram-notify/state") && method === "GET") {
        return new Response(JSON.stringify({ configured: true, botUsername: "LoyaltyBot", botLink: "https://t.me/LoyaltyBot", digestHourLocal: 8 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/portal/settings/telegram-notify/invite") && method === "POST") {
        return new Response(JSON.stringify({ token: "token-123", startUrl: "https://t.me/LoyaltyBot?start=token-123", startGroupUrl: "https://t.me/LoyaltyBot?startgroup=token-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/portal/settings/telegram-notify/subscribers") && method === "GET") {
        return new Response(JSON.stringify([{ id: "sub-1", chatType: "private", username: "ivan", title: null, addedAt: "2024-12-01T10:00:00.000Z" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/portal/settings/telegram-notify/preferences") && method === "GET") {
        return new Response(JSON.stringify({ notifyOrders: true, notifyReviews: true, notifyReviewThreshold: 3, notifyDailyDigest: true, notifyFraud: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/portal/settings/telegram-notify/preferences") && method === "POST") {
        calls.push({ url, method, body });
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/settings/telegram-notify/subscribers/sub-1/deactivate") && method === "POST") {
        calls.push({ url, method, body: null });
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: TelegramSettingsPage } = await import("../app/settings/telegram/page");
    render(React.createElement(TelegramSettingsPage));

    await screen.findByText("Уведомления в Telegram");
    await screen.findByText("@ivan");
    await screen.findByText("Отчет по показателям в 08:00");

    fireEvent.click(screen.getByText("1"));
    fireEvent.click(screen.getByRole("button", { name: "Отключить" }));

    await screen.findByText("Нет подключенных пользователей");

    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.notifyReviewThreshold, 1);
  });
});
