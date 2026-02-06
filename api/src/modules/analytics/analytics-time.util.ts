import type { RussiaTimezone } from '../../shared/timezone/russia-timezones';
import type { DashboardPeriod, TimeGrouping } from './analytics.service';

export const resolveGrouping = (
  period: DashboardPeriod,
  requested?: TimeGrouping,
): TimeGrouping => {
  if (requested === 'day' || requested === 'week' || requested === 'month') {
    return requested;
  }
  const totalDays = Math.max(
    1,
    Math.ceil(
      (period.to.getTime() - period.from.getTime()) / (1000 * 60 * 60 * 24),
    ),
  );
  if (totalDays > 210) return 'month';
  if (totalDays > 45) return 'week';
  return 'day';
};

export const getPreviousPeriod = (period: DashboardPeriod): DashboardPeriod => {
  const duration = period.to.getTime() - period.from.getTime();
  const previousTo = new Date(period.from.getTime() - 1);
  return {
    from: new Date(previousTo.getTime() - duration),
    to: previousTo,
    type: period.type,
  };
};

export const formatDateLabel = (
  date: Date,
  timezone: RussiaTimezone,
): string => {
  const local = new Date(
    date.getTime() + timezone.utcOffsetMinutes * 60 * 1000,
  );
  const year = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day = String(local.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const truncateForTimezone = (
  date: Date,
  grouping: TimeGrouping,
  timezone: RussiaTimezone,
): Date => {
  const local = new Date(
    date.getTime() + timezone.utcOffsetMinutes * 60 * 1000,
  );
  local.setUTCHours(0, 0, 0, 0);
  if (grouping === 'week') {
    const day = local.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    local.setUTCDate(local.getUTCDate() + diff);
  } else if (grouping === 'month') {
    local.setUTCDate(1);
  }
  return new Date(local.getTime() - timezone.utcOffsetMinutes * 60 * 1000);
};

export const truncateDate = (value: Date, grouping: TimeGrouping): Date => {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  if (grouping === 'week') {
    const day = date.getUTCDay();
    const offset = (day + 6) % 7;
    date.setUTCDate(date.getUTCDate() - offset);
  } else if (grouping === 'month') {
    date.setUTCDate(1);
  }
  return date;
};

export const advanceDate = (
  value: Date,
  grouping: TimeGrouping,
  timezone: RussiaTimezone,
): Date => {
  const offsetMs = timezone.utcOffsetMinutes * 60 * 1000;
  const local = new Date(value.getTime() + offsetMs);
  if (grouping === 'week') {
    local.setUTCDate(local.getUTCDate() + 7);
  } else if (grouping === 'month') {
    local.setUTCMonth(local.getUTCMonth() + 1);
    local.setUTCDate(1);
  } else {
    local.setUTCDate(local.getUTCDate() + 1);
  }
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offsetMs);
};
