import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const originalFetch = global.fetch;

describe("import customers page (new design)", () => {
  let fetchMock: ReturnType<typeof mock.method> | undefined;
  let alertMock: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    fetchMock = undefined;
    alertMock = mock.fn();
    (globalThis as any).alert = alertMock;
    (globalThis as any).window.alert = alertMock;
  });

  afterEach(() => {
    cleanup();
    fetchMock?.mock.restore?.();
    (global as any).fetch = originalFetch;
  });

  it("рендерит инструкции и структуру файла", async () => {
    const { default: ImportPage } = await import("../src/app/customers/import/page");
    render(React.createElement(ImportPage));

    await screen.findByText("Импорт данных");
    await screen.findByText("Загрузка файла");
    await screen.findByText("Шаблон файла");
    await screen.findByText("Инструкции по подготовке файла");
    await screen.findByText("Структура файла");
    await screen.findByText("Если не передаём чеки:");
    await screen.findByText("Если хотите передать детальную информацию об операциях:");
    await screen.findByText("ID клиента во внешней среде");
    await screen.findAllByText("Номер телефона");
    await screen.findAllByText("Сумма операции");
  });

  it("отправляет CSV файл на импорт", async () => {
    const payload = {
      total: 2,
      customersCreated: 1,
      customersUpdated: 1,
      receiptsImported: 1,
      receiptsSkipped: 0,
      statsUpdated: 1,
      balancesSet: 1,
      errors: [],
    };

    fetchMock = mock.method(global, "fetch", async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      const method = init?.method || "GET";
      if (url.endsWith("/api/portal/customers/import") && method === "POST") {
        const body = init?.body;
        assert.ok(body instanceof FormData);
        const file = body.get("file");
        assert.ok(file instanceof File);
        assert.equal(file.name, "import.csv");
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url} ${method}`);
    });

    const { default: ImportPage } = await import("../src/app/customers/import/page");
    render(React.createElement(ImportPage));

    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement | null;
    assert.ok(fileInput);
    const file = new File(["external_id;phone"], "import.csv", { type: "text/csv" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: "Начать импорт" }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(alertMock.mock.calls.length, 1);
    assert.match(String(alertMock.mock.calls[0].arguments[0]), /Импорт завершён/);
  });
});
