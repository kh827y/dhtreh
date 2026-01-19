export type RewardTrigger = "first" | "all";
export type RewardType = "fixed" | "percent";

export type ReferralProgramFormLevel = { level: 1 | 2 | 3; value: number };

export type ReferralProgramFormState = {
  isEnabled: boolean;
  rewardTrigger: RewardTrigger;
  rewardType: RewardType;
  isMultiLevel: boolean;
  levels: [ReferralProgramFormLevel, ReferralProgramFormLevel, ReferralProgramFormLevel];
  minOrderAmount: number;
  friendReward: number;
  stackWithRegistration: boolean;
  inviteCtaText: string;
  shareMessageText: string;
};

export type ReferralProgramSettingsApi = {
  enabled?: boolean;
  rewardTrigger?: RewardTrigger;
  rewardType?: RewardType;
  multiLevel?: boolean;
  rewardValue?: number;
  levels?: Array<{ level: number; enabled?: boolean; reward?: number }>;
  friendReward?: number;
  stackWithRegistration?: boolean;
  message?: string;
  shareMessageTemplate?: string;
  minPurchaseAmount?: number;
  [key: string]: unknown;
};

export const REFERRAL_PLACEHOLDERS = ["{businessname}", "{bonusamount}", "{code}", "{link}"] as const;

export type ReferralProgramPayloadBase = {
  enabled: boolean;
  rewardTrigger: RewardTrigger;
  rewardType: RewardType;
  multiLevel: boolean;
  friendReward: number;
  stackWithRegistration: boolean;
  message: string;
  placeholders: string[];
  shareMessage: string;
  minPurchaseAmount: number;
};

export type ReferralProgramMultiLevelPayload = ReferralProgramPayloadBase & {
  multiLevel: true;
  levels: Array<{ level: number; enabled: boolean; reward: number }>;
};

export type ReferralProgramSingleLevelPayload = ReferralProgramPayloadBase & {
  multiLevel: false;
  rewardValue: number;
};

export type ReferralProgramPayload = ReferralProgramMultiLevelPayload | ReferralProgramSingleLevelPayload;

export const DEFAULT_REFERRAL_PROGRAM_FORM: ReferralProgramFormState = {
  isEnabled: true,
  rewardTrigger: "first",
  rewardType: "fixed",
  isMultiLevel: false,
  levels: [
    { level: 1, value: 100 },
    { level: 2, value: 50 },
    { level: 3, value: 25 },
  ],
  minOrderAmount: 0,
  friendReward: 300,
  stackWithRegistration: true,
  inviteCtaText:
    "Расскажите друзьям о нашей программе и получите бонус. Делитесь ссылкой {link} или вашим кодом {code}.",
  shareMessageText:
    "Переходите по ссылке {link} и получите {bonusamount} бонусов на баланс в программе лояльности {businessname}",
};

function roundTwo(value: number) {
  return Math.round(value * 100) / 100;
}

function coerceFiniteNumber(value: unknown, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

function clampNonNegative(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function clampReward(value: number, rewardType: RewardType) {
  const nonNegative = clampNonNegative(value);
  if (rewardType === "percent") return Math.min(100, nonNegative);
  return nonNegative;
}

function normalizeText(value: unknown, fallback: string, maxLen: number) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

function rewardForLevel(levels: ReferralProgramSettingsApi["levels"], level: 1 | 2 | 3) {
  const list = Array.isArray(levels) ? levels : [];
  const found = list.find((item) => Number(item?.level) === level);
  return found ? Number(found.reward) : undefined;
}

export function mapReferralProgramApiToForm(
  api: ReferralProgramSettingsApi,
  fallback: ReferralProgramFormState = DEFAULT_REFERRAL_PROGRAM_FORM,
): ReferralProgramFormState {
  const rewardTrigger: RewardTrigger = api?.rewardTrigger === "all" ? "all" : "first";
  const rewardType: RewardType = api?.rewardType === "percent" ? "percent" : "fixed";
  const isMultiLevel = Boolean(api?.multiLevel);
  const minOrderAmount = Math.max(0, Math.round(coerceFiniteNumber(api?.minPurchaseAmount, fallback.minOrderAmount)));
  const friendReward = roundTwo(clampNonNegative(coerceFiniteNumber(api?.friendReward, fallback.friendReward)));
  const stackWithRegistration = Boolean(api?.stackWithRegistration);
  const inviteCtaText = normalizeText(api?.message, fallback.inviteCtaText, 200);
  const shareMessageText = normalizeText(api?.shareMessageTemplate, fallback.shareMessageText, 300);

  const currentLevels: ReferralProgramFormState["levels"] = [
    { level: 1, value: fallback.levels[0].value },
    { level: 2, value: fallback.levels[1].value },
    { level: 3, value: fallback.levels[2].value },
  ];

  if (isMultiLevel) {
    const level1 = rewardForLevel(api?.levels, 1);
    const level2 = rewardForLevel(api?.levels, 2);
    const level3 = rewardForLevel(api?.levels, 3);
    currentLevels[0].value = clampReward(coerceFiniteNumber(level1, currentLevels[0].value), rewardType);
    currentLevels[1].value = clampReward(coerceFiniteNumber(level2, currentLevels[1].value), rewardType);
    currentLevels[2].value = clampReward(coerceFiniteNumber(level3, currentLevels[2].value), rewardType);
  } else {
    const rewardValue = coerceFiniteNumber(api?.rewardValue, currentLevels[0].value);
    currentLevels[0].value = clampReward(rewardValue, rewardType);
  }

  return {
    isEnabled: Boolean(api?.enabled),
    rewardTrigger,
    rewardType,
    isMultiLevel,
    levels: currentLevels,
    minOrderAmount,
    friendReward,
    stackWithRegistration,
    inviteCtaText,
    shareMessageText,
  };
}

export function validateReferralProgramForm(form: ReferralProgramFormState): string | null {
  if (!form.isEnabled) return null;

  const levels = form.isMultiLevel ? form.levels : [form.levels[0]];
  for (const level of levels) {
    const reward = clampReward(level.value, form.rewardType);
    if (reward <= 0) {
      return form.rewardType === "percent"
        ? "Укажите процент поощрения больше 0"
        : "Укажите размер поощрения больше 0";
    }
  }

  return null;
}

export function buildReferralProgramPayload(form: ReferralProgramFormState): ReferralProgramPayload {
  const minPurchaseAmount = form.minOrderAmount > 0 ? Math.round(clampNonNegative(form.minOrderAmount)) : 0;
  const friendReward = roundTwo(clampNonNegative(form.friendReward));
  const message = String(form.inviteCtaText || "").trim();
  const shareMessage = String(form.shareMessageText || "").trim();

  const base: ReferralProgramPayloadBase = {
    enabled: form.isEnabled,
    rewardTrigger: form.rewardTrigger,
    rewardType: form.rewardType,
    multiLevel: form.isMultiLevel,
    friendReward,
    stackWithRegistration: form.stackWithRegistration,
    message,
    placeholders: [...REFERRAL_PLACEHOLDERS],
    shareMessage,
    minPurchaseAmount,
  };

  if (form.isMultiLevel) {
    const levels: ReferralProgramMultiLevelPayload["levels"] = [];
    for (let level = 1; level <= 5; level += 1) {
      const isShown = level <= 3;
      const formValue = isShown ? form.levels[level - 1]!.value : 0;
      const reward = roundTwo(clampReward(formValue, form.rewardType));
      levels.push({ level, enabled: isShown, reward });
    }
    return { ...base, multiLevel: true, levels };
  }

  return {
    ...base,
    multiLevel: false,
    rewardValue: roundTwo(clampReward(form.levels[0].value, form.rewardType)),
  };
}

