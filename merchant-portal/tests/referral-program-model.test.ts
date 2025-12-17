import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_REFERRAL_PROGRAM_FORM,
  buildReferralProgramPayload,
  mapReferralProgramApiToForm,
  validateReferralProgramForm,
  type ReferralProgramFormState,
} from "../app/referrals/program/referral-program-model";

describe("referral program model", () => {
  it("маппит API → форму и нормализует значения", () => {
    const form = mapReferralProgramApiToForm({
      enabled: true,
      rewardTrigger: "all",
      rewardType: "percent",
      multiLevel: true,
      levels: [
        { level: 1, reward: 110 },
        { level: 2, reward: 12.3456 },
        { level: 3, reward: -5 },
      ],
      friendReward: 5.5555,
      stackWithRegistration: true,
      message: "  hello  ",
      shareMessageTemplate: " share ",
      minPurchaseAmount: 12.6,
    });

    assert.equal(form.isEnabled, true);
    assert.equal(form.rewardTrigger, "all");
    assert.equal(form.rewardType, "percent");
    assert.equal(form.isMultiLevel, true);
    assert.equal(form.levels[0].value, 100);
    assert.equal(form.levels[1].value, 12.3456);
    assert.equal(form.levels[2].value, 0);
    assert.equal(form.friendReward, 5.56);
    assert.equal(form.stackWithRegistration, true);
    assert.equal(form.inviteCtaText, "hello");
    assert.equal(form.shareMessageText, "share");
    assert.equal(form.minOrderAmount, 13);
  });

  it("валидирует поощрение при включенной механике", () => {
    const zeroLevels: ReferralProgramFormState["levels"] = [
      { level: 1, value: 0 },
      { level: 2, value: 0 },
      { level: 3, value: 0 },
    ];

    assert.equal(
      validateReferralProgramForm({ ...DEFAULT_REFERRAL_PROGRAM_FORM, isEnabled: false, levels: zeroLevels }),
      null,
    );

    assert.equal(
      validateReferralProgramForm({
        ...DEFAULT_REFERRAL_PROGRAM_FORM,
        isEnabled: true,
        rewardType: "fixed",
        isMultiLevel: false,
        levels: [
          { level: 1, value: 0 },
          { level: 2, value: 50 },
          { level: 3, value: 25 },
        ],
      }),
      "Укажите размер поощрения больше 0",
    );

    assert.equal(
      validateReferralProgramForm({
        ...DEFAULT_REFERRAL_PROGRAM_FORM,
        isEnabled: true,
        rewardType: "percent",
        isMultiLevel: true,
        levels: [
          { level: 1, value: 10 },
          { level: 2, value: 0 },
          { level: 3, value: 1 },
        ],
      }),
      "Укажите процент поощрения больше 0",
    );
  });

  it("строит payload для single-level", () => {
    const payload = buildReferralProgramPayload({
      ...DEFAULT_REFERRAL_PROGRAM_FORM,
      isEnabled: true,
      isMultiLevel: false,
      rewardType: "percent",
      levels: [
        { level: 1, value: 155 },
        { level: 2, value: 50 },
        { level: 3, value: 25 },
      ],
      minOrderAmount: -10,
    });

    assert.equal(payload.multiLevel, false);
    if (payload.multiLevel) throw new Error("Expected single-level payload");
    assert.equal(payload.rewardValue, 100);
    assert.equal(payload.minPurchaseAmount, 0);
    assert.ok(!("levels" in payload));
  });

  it("строит payload для multi-level (3 уровня UI → 5 уровней API)", () => {
    const payload = buildReferralProgramPayload({
      ...DEFAULT_REFERRAL_PROGRAM_FORM,
      isEnabled: true,
      isMultiLevel: true,
      rewardType: "fixed",
      levels: [
        { level: 1, value: 300 },
        { level: 2, value: 150.2 },
        { level: 3, value: 0 },
      ],
      minOrderAmount: 99.5,
      friendReward: 10.239,
    });

    assert.equal(payload.multiLevel, true);
    if (!payload.multiLevel) throw new Error("Expected multi-level payload");
    assert.equal(payload.minPurchaseAmount, 100);
    assert.equal(payload.friendReward, 10.24);
    assert.equal(payload.levels.length, 5);
    assert.deepEqual(payload.levels[0], { level: 1, enabled: true, reward: 300 });
    assert.deepEqual(payload.levels[1], { level: 2, enabled: true, reward: 150.2 });
    assert.deepEqual(payload.levels[2], { level: 3, enabled: true, reward: 0 });
    assert.deepEqual(payload.levels[3], { level: 4, enabled: false, reward: 0 });
    assert.deepEqual(payload.levels[4], { level: 5, enabled: false, reward: 0 });
  });
});

