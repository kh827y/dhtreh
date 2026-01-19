import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const originalFetch = global.fetch;

describe("reviews page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;

  beforeEach(() => {
    fetchMock = undefined;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
  });

  it("renders reviews with stats and filters", async () => {
    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/settings") && method === "GET") {
        return new Response(
          JSON.stringify({
            rulesJson: {
              reviews: { enabled: true },
              reviewsShare: {
                enabled: true,
                threshold: 5,
                platforms: {
                  yandex: { enabled: true },
                  twogis: { enabled: false },
                  google: { enabled: true },
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/api/portal/outlets") && method === "GET") {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "o1",
                name: "Флагман",
                works: true,
                staffCount: 2,
                devices: [
                  { id: "d1", code: "POS-01", outletId: "o1", outletName: "Флагман" },
                ],
              },
            ],
            total: 1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/api/portal/reviews") && method === "GET") {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "r1",
                rating: 5,
                comment: "Отлично!",
                createdAt: "2024-12-31T12:30:00.000Z",
                customer: { id: "c1", name: "Иван" },
                staff: { id: "s1", name: "Алиса" },
                outlet: { id: "o1", name: "Флагман" },
              },
              {
                id: "r2",
                rating: 4,
                comment: "",
                createdAt: "2024-12-31T10:00:00.000Z",
                customer: { id: "c2", name: "Петр" },
                deviceId: "POS-01",
                outlet: { id: "o1", name: "Флагман" },
              },
            ],
            total: 2,
            staff: [{ id: "s1", name: "Алиса" }],
            stats: { averageRating: 4.5 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: ReviewsPage } = await import("../src/app/reviews/page");
    render(React.createElement(ReviewsPage));

    await screen.findByText("Отзывы");
    await screen.findByText("Найдено");
    await screen.findByText("2");
    await screen.findByText("4.5");
    await screen.findByText("Отлично!");
  });

  it("saves reviews share settings", async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.endsWith("/api/portal/settings") && method === "GET") {
        return new Response(
          JSON.stringify({
            rulesJson: {
              reviews: { enabled: true },
              reviewsShare: {
                enabled: true,
                threshold: 5,
                platforms: {
                  yandex: { enabled: true },
                  twogis: { enabled: false },
                  google: { enabled: false },
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/api/portal/outlets") && method === "GET") {
        return new Response(JSON.stringify({ items: [], total: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/portal/reviews") && method === "GET") {
        return new Response(JSON.stringify({ items: [], total: 0, stats: { averageRating: 0 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/portal/settings") && method === "PUT") {
        calls.push({ url, method, body });
        return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: ReviewsPage } = await import("../src/app/reviews/page");
    render(React.createElement(ReviewsPage));

    await screen.findByText("Отзывы");
    fireEvent.click(screen.getByText("⭐️ 4+"));
    fireEvent.click(screen.getByText("Сохранить настройки"));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.rulesJson.reviewsShare.threshold, 4);
    assert.equal(calls[0].body.rulesJson.reviews.enabled, true);
  });
});
