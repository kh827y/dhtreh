import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const originalFetch = global.fetch;

describe("cashier panel page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;

  beforeEach(() => {
    fetchMock = undefined;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
  });

  it("загружает данные, добавляет скролл таблице и выполняет действия", async () => {
    const writeText = mock.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    const credsPayload = { login: "shop_12345", password: "837291045", hasPassword: true };
    const pinsPayload = [
      {
        id: "A-1",
        staffId: "S-1",
        staffName: "Алиса Фриман",
        outletId: "O-1",
        outletName: "Флагманский магазин",
        pinCode: "1234",
        status: "ACTIVE",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
      {
        id: "A-2",
        staffId: "S-2",
        staffName: "Боб Смит",
        outletId: "O-1",
        outletName: "Флагманский магазин",
        pinCode: "4321",
        status: "REVOKED",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
    ];

    const calls: Array<{ url: string; method: string; body: any }> = [];

    let activationCodesPayload = [
      {
        id: "C-1",
        tokenHint: "045",
        createdAt: "2025-01-01T00:00:00.000Z",
        expiresAt: "2025-01-04T00:00:00.000Z",
        usedAt: null,
        revokedAt: null,
        status: "ACTIVE",
      },
      {
        id: "C-2",
        tokenHint: "777",
        createdAt: "2025-01-01T00:00:00.000Z",
        expiresAt: "2025-01-02T00:00:00.000Z",
        usedAt: "2025-01-01T01:00:00.000Z",
        revokedAt: null,
        status: "USED",
      },
    ];

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.endsWith("/api/portal/cashier") && method === "GET") {
        return new Response(JSON.stringify(credsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/cashier/pins") && method === "GET") {
        return new Response(JSON.stringify(pinsPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/cashier/device-sessions") && method === "GET") {
        return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/cashier/activation-codes") && method === "GET") {
        return new Response(JSON.stringify(activationCodesPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/portal/cashier/activation-codes") && method === "POST") {
        calls.push({ url, method, body });
        const issued = ["123456789", "000111222"];
        activationCodesPayload = [
          ...issued.map((code, idx) => ({
            id: `C-NEW-${idx + 1}`,
            tokenHint: code.slice(-3),
            createdAt: "2025-01-01T00:00:00.000Z",
            expiresAt: "2025-01-04T00:00:00.000Z",
            usedAt: null,
            revokedAt: null,
            status: "ACTIVE",
          })),
          ...activationCodesPayload,
        ];
        return new Response(
          JSON.stringify({
            expiresAt: "2025-01-04T00:00:00.000Z",
            codes: issued,
            items: issued.map((code, idx) => ({
              id: `C-NEW-${idx + 1}`,
              tokenHint: code.slice(-3),
              expiresAt: "2025-01-04T00:00:00.000Z",
            })),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/portal/cashier/activation-codes/revoke") && method === "POST") {
        calls.push({ url, method, body });
        activationCodesPayload = activationCodesPayload.map((code) =>
          code.id === body?.id ? { ...code, status: "REVOKED", revokedAt: "2025-01-01T00:00:00.000Z" } : code,
        );
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: CashierPanelPage } = await import("../app/loyalty/cashier/page");
    render(React.createElement(CashierPanelPage));

    await screen.findByText("Панель кассира");
    await screen.findByText("shop_12345");

    // Скролл на таблице сотрудников
    const table = screen.getByRole("table");
    const wrapper = table.parentElement as HTMLElement | null;
    assert.ok(wrapper?.className.includes("overflow-y-auto"));
    assert.ok(wrapper?.className.includes("max-h-[420px]"));

    // PIN таблица: показываем только активные
    await screen.findByText("Алиса Фриман");
    assert.equal(screen.queryByText("Боб Смит"), null);

    // PIN скрыт по умолчанию
    await screen.findByText("••••");
    fireEvent.click(screen.getByTitle("Показать PIN"));
    await screen.findByText("1234");

    // Copy login
    fireEvent.click(screen.getByTitle("Копировать"));
    assert.equal(writeText.mock.calls.length, 1);
    assert.equal(writeText.mock.calls[0].arguments[0], "shop_12345");

    // Выпуск кодов активации
    fireEvent.change(screen.getByLabelText("Количество кодов"), { target: { value: "2" } });
    fireEvent.click(screen.getByText("Выпустить пароли"));

    await screen.findByText("123456789");
    await screen.findByText("000111222");

    const copyButtonsAfterIssue = screen.getAllByTitle("Копировать");
    assert.equal(copyButtonsAfterIssue.length, 3);
    fireEvent.click(copyButtonsAfterIssue[1]);
    fireEvent.click(copyButtonsAfterIssue[2]);
    assert.equal(writeText.mock.calls.length, 3);
    assert.equal(writeText.mock.calls[1].arguments[0], "123456789");
    assert.equal(writeText.mock.calls[2].arguments[0], "000111222");

    // Отзыв активного кода
    await screen.findByText("•••045");
    const revokeRow = screen.getByText("•••045").closest("div.justify-between");
    assert.ok(revokeRow);
    fireEvent.click(within(revokeRow).getByTitle("Отозвать код"));
    await screen.findByText("Отозван");

    assert.deepEqual(
      calls,
      [
        { url: "/api/portal/cashier/activation-codes", method: "POST", body: { count: 2 } },
        { url: "/api/portal/cashier/activation-codes/revoke", method: "POST", body: { id: "C-1" } },
      ],
    );
  });
});
