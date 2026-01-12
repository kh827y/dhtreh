import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TimezoneProvider from "../components/TimezoneProvider";

const originalFetch = global.fetch;
const originalFileReader = (global as any).FileReader;

describe("telegram newsletters page (new design)", () => {
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
    (global as any).FileReader = originalFileReader;
    if (originalConfirm) globalThis.confirm = originalConfirm;
  });

  it("показывает рассылки и открывает изображение", async () => {
    const activePayload = [
      {
        id: "t1",
        text: "Новая акция",
        audienceId: "aud-all",
        audienceName: "Все клиенты",
        scheduledAt: "2099-12-31T23:59:00.000Z",
        status: "SCHEDULED",
        totalRecipients: 1200,
        sent: 0,
        failed: 0,
        imageAssetId: "asset-1",
        imageMeta: { fileName: "banner.jpg", mimeType: "image/jpeg" },
        createdAt: "2025-01-10T10:00:00.000Z",
        updatedAt: "2025-01-10T10:00:00.000Z",
      },
      {
        id: "t2",
        text: "Отправка",
        audienceId: "aud-vip",
        audienceName: "VIP",
        scheduledAt: null,
        status: "RUNNING",
        totalRecipients: 200,
        sent: 50,
        failed: 0,
        imageAssetId: null,
        createdAt: "2025-01-11T10:00:00.000Z",
        updatedAt: "2025-01-11T10:00:00.000Z",
      },
    ];

    const archivedPayload = [
      {
        id: "t3",
        text: "Завершено",
        audienceId: "aud-all",
        audienceName: "Все клиенты",
        scheduledAt: "2099-12-01T09:00:00.000Z",
        status: "COMPLETED",
        totalRecipients: 500,
        sent: 490,
        failed: 5,
        imageAssetId: null,
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
      if (url.endsWith("/api/portal/communications/telegram?scope=ACTIVE") && method === "GET") {
        return new Response(JSON.stringify(activePayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/communications/telegram?scope=ARCHIVED") && method === "GET") {
        return new Response(JSON.stringify(archivedPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: TelegramPage } = await import("../app/loyalty/telegram/page");
    render(
      React.createElement(TimezoneProvider, { timezone, options: [timezone] }, React.createElement(TelegramPage)),
    );

    await screen.findByText("Telegram-рассылки");
    await screen.findByText("Запланировано");
    await screen.findByText("Выполняется");

    const preview = document.querySelector("img[src='/api/portal/communications/assets/asset-1']");
    assert.ok(preview);
    fireEvent.click(preview?.parentElement as HTMLElement);

    await screen.findByAltText("Expanded");

    fireEvent.click(screen.getByText("Архивные"));
    await screen.findByText("Отправлено");
    await screen.findByText("Не доставлено: 5");
  });

  it("создаёт рассылку с изображением", async () => {
    const audiencesPayload = [
      { id: "aud-all", name: "Все клиенты", isSystem: true, systemKey: "all-customers", customerCount: 1200 },
    ];

    const calls: Array<{ url: string; method: string; body: any }> = [];
    let created: any = null;

    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,AAA";
        this.onload?.();
      }
    }

    (global as any).FileReader = MockFileReader;

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.endsWith("/api/portal/communications/telegram?scope=ACTIVE") && method === "GET") {
        return new Response(JSON.stringify(created ? [created] : []), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/communications/telegram?scope=ARCHIVED") && method === "GET") {
        return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/communications/telegram") && method === "POST") {
        calls.push({ url, method, body });
        created = {
          id: "new-1",
          text: body.text,
          audienceId: body.audienceId,
          audienceName: body.audienceName,
          scheduledAt: body.scheduledAt,
          status: "SCHEDULED",
          totalRecipients: 1200,
          sent: 0,
          failed: 0,
          imageAssetId: null,
          createdAt: "2025-01-20T09:00:00.000Z",
          updatedAt: "2025-01-20T09:00:00.000Z",
        };
        return new Response(JSON.stringify(created), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: TelegramPage } = await import("../app/loyalty/telegram/page");
    render(
      React.createElement(TimezoneProvider, { timezone, options: [timezone] }, React.createElement(TelegramPage)),
    );

    await screen.findByText("Telegram-рассылки");
    fireEvent.click(screen.getByText("Создать рассылку"));

    await screen.findByRole("heading", { name: "Новая рассылка" });
    fireEvent.change(screen.getByPlaceholderText("Введите текст..."), { target: { value: "Новость" } });

    const checkbox = screen.getByLabelText("Отправить сейчас");
    fireEvent.click(checkbox);

    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2099-12-31" } });
    fireEvent.change(screen.getByLabelText("Время"), { target: { value: "23:59" } });

    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement | null;
    assert.ok(fileInput);
    const file = new File(["x"], "banner.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByText("Запланировать"));

    await screen.findByText("Telegram-рассылки");
    await screen.findByText("Новость");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.media.imageBase64, "data:image/png;base64,AAA");
    assert.equal(calls[0].body.media.mimeType, "image/png");
  });

  it("редактирует и удаляет запланированную рассылку", async () => {
    const audiencesPayload = [
      { id: "aud-all", name: "Все клиенты", isSystem: true, systemKey: "all-customers", customerCount: 1200 },
    ];

    const calls: Array<{ url: string; method: string; body: any }> = [];
    const currentCampaigns: any[] = [
      {
        id: "t1",
        text: "Старая рассылка",
        audienceId: "aud-all",
        audienceName: "Все клиенты",
        scheduledAt: "2099-12-31T23:59:00.000Z",
        status: "SCHEDULED",
        totalRecipients: 1200,
        sent: 0,
        failed: 0,
        imageAssetId: null,
        createdAt: "2025-01-10T10:00:00.000Z",
        updatedAt: "2025-01-10T10:00:00.000Z",
      },
    ];

    globalThis.confirm = () => true;

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.endsWith("/api/portal/communications/telegram?scope=ACTIVE") && method === "GET") {
        return new Response(JSON.stringify(currentCampaigns), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/communications/telegram?scope=ARCHIVED") && method === "GET") {
        return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/audiences?includeSystem=1") && method === "GET") {
        return new Response(JSON.stringify(audiencesPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/communications/telegram/t1/cancel") && method === "POST") {
        calls.push({ url, method, body });
        currentCampaigns.splice(0, 1);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/communications/telegram") && method === "POST") {
        calls.push({ url, method, body });
        currentCampaigns.push({
          id: "t2",
          text: body.text,
          audienceId: body.audienceId,
          audienceName: body.audienceName,
          scheduledAt: body.scheduledAt,
          status: "SCHEDULED",
          totalRecipients: 1200,
          sent: 0,
          failed: 0,
          imageAssetId: null,
          createdAt: "2099-12-31T10:00:00.000Z",
          updatedAt: "2099-12-31T10:00:00.000Z",
        });
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/communications/telegram/t2/cancel") && method === "POST") {
        calls.push({ url, method, body });
        currentCampaigns.splice(0, currentCampaigns.length);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: TelegramPage } = await import("../app/loyalty/telegram/page");
    render(
      React.createElement(TimezoneProvider, { timezone, options: [timezone] }, React.createElement(TelegramPage)),
    );

    await screen.findByText("Старая рассылка");
    fireEvent.click(screen.getByTitle("Редактировать"));

    await screen.findByText("Редактирование рассылки");
    fireEvent.change(screen.getByPlaceholderText("Введите текст..."), { target: { value: "Обновленная рассылка" } });
    fireEvent.click(screen.getByText("Запланировать"));

    await screen.findByText("Telegram-рассылки");
    await screen.findByText("Обновленная рассылка");

    fireEvent.click(screen.getByTitle("Удалить"));

    assert.deepEqual(
      calls.map((call) => ({ url: call.url, method: call.method })),
      [
        { url: "/api/portal/communications/telegram", method: "POST" },
        { url: "/api/portal/communications/telegram/t1/cancel", method: "POST" },
        { url: "/api/portal/communications/telegram/t2/cancel", method: "POST" },
      ],
    );
  });
});
