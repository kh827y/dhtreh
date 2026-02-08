import {
  ensureRulesRoot,
  getRulesRoot,
  getRulesSection,
  setRulesSection,
  type RulesJson,
} from './rules-json.util';

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const normalizeSupportTelegramInput = (value: unknown): string | null =>
  normalizeOptionalString(value);

export const readSupportTelegramFromRules = (
  rulesJson: unknown,
): string | null => {
  const root = getRulesRoot(rulesJson) ?? {};
  const miniapp = getRulesSection(root, 'miniapp');
  return normalizeOptionalString(miniapp?.supportTelegram);
};

export const readReviewsEnabledFromRules = (
  rulesJson: unknown,
  fallback = true,
): boolean => {
  const root = getRulesRoot(rulesJson) ?? {};
  const reviews = getRulesSection(root, 'reviews');
  if (reviews && reviews.enabled !== undefined) return Boolean(reviews.enabled);
  return fallback;
};

export const withSupportTelegramInRules = (
  rulesJson: unknown,
  supportTelegram: string | null,
): RulesJson => {
  const root = ensureRulesRoot(rulesJson);
  const miniapp = { ...(getRulesSection(root, 'miniapp') ?? {}) };
  miniapp.supportTelegram = supportTelegram;
  return setRulesSection(root, 'miniapp', miniapp);
};

export const readPublicMiniappSettings = (rulesJson: unknown) => ({
  supportTelegram: readSupportTelegramFromRules(rulesJson),
  reviewsEnabled: readReviewsEnabledFromRules(rulesJson, true),
});
