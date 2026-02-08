import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCustomer } from "../src/app/customers/normalize";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("customers normalize", () => {
  it("не перезаписывает серверные метрики визитов локальным fallback", () => {
    const now = Date.now();
    const customer = normalizeCustomer({
      id: "c-1",
      phone: "+79990000000",
      visits: 12,
      visitFrequencyDays: 14,
      daysSinceLastVisit: 7,
      transactions: [
        {
          id: "t-1",
          type: "EARN",
          total: 500,
          datetime: new Date(now - 25 * MS_PER_DAY).toISOString(),
        },
        {
          id: "t-2",
          type: "EARN",
          total: 400,
          datetime: new Date(now - 3 * MS_PER_DAY).toISOString(),
        },
      ],
    });

    assert.equal(customer.visitFrequencyDays, 14);
    assert.equal(customer.daysSinceLastVisit, 7);
  });

  it("использует fallback из транзакций, если серверные метрики отсутствуют", () => {
    const now = Date.now();
    const first = new Date(now - 12 * MS_PER_DAY).toISOString();
    const last = new Date(now - 2 * MS_PER_DAY).toISOString();

    const customer = normalizeCustomer({
      id: "c-2",
      phone: "+79991112233",
      transactions: [
        { id: "t-1", type: "EARN", total: 300, datetime: first },
        { id: "t-2", type: "EARN", total: 600, datetime: last },
      ],
    });

    const expectedDaysSince = Math.max(
      0,
      Math.floor((Date.now() - new Date(last).getTime()) / MS_PER_DAY),
    );
    const expectedFrequency = Math.max(
      1,
      Math.round(
        (new Date(last).getTime() - new Date(first).getTime()) / MS_PER_DAY,
      ),
    );

    assert.equal(customer.daysSinceLastVisit, expectedDaysSince);
    assert.equal(customer.visitFrequencyDays, expectedFrequency);
  });
});
