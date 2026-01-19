import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatRangeLabel } from "../src/lib/format-range";

describe("formatRangeLabel", () => {
  it("formats day buckets without неразрывные пробелы", () => {
    const label = formatRangeLabel("2024-12-16", "day", "Europe/Moscow");
    assert.equal(label, "16 дек.");
    assert.equal(label.includes("\u00a0"), false);
  });

  it("formats week ranges inside a single month", () => {
    const label = formatRangeLabel("2024-12-16", "week", "Europe/Moscow");
    assert.equal(label, "16-22 дек.");
  });

  it("formats week ranges across months", () => {
    const label = formatRangeLabel("2025-01-27", "week", "Europe/Moscow");
    assert.equal(label, "27 янв. - 2 февр.");
  });

  it("formats month ranges with correct ending", () => {
    const label = formatRangeLabel("2025-02-01", "month", "Europe/Moscow");
    assert.equal(label, "1-28 февраля");
  });

  it("returns the source bucket for invalid values", () => {
    assert.equal(formatRangeLabel("n/a", "week", "Europe/Moscow"), "n/a");
  });
});
