import {
  getJsonSchemaVersion,
  setJsonSchemaVersion,
  withJsonSchemaVersion,
} from './json-version.util';

export type RulesJson = Record<string, unknown>;

// Minimal schema map for documentation and safe access patterns.
export const RULES_JSON_SCHEMA = {
  schemaVersion: 'number',
  rules: [
    {
      if: { channelIn: ['string'], minEligible: 'number' },
      then: { earnBps: 'number', redeemLimitBps: 'number' },
    },
  ],
  af: {
    customer: {
      limit: 'number',
      windowSec: 'number',
      dailyCap: 'number',
      weeklyCap: 'number',
      monthlyCap: 'number',
      pointsCap: 'number',
      blockDaily: 'boolean',
    },
    outlet: {
      limit: 'number',
      windowSec: 'number',
      dailyCap: 'number',
      weeklyCap: 'number',
    },
    device: {
      limit: 'number',
      windowSec: 'number',
      dailyCap: 'number',
      weeklyCap: 'number',
    },
    staff: {
      limit: 'number',
      windowSec: 'number',
      dailyCap: 'number',
      weeklyCap: 'number',
    },
    merchant: {
      limit: 'number',
      windowSec: 'number',
      dailyCap: 'number',
      weeklyCap: 'number',
    },
    blockFactors: ['string'],
    reset: {
      merchant: 'iso',
      outlet: { id: 'iso' },
      device: { id: 'iso' },
      staff: { id: 'iso' },
      customer: { id: 'iso' },
    },
  },
  registration: {
    enabled: 'boolean',
    points: 'number',
    ttlDays: 'number',
    delayDays: 'number',
    delayHours: 'number',
    enabledAt: 'iso',
    pushEnabled: 'boolean',
    text: 'string',
  },
  birthday: {
    enabled: 'boolean',
    daysBefore: 'number',
    onlyBuyers: 'boolean',
    text: 'string',
    giftPoints: 'number',
    giftTtlDays: 'number',
  },
  autoReturn: {
    enabled: 'boolean',
    days: 'number',
    text: 'string',
    giftPoints: 'number',
    giftTtlDays: 'number',
    giftEnabled: 'boolean',
    giftBurnEnabled: 'boolean',
    repeat: { enabled: 'boolean', days: 'number' },
  },
  burnReminder: { enabled: 'boolean', daysBefore: 'number', text: 'string' },
  reviews: { enabled: 'boolean' },
  reviewsShare: {
    enabled: 'boolean',
    threshold: 'number',
    platforms: 'object',
  },
  levelsPeriodDays: 'number',
  allowEarnRedeemSameReceipt: 'boolean',
  disallowEarnRedeemSameReceipt: 'boolean',
  miniapp: { supportTelegram: 'string' },
  staffNotify: 'object',
  staffNotifyMeta: 'object',
  staffNotifyDigest: { lastSentLocalDate: 'string', lastSentAt: 'string' },
  rfm: {
    recency: { mode: 'auto|manual', recencyDays: 'number' },
    frequency: { mode: 'auto|manual', threshold: 'number' },
    monetary: { mode: 'auto|manual', threshold: 'number' },
  },
} as const;

export const RULES_JSON_SCHEMA_VERSION = 2;

const isPlainObject = (value: unknown): value is RulesJson =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type RulesUpgradeResult = {
  value: RulesJson | null;
  changed: boolean;
  fromVersion: number | null;
  toVersion: number;
};

const normalizeRulesShape = (rulesJson: unknown): RulesJson | null => {
  if (rulesJson == null) return null;
  if (Array.isArray(rulesJson)) {
    return { rules: rulesJson } as RulesJson;
  }
  if (!isPlainObject(rulesJson)) return null;
  return { ...(rulesJson as Record<string, unknown>) } as RulesJson;
};

export const upgradeRulesJson = (
  rulesJson: unknown,
  targetVersion: number = RULES_JSON_SCHEMA_VERSION,
): RulesUpgradeResult => {
  const normalized = normalizeRulesShape(rulesJson);
  if (!normalized) {
    return {
      value: null,
      changed: false,
      fromVersion: null,
      toVersion: targetVersion,
    };
  }

  let changed = false;
  let root: RulesJson = { ...(normalized as Record<string, unknown>) };
  const fromVersion = getJsonSchemaVersion(root);

  if (Array.isArray(rulesJson)) {
    changed = true;
  }

  if (!fromVersion || fromVersion < 2) {
    const disallowKey = 'disallowEarnRedeemSameReceipt';
    if (
      Object.prototype.hasOwnProperty.call(root, disallowKey) &&
      root.allowEarnRedeemSameReceipt === undefined
    ) {
      const disallow = Boolean(root[disallowKey]);
      root.allowEarnRedeemSameReceipt = !disallow;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(root, disallowKey)) {
      delete root[disallowKey];
      changed = true;
    }
  }

  if (fromVersion !== targetVersion) {
    root = setJsonSchemaVersion(
      root as Record<string, unknown>,
      targetVersion,
    ) as RulesJson;
    changed = true;
  }

  return {
    value: root,
    changed,
    fromVersion: fromVersion ?? null,
    toVersion: targetVersion,
  };
};

export const migrateRulesJson = (rulesJson: unknown): RulesJson | null =>
  upgradeRulesJson(rulesJson).value;

export const getRulesRoot = (rulesJson: unknown): RulesJson | null =>
  upgradeRulesJson(rulesJson).value;

export const ensureRulesRoot = (rulesJson: unknown): RulesJson => {
  const migrated = migrateRulesJson(rulesJson);
  if (migrated) return migrated;
  return withJsonSchemaVersion({}, RULES_JSON_SCHEMA_VERSION) as RulesJson;
};

export const getRulesSchemaVersion = (rulesJson: unknown): number | null =>
  getJsonSchemaVersion(getRulesRoot(rulesJson));

export const getRulesSection = (
  rulesJson: unknown,
  key: string,
): RulesJson | null => {
  const root = getRulesRoot(rulesJson);
  const section = root ? root[key] : undefined;
  return isPlainObject(section) ? (section as RulesJson) : null;
};

export const setRulesSection = (
  rulesJson: unknown,
  key: string,
  section: RulesJson | null,
): RulesJson => {
  const root = ensureRulesRoot(rulesJson);
  if (section === null) {
    delete root[key];
  } else {
    root[key] = section;
  }
  return root;
};

export const setRulesValue = (
  rulesJson: unknown,
  key: string,
  value: unknown,
): RulesJson => {
  const root = ensureRulesRoot(rulesJson);
  if (value === undefined || value === null) {
    delete root[key];
    return root;
  }
  root[key] = value;
  return root;
};
