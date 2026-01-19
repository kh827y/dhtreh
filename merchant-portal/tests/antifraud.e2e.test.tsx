import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const originalFetch = global.fetch;

describe("antifraud page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;

  beforeEach(() => {
    fetchMock = undefined;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
  });

  it("загружает настройки и сохраняет корректный payload", async () => {
    const initialPayload = { dailyCap: 7, monthlyCap: 20, maxPoints: 4000, blockDaily: false };
    let lastPost: any = null;

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";

      if (url.endsWith("/api/portal/loyalty/antifraud") && method === "GET") {
        return new Response(JSON.stringify(initialPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      if (url.endsWith("/api/portal/loyalty/antifraud") && method === "POST") {
        lastPost = JSON.parse(String(init?.body || "{}"));
        return new Response(
          JSON.stringify({
            ...lastPost,
            dailyCap: 99,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: AntifraudPage } = await import("../src/app/loyalty/antifraud/page");
    render(React.createElement(AntifraudPage));

    await screen.findByText("Защита от мошенничества");

    await screen.findByDisplayValue("7");
    await screen.findByDisplayValue("20");
    await screen.findByDisplayValue("4000");

    fireEvent.click(screen.getByRole("switch", { name: "Блокировка дневного лимита" }));

    const spinButtons = screen.getAllByRole("spinbutton");
    assert.equal(spinButtons.length, 3);
    fireEvent.change(spinButtons[0], { target: { value: "9" } });

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await screen.findByDisplayValue("99");

    assert.ok(lastPost);
    assert.equal(lastPost.dailyCap, 9);
    assert.equal(lastPost.monthlyCap, 20);
    assert.equal(lastPost.maxPoints, 4000);
    assert.equal(lastPost.blockDaily, true);

    await screen.findByText("Готово");
    await screen.findByText("Настройки безопасности обновлены");
  });
});
