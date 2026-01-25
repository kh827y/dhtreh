import {
  RULES_JSON_SCHEMA_VERSION,
  upgradeRulesJson,
} from '../rules-json.util';

describe('upgradeRulesJson', () => {
  it('wraps legacy array and sets schemaVersion', () => {
    const input = [{ if: { channelIn: ['WEB'] }, then: { earnBps: 700 } }];
    const result = upgradeRulesJson(input);
    expect(result.changed).toBe(true);
    expect(result.value).toEqual({
      rules: input,
      schemaVersion: RULES_JSON_SCHEMA_VERSION,
    });
  });

  it('migrates disallowEarnRedeemSameReceipt to allow flag', () => {
    const input = {
      schemaVersion: 1,
      disallowEarnRedeemSameReceipt: true,
    };
    const result = upgradeRulesJson(input);
    expect(result.changed).toBe(true);
    expect(result.value).toEqual({
      schemaVersion: RULES_JSON_SCHEMA_VERSION,
      allowEarnRedeemSameReceipt: false,
    });
  });
});
