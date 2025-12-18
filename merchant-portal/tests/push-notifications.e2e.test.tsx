import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TimezoneProvider from "../components/TimezoneProvider";

const originalFetch = global.fetch;

describe("push newsletters page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;
  let originalConfirm: typeof globalThis.confirm | undefined;
  const timezone = {
    code: "MSK+0",
    label: "Москва (Центр России, МСК±0, UTC+3)",
    city: "Москва",
    description: "Центр России",
    mskOffset: 0,
    utcOffsetMinutes: 180,
    iana: "Europe/Moscow",
  };

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

  it("показывает активные и архивные рассылки со статусами", async () => {
    const activePayload = [
      {
        id: "p1",
        text: "Скоро старт",
        audience: "Все клиенты",
        audienceId: "aud-all",
        audienceName: "Все клиенты",
        scheduledAt: "2099-12-31T23:59:00.000Z",
        status: "SCHEDULED",
        totalRecipients: 1200,
        sent: 0,
        failed: 0,
        createdAt: "2025-01-10T10:00:00.000Z",
        updatedAt: "2025-01-10T10:00:00.000Z",
      },
      {
        id: "p2",
        text: "Идет отправка",
        audience: "VIP",
        audienceId: "aud-vip",
        audienceName: "VIP",
        scheduledAt: null,
        status: "RUNNING",
        totalRecipients: 200,
        sent: 50,
        failed: 0,
        createdAt: "2025-01-11T10:00:00.000Z",
        updatedAt: "2025-01-11T10:00:00.000Z",
      },
    ];

    const archivedPayload = [
      {
        id: "p3",
        text: "Завершено",
        audience: "Все клиенты",
        audienceId: "aud-all",
        audienceName: "Все клиенты",
        scheduledAt: "2099-12-01T09:00:00.000Z",
        status: "COMPLETED",
        totalRecipients: 500,
        sent: 490,
        failed: 10,
        createdAt: "2025-01-11T10:00:00.000Z",
        updatedAt: "2025-01-12T11:00:00.000Z",
      },
      {
        id: "p4",
        text: "Отмененная рассылка",
        audience: "VIP",
        audienceId: "aud-vip",
        audienceName: "VIP",
        scheduledAt: "2099-12-01T09:00:00.000Z",
        status: "CANCELED",
        totalRecipients: 0,
        sent: 0,
        failed: 0,
        createdAt: "2025-01-11T10:00:00.000Z",
        updatedAt: "2025-01-12T11:00:00.000Z",
      },
    ];

    const audiencesPayload = [
      { id: "aud-all", name: "Все клиенты", isSystem: true, systemKey: "all-customers", customerCount: 1200 },
      { id: "aud-vip", name: "VIP", isSystem: false, systemKey: null, customerCount: 200 },
    ];

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/communications/push?scope=ACTIVE") && method === "GET") {
        return new Response(JSON.stringify(activePayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/communications/push?scope=ARCHIVED") && method === "GET") {
        return new Response(JSON.stringify(archivedPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PushPage } = await import("../app/loyalty/push/page");
    render(
      React.createElement(TimezoneProvider, { timezone, options: [timezone] }, React.createElement(PushPage)),
    );

    await screen.findByText("Push-рассылки");
    await screen.findByText("Запланировано");
    await screen.findByText("Выполняется");

    fireEvent.click(screen.getByText("Архивные"));
    await screen.findByText("Отправлено");
    await screen.findByText("Не доставлено: 10");

    assert.equal(screen.queryByText("Отмененная рассылка"), null);
  });

  it("создаёт новую рассылку и отправляет корректный payload", async () => {
    const audiencesPayload = [
      { id: "aud-all", name: "Все клиенты", isSystem: true, systemKey: "all-customers", customerCount: 1200 },
    ];

    const calls: Array<{ url: string; method: string; body: any }> = [];
    let created: any = null;

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.endsWith("/api/portal/communications/push?scope=ACTIVE") && method === "GET") {
        return new Response(JSON.stringify(created ? [created] : []), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/communications/push?scope=ARCHIVED") && method === "GET") {
        return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/communications/push") && method === "POST") {
        calls.push({ url, method, body });
        created = {
          id: "new-1",
          text: body.text,
          audience: "Все клиенты",
          audienceId: body.audienceId,
          audienceName: body.audienceName,
          scheduledAt: body.scheduledAt,
          status: "SCHEDULED",
          totalRecipients: 1200,
          sent: 0,
          failed: 0,
          createdAt: "2025-01-20T09:00:00.000Z",
          updatedAt: "2025-01-20T09:00:00.000Z",
        };
        return new Response(JSON.stringify(created), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PushPage } = await import("../app/loyalty/push/page");
    render(
      React.createElement(TimezoneProvider, { timezone, options: [timezone] }, React.createElement(PushPage)),
    );

    await screen.findByText("Push-рассылки");
    fireEvent.click(screen.getByText("Создать рассылку"));

    await screen.findByRole("heading", { name: "Новая рассылка" });
    fireEvent.change(screen.getByPlaceholderText("Введите текст сообщения..."), { target: { value: "Новая рассылка" } });

    const checkbox = screen.getByLabelText("Отправить сейчас");
    fireEvent.click(checkbox);

    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2099-12-31" } });
    fireEvent.change(screen.getByLabelText("Время"), { target: { value: "23:59" } });

    fireEvent.click(screen.getByText("Запланировать"));

    await screen.findByText("Push-рассылки");
    await screen.findByText("Новая рассылка");

    assert.equal(calls.length, 1);
    const expectedDate = new Date(2099, 11, 31, 23, 59).toISOString();
    assert.equal(calls[0].body.text, "Новая рассылка");
    assert.equal(calls[0].body.audienceId, "aud-all");
    assert.equal(calls[0].body.scheduledAt, expectedDate);
  });

  it("редактирует и удаляет запланированную рассылку", async () => {
    const audiencesPayload = [
      { id: "aud-all", name: "Все клиенты", isSystem: true, systemKey: "all-customers", customerCount: 1200 },
    ];

    const calls: Array<{ url: string; method: string; body: any }> = [];
    const currentCampaigns: any[] = [
      {
        id: "p1",
        text: "Старая рассылка",
        audience: "Все клиенты",
        audienceId: "aud-all",
        audienceName: "Все клиенты",
        scheduledAt: "2099-12-31T23:59:00.000Z",
        status: "SCHEDULED",
        totalRecipients: 1200,
        sent: 0,
        failed: 0,
        createdAt: "2025-01-10T10:00:00.000Z",
        updatedAt: "2025-01-10T10:00:00.000Z",
      },
    ];

    globalThis.confirm = () => true;

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.endsWith("/api/portal/communications/push?scope=ACTIVE") && method === "GET") {
        return new Response(JSON.stringify(currentCampaigns), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/communications/push?scope=ARCHIVED") && method === "GET") {
        return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/communications/push/p1/cancel") && method === "POST") {
        calls.push({ url, method, body });
        currentCampaigns.splice(0, 1);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/communications/push") && method === "POST") {
        calls.push({ url, method, body });
        currentCampaigns.push({
          id: "p2",
          text: body.text,
          audience: "Все клиенты",
          audienceId: body.audienceId,
          audienceName: body.audienceName,
          scheduledAt: body.scheduledAt,
          status: "SCHEDULED",
          totalRecipients: 1200,
          sent: 0,
          failed: 0,
          createdAt: "2099-12-31T10:00:00.000Z",
          updatedAt: "2099-12-31T10:00:00.000Z",
        });
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/communications/push/p2/cancel") && method === "POST") {
        calls.push({ url, method, body });
        currentCampaigns.splice(0, currentCampaigns.length);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: PushPage } = await import("../app/loyalty/push/page");
    render(
      React.createElement(TimezoneProvider, { timezone, options: [timezone] }, React.createElement(PushPage)),
    );

    await screen.findByText("Старая рассылка");
    fireEvent.click(screen.getByTitle("Редактировать"));

    await screen.findByText("Редактирование рассылки");
    fireEvent.change(screen.getByPlaceholderText("Введите текст сообщения..."), { target: { value: "Обновленная рассылка" } });
    fireEvent.click(screen.getByText("Запланировать"));

    await screen.findByText("Push-рассылки");
    await screen.findByText("Обновленная рассылка");

    fireEvent.click(screen.getByTitle("Удалить"));

    assert.deepEqual(
      calls.map((call) => ({ url: call.url, method: call.method })),
      [
        { url: "/api/portal/communications/push/p1/cancel", method: "POST" },
        { url: "/api/portal/communications/push", method: "POST" },
        { url: "/api/portal/communications/push/p2/cancel", method: "POST" },
      ],
    );
  });
});
