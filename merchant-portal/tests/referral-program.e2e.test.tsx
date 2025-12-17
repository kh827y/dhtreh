import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const originalFetch = global.fetch;
const originalAlert = (global as any).alert;

async function waitForCondition(condition: () => boolean, timeoutMs = 750) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for condition");
}

describe("referral program settings page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;
  let lastPut: any = null;
  let alerts: string[] = [];

  beforeEach(() => {
    lastPut = null;
    alerts = [];
    (global as any).alert = (message: any) => {
      alerts.push(String(message));
    };
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
    (global as any).alert = originalAlert;
  });

  it("загружает single-level, подставляет плейсхолдеры и сохраняет", async () => {
    const apiReferral = {
      enabled: true,
      rewardTrigger: "first",
      rewardType: "fixed",
      multiLevel: false,
      rewardValue: 777,
      levels: [],
      friendReward: 123,
      stackWithRegistration: true,
      message: "Текст {link}",
      placeholders: ["{businessname}", "{bonusamount}", "{code}", "{link}"],
      shareMessageTemplate: "Сообщение {link}",
      minPurchaseAmount: 0,
    };

    const apiRegistration = { enabled: true, points: 150 };

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";

      if (url.endsWith("/api/portal/referrals/program") && method === "GET") {
        return new Response(JSON.stringify(apiReferral), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/loyalty/registration-bonus") && method === "GET") {
        return new Response(JSON.stringify(apiRegistration), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/referrals/program") && method === "PUT") {
        lastPut = JSON.parse(String(init?.body || "{}"));
        return new Response(
          JSON.stringify({
            ...apiReferral,
            enabled: Boolean(lastPut.enabled),
            rewardTrigger: lastPut.rewardTrigger,
            rewardType: lastPut.rewardType,
            multiLevel: Boolean(lastPut.multiLevel),
            rewardValue: lastPut.rewardValue ?? apiReferral.rewardValue,
            friendReward: lastPut.friendReward,
            stackWithRegistration: Boolean(lastPut.stackWithRegistration),
            message: lastPut.message,
            shareMessageTemplate: lastPut.shareMessage,
            minPurchaseAmount: lastPut.minPurchaseAmount,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: ReferralProgramPage } = await import("../app/referrals/program/page");
    render(React.createElement(ReferralProgramPage));

    const rewardInput = (await screen.findByDisplayValue("777")) as HTMLInputElement;
    assert.equal(rewardInput.value, "777");

    await screen.findByText(/Если включено:/);
    await screen.findByText("150");

    const inviteLabel = screen.getByText("Текст в приложении");
    const inviteTextarea = inviteLabel.parentElement?.querySelector("textarea") as HTMLTextAreaElement;
    assert.ok(inviteTextarea);

    const inviteButtons = Array.from(inviteLabel.parentElement?.querySelectorAll("button") || []);
    const inviteCodeButton = inviteButtons.find((btn) => btn.textContent === "Код");
    assert.ok(inviteCodeButton);
    fireEvent.click(inviteCodeButton);
    assert.ok(inviteTextarea.value.includes("{code}"));

    fireEvent.click(screen.getByText("Процент от чека"));
    fireEvent.change(rewardInput, { target: { value: "10" } });

    fireEvent.click(screen.getByText("Сохранить"));

    await waitForCondition(() => alerts.includes("Настройки реферальной программы сохранены!"));
    assert.ok(lastPut);
    assert.equal(lastPut.multiLevel, false);
    assert.equal(lastPut.rewardType, "percent");
    assert.equal(lastPut.rewardValue, 10);
  });

  it("показывает предупреждение если регистрационный бонус выключен", async () => {
    const apiReferral = {
      enabled: true,
      rewardTrigger: "first",
      rewardType: "fixed",
      multiLevel: false,
      rewardValue: 100,
      levels: [],
      friendReward: 0,
      stackWithRegistration: true,
      message: "Текст {link}",
      placeholders: ["{businessname}", "{bonusamount}", "{code}", "{link}"],
      shareMessageTemplate: "Сообщение {link}",
      minPurchaseAmount: 0,
    };

    const apiRegistration = { enabled: false, points: 150 };

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/referrals/program") && method === "GET") {
        return new Response(JSON.stringify(apiReferral), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/loyalty/registration-bonus") && method === "GET") {
        return new Response(JSON.stringify(apiRegistration), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: ReferralProgramPage } = await import("../app/referrals/program/page");
    render(React.createElement(ReferralProgramPage));

    await screen.findByText("У вас отключены баллы за регистрацию");
  });

  it("сохраняет multi-level и отправляет 5 уровней, включая кламп процентов", async () => {
    const apiReferral = {
      enabled: true,
      rewardTrigger: "all",
      rewardType: "fixed",
      multiLevel: true,
      rewardValue: 0,
      levels: [
        { level: 1, enabled: true, reward: 401 },
        { level: 2, enabled: true, reward: 202 },
        { level: 3, enabled: true, reward: 103 },
        { level: 4, enabled: false, reward: 0 },
        { level: 5, enabled: false, reward: 0 },
      ],
      friendReward: 300,
      stackWithRegistration: false,
      message: "Текст {link}",
      placeholders: ["{businessname}", "{bonusamount}", "{code}", "{link}"],
      shareMessageTemplate: "Сообщение {link}",
      minPurchaseAmount: 10,
    };

    const apiRegistration = { enabled: true, points: 150 };

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/referrals/program") && method === "GET") {
        return new Response(JSON.stringify(apiReferral), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/loyalty/registration-bonus") && method === "GET") {
        return new Response(JSON.stringify(apiRegistration), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/portal/referrals/program") && method === "PUT") {
        lastPut = JSON.parse(String(init?.body || "{}"));
        return new Response(JSON.stringify(apiReferral), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: ReferralProgramPage } = await import("../app/referrals/program/page");
    render(React.createElement(ReferralProgramPage));

    await screen.findByText("Прямое приглашение");

    const row = (label: string) => screen.getByText(label).closest("div")?.parentElement as HTMLElement;
    const directInput = row("Прямое приглашение").querySelector("input[type=\"number\"]") as HTMLInputElement;
    const secondInput = row("Друг друга").querySelector("input[type=\"number\"]") as HTMLInputElement;
    const thirdInput = row("3-й уровень").querySelector("input[type=\"number\"]") as HTMLInputElement;

    fireEvent.click(screen.getByText("Процент от чека"));
    fireEvent.change(directInput, { target: { value: "250" } });
    fireEvent.change(secondInput, { target: { value: "50" } });
    fireEvent.change(thirdInput, { target: { value: "1" } });
    fireEvent.click(screen.getByText("Сохранить"));

    await waitForCondition(() => alerts.includes("Настройки реферальной программы сохранены!"));
    assert.ok(lastPut);
    assert.equal(lastPut.multiLevel, true);
    assert.equal(lastPut.rewardType, "percent");
    assert.equal(lastPut.levels.length, 5);
    assert.deepEqual(lastPut.levels[0], { level: 1, enabled: true, reward: 100 });
    assert.deepEqual(lastPut.levels[1], { level: 2, enabled: true, reward: 50 });
    assert.deepEqual(lastPut.levels[2], { level: 3, enabled: true, reward: 1 });
  });
});
