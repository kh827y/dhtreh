import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const originalFetch = global.fetch;

describe("staff motivation page (new design)", () => {
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
    const initialPayload = {
      enabled: true,
      pointsForNewCustomer: 10,
      pointsForExistingCustomer: 1,
      leaderboardPeriod: "month",
      customDays: null,
    };

    let lastPut: any = null;

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";

      if (url.endsWith("/api/portal/staff-motivation") && method === "GET") {
        return new Response(JSON.stringify(initialPayload), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      if (url.endsWith("/api/portal/staff-motivation") && method === "PUT") {
        lastPut = JSON.parse(String(init?.body || "{}"));
        return new Response(
          JSON.stringify({
            ...lastPut,
            pointsForNewCustomer: 99,
            pointsForExistingCustomer: 77,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: StaffMotivationPage } = await import("../src/app/loyalty/staff-motivation/page");
    render(React.createElement(StaffMotivationPage));

    await screen.findByText("Мотивация персонала");

    fireEvent.click(screen.getByLabelText("Произвольный период (дней)"));

    const spinButtons = await screen.findAllByRole("spinbutton");
    assert.equal(spinButtons.length, 3);

    fireEvent.change(spinButtons[0], { target: { value: "15" } });
    fireEvent.change(spinButtons[1], { target: { value: "5" } });
    fireEvent.change(spinButtons[2], { target: { value: "7" } });

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await screen.findByDisplayValue("99");

    assert.ok(lastPut);
    assert.equal(lastPut.enabled, true);
    assert.equal(lastPut.pointsForNewCustomer, 15);
    assert.equal(lastPut.pointsForExistingCustomer, 5);
    assert.equal(lastPut.leaderboardPeriod, "custom");
    assert.equal(lastPut.customDays, 7);
    await screen.findByText("Готово");
    await screen.findByText("Настройки мотивации персонала сохранены!");
  });
});
