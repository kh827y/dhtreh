import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRfmCombinations,
  getCombinationBadgeClass,
  parseRfmClass,
  sumCombinations,
} from "../app/analytics/rfm/utils";

describe("rfm utils", () => {
  it("parses valid rfm classes", () => {
    assert.deepEqual(parseRfmClass("5-4-4"), { r: 5, f: 4, m: 4 });
    assert.deepEqual(parseRfmClass(" 1-1-1 "), { r: 1, f: 1, m: 1 });
  });

  it("returns null for invalid rfm classes", () => {
    assert.equal(parseRfmClass(""), null);
    assert.equal(parseRfmClass("1-2"), null);
    assert.equal(parseRfmClass("0-1-1"), null);
    assert.equal(parseRfmClass("6-1-1"), null);
    assert.equal(parseRfmClass("x-y-z"), null);
  });

  it("builds combinations from distribution", () => {
    const combos = buildRfmCombinations([
      { class: "5-4-4", customers: 10 },
      { class: "bad", customers: 999 },
      { class: "3-2-1", customers: 0 },
    ]);
    assert.deepEqual(combos, [{ r: 5, f: 4, m: 4, count: 10 }]);
  });

  it("computes badge color by avg score", () => {
    assert.equal(getCombinationBadgeClass({ r: 5, f: 5, m: 4 }), "bg-green-100 text-green-700");
    assert.equal(getCombinationBadgeClass({ r: 2, f: 2, m: 2 }), "bg-red-100 text-red-700");
    assert.equal(getCombinationBadgeClass({ r: 3, f: 3, m: 2 }), "bg-yellow-100 text-yellow-700");
  });

  it("sums combinations", () => {
    assert.equal(sumCombinations([{ count: 2 }, { count: 3 }]), 5);
  });
});
