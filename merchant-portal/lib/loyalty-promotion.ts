export type LoyaltyPromotionStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'PAUSED'
  | 'SCHEDULED'
  | 'COMPLETED'
  | 'ARCHIVED';

export type LoyaltyPromotionTab = 'UPCOMING' | 'ACTIVE' | 'PAST';

export interface LoyaltyPromotionApi {
  id: string;
  name: string;
  status: LoyaltyPromotionStatus;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  metadata?: any;
  reward?: { type?: string; value?: number; description?: string } | null;
  stats?: { totalUsage?: number; totalReward?: number; uniqueCustomers?: number } | null;
  pushOnStart?: boolean;
  pushReminderEnabled?: boolean;
}

export interface LoyaltyPromotionView {
  id: string;
  name: string;
  status: LoyaltyPromotionStatus;
  tab: LoyaltyPromotionTab;
  period: { start: string | null; end: string | null; label: string };
  rewardLabel: string;
  usage: { total: number; reward: number; unique: number };
  push: { onStart: boolean; reminder: boolean };
  badges: string[];
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatPeriod(start: Date | null, end: Date | null): string {
  if (!start && !end) return 'Бессрочно';
  const startLabel = start ? start.toLocaleDateString('ru-RU') : null;
  const endLabel = end ? end.toLocaleDateString('ru-RU') : null;
  if (startLabel && endLabel) return `${startLabel} — ${endLabel}`;
  if (startLabel) return `с ${startLabel}`;
  if (endLabel) return `до ${endLabel}`;
  return 'Бессрочно';
}

function normalizeLegacy(metadata: any): Record<string, any> {
  if (!metadata || typeof metadata !== 'object') return {};
  const legacy = (metadata as any).legacyCampaign;
  if (legacy && typeof legacy === 'object') return legacy as Record<string, any>;
  return metadata as Record<string, any>;
}

function resolveTab(status: LoyaltyPromotionStatus, start: Date | null, end: Date | null, now: Date): LoyaltyPromotionTab {
  const inFuture = start && start.getTime() > now.getTime();
  const finished = end && end.getTime() < now.getTime();
  if (status === 'COMPLETED' || status === 'ARCHIVED' || finished) return 'PAST';
  if (status === 'SCHEDULED' || status === 'DRAFT' || inFuture) return 'UPCOMING';
  return 'ACTIVE';
}

function formatReward(reward: LoyaltyPromotionApi['reward'], metadata: Record<string, any>): string {
  const kind = metadata.kind || reward?.type || 'CUSTOM';
  if (reward?.type === 'POINTS' && typeof reward.value === 'number') {
    return `${reward.value} баллов`;
  }
  if (reward?.type === 'PERCENT' && typeof reward.value === 'number') {
    return `${reward.value}% от суммы покупки`;
  }
  if (reward?.description) return reward.description;
  if (metadata.reward && typeof metadata.reward === 'object' && typeof metadata.reward.points === 'number') {
    return `${metadata.reward.points} баллов`;
  }
  return kind;
}

export function mapLoyaltyPromotion(source: LoyaltyPromotionApi, now: Date = new Date()): LoyaltyPromotionView {
  const start = toDate(source.startDate);
  const end = toDate(source.endDate);
  const legacy = normalizeLegacy(source.metadata);
  const tab = resolveTab(source.status, start, end, now);
  const badges: string[] = [];
  if (legacy.kind) badges.push(String(legacy.kind));
  if (!end) badges.push('Бессрочная');
  if (tab === 'UPCOMING') badges.push('Скоро старт');
  if (tab === 'PAST') badges.push('Завершена');

  const rewardLabel = formatReward(source.reward, legacy);
  const stats = source.stats ?? {};

  return {
    id: source.id,
    name: source.name,
    status: source.status,
    tab,
    period: {
      start: formatDate(start),
      end: formatDate(end),
      label: formatPeriod(start, end),
    },
    rewardLabel,
    usage: {
      total: stats.totalUsage ?? 0,
      reward: stats.totalReward ?? 0,
      unique: stats.uniqueCustomers ?? 0,
    },
    push: {
      onStart: Boolean(source.pushOnStart ?? legacy.pushOnStart),
      reminder: Boolean(source.pushReminderEnabled ?? legacy.pushReminder),
    },
    badges,
  };
}

export function mapLoyaltyPromotions(list: LoyaltyPromotionApi[], now: Date = new Date()): LoyaltyPromotionView[] {
  return list.map((item) => mapLoyaltyPromotion(item, now));
}
