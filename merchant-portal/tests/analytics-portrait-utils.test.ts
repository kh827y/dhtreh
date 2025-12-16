import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGE_RANGES,
  buildCombinedDemography,
  normalizeGenderBuckets,
  aggregateAgeRanges,
  GenderItem,
  AgeItem,
  SexAgeItem,
} from "../app/analytics/portrait/utils";

const genderSample: GenderItem[] = [
  { sex: "M", customers: 10, transactions: 20, revenue: 2000, averageCheck: 0 },
  { sex: "F", customers: 15, transactions: 25, revenue: 4000, averageCheck: 0 },
  { sex: "m", customers: 5, transactions: 5, revenue: 500, averageCheck: 0 },
];

const ageSample: AgeItem[] = [
  { age: 20, customers: 5, transactions: 5, revenue: 500, averageCheck: 100 },
  { age: 30, customers: 7, transactions: 10, revenue: 1500, averageCheck: 150 },
  { age: 60, customers: 3, transactions: 4, revenue: 800, averageCheck: 200 },
];

const sexAgeSample: SexAgeItem[] = [
  { sex: "M", age: 25, customers: 2, transactions: 2, revenue: 200, averageCheck: 0 },
  { sex: "F", age: 25, customers: 1, transactions: 1, revenue: 150, averageCheck: 0 },
  { sex: "M", age: 30, customers: 1, transactions: 3, revenue: 600, averageCheck: 0 },
];

describe("analytics portrait utils", () => {
  it("normalizes gender buckets with average checks and shares", () => {
    const buckets = normalizeGenderBuckets(genderSample);
    const male = buckets.find((b) => b.key === "M");
    const female = buckets.find((b) => b.key === "F");
    assert.ok(male && female);
    assert.equal(male.customers, 15);
    assert.equal(male.averageCheck, 100); // 2500 / 25
    assert.equal(female.averageCheck, 160); // 4000 / 25
    const totalShare = Math.round((male.share + female.share) * 10) / 10;
    assert.equal(totalShare, 100);
  });

  it("aggregates age ranges with weighted average check", () => {
    const ranges = aggregateAgeRanges(ageSample, AGE_RANGES);
    const young = ranges.find((r) => r.label === "18-24");
    const adults = ranges.find((r) => r.label === "25-34");
    const seniors = ranges.find((r) => r.label === "55+");
    assert.equal(young?.clients, 5);
    assert.equal(young?.avgCheck, 100);
    assert.equal(adults?.clients, 7);
    assert.equal(adults?.avgCheck, 150);
    assert.equal(seniors?.clients, 3);
    assert.equal(seniors?.avgCheck, 200);
  });

  it("weights average check by unique customers inside age ranges", () => {
    const skewedSample: AgeItem[] = [
      { age: 16, customers: 1, transactions: 1, revenue: 389, averageCheck: 389 },
      { age: 17, customers: 1, transactions: 5, revenue: 2930, averageCheck: 586 },
    ];
    const ranges = aggregateAgeRanges(skewedSample, AGE_RANGES);
    const teens = ranges.find((r) => r.label === "До 18");
    assert.ok(teens);
    assert.equal(teens?.clients, 2);
    assert.equal(teens?.avgCheck, 553); // (389 + 2930) / (1 + 5) ≈ 553.17
  });

  it("builds combined demography per age and sex", () => {
    const combined = buildCombinedDemography(sexAgeSample);
    assert.equal(combined.length, 2);
    const age25 = combined.find((row) => row.age === "25");
    const age30 = combined.find((row) => row.age === "30");
    assert.ok(age25 && age30);
    assert.equal(age25.male_clients, 2);
    assert.equal(age25.female_clients, 1);
    assert.equal(age25.male_avg_check, 100);
    assert.equal(age25.female_avg_check, 150);
    assert.equal(age30.male_clients, 1);
    assert.equal(age30.male_avg_check, 200);
    assert.equal(age30.female_clients, 0);
  });
});
