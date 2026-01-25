import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  DashboardPeriod,
  TimeGrouping,
} from '../../analytics/analytics.service';
import type { OperationsLogFilters } from '../services/operations-log.service';
import type { PortalPermissionsState, PortalRequest } from '../portal.types';
import {
  asRecord as asRecordShared,
  coerceCount as coerceCountShared,
  coerceNumber as coerceNumberShared,
  coerceString as coerceStringShared,
} from '../../../shared/common/input.util';

@Injectable()
export class PortalRequestHelper {
  getMerchantId(req: PortalRequest) {
    return String(req.portalMerchantId || '');
  }

  getTimezoneOffsetMinutes(req: PortalRequest): number {
    const raw = Number(req?.portalTimezoneOffsetMinutes ?? NaN);
    if (Number.isFinite(raw)) return raw;
    return 7 * 60; // default Барнаул (UTC+7)
  }

  shiftToTimezone(date: Date, offsetMinutes: number) {
    return new Date(date.getTime() + offsetMinutes * 60 * 1000);
  }

  shiftFromTimezone(date: Date, offsetMinutes: number) {
    return new Date(date.getTime() - offsetMinutes * 60 * 1000);
  }

  parseLocalDate(
    value: string,
    offsetMinutes: number,
    endOfDay = false,
  ): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!year || !month || !day) return null;
    const date = new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0,
      ),
    );
    return this.shiftFromTimezone(date, offsetMinutes);
  }

  parseDateParam(
    req: PortalRequest,
    value?: string,
    endOfDay = false,
  ): Date | undefined {
    if (!value) return undefined;
    const raw = String(value).trim();
    if (!raw) return undefined;
    const offset = this.getTimezoneOffsetMinutes(req);
    const local = this.parseLocalDate(raw, offset, endOfDay);
    const parsed = local ?? new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Некорректный формат даты');
    }
    return parsed;
  }

  parseLimit(
    value: string | number | undefined,
    options?: { defaultValue?: number; min?: number; max?: number },
  ): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    const fallback = options?.defaultValue ?? 50;
    const min = options?.min ?? 1;
    const max = options?.max ?? 200;
    const resolved = Number.isFinite(parsed) ? parsed : fallback;
    return Math.min(Math.max(resolved, min), max);
  }

  parseOptionalLimit(
    value: string | number | undefined,
    options?: { defaultValue?: number; min?: number; max?: number },
  ): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    return this.parseLimit(value, options);
  }

  parseOffset(value: string | number | undefined, defaultValue = 0): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    const resolved = Number.isFinite(parsed) ? parsed : defaultValue;
    return Math.max(0, resolved);
  }

  normalizePromocodePayload(
    req: PortalRequest,
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    const offset = this.getTimezoneOffsetMinutes(req);
    const payload: Record<string, unknown> = { ...body };
    const validFrom = typeof body?.validFrom === 'string' ? body.validFrom : '';
    const validUntil =
      typeof body?.validUntil === 'string' ? body.validUntil : '';
    if (validFrom) {
      const parsed = this.parseLocalDate(validFrom, offset, false);
      if (parsed) payload.validFrom = parsed.toISOString();
    }
    if (validUntil) {
      const parsed = this.parseLocalDate(validUntil, offset, true);
      if (parsed) payload.validUntil = parsed.toISOString();
    }
    return payload;
  }

  computePeriod(
    req: PortalRequest,
    periodType?: string,
    fromStr?: string,
    toStr?: string,
  ): DashboardPeriod {
    const offset = this.getTimezoneOffsetMinutes(req);
    if (fromStr && toStr) {
      const from = this.parseLocalDate(fromStr, offset, false);
      const to = this.parseLocalDate(toStr, offset, true);
      if (from && to) {
        if (from.getTime() > to.getTime()) {
          const maxRangeDays = 366;
          const rangeMs = from.getTime() - to.getTime();
          const maxRangeMs = maxRangeDays * 24 * 60 * 60 * 1000;
          if (rangeMs > maxRangeMs) {
            throw new BadRequestException(
              'Слишком большой период. Максимум 1 год.',
            );
          }
          return { from: to, to: from, type: 'custom' };
        }
        const maxRangeDays = 366;
        const rangeMs = to.getTime() - from.getTime();
        const maxRangeMs = maxRangeDays * 24 * 60 * 60 * 1000;
        if (rangeMs > maxRangeMs) {
          throw new BadRequestException(
            'Слишком большой период. Максимум 1 год.',
          );
        }
        return { from, to, type: 'custom' };
      }
    }

    const now = new Date();
    const localNow = this.shiftToTimezone(now, offset);
    const fromLocal = new Date(localNow);
    let toLocal = new Date(localNow);

    switch (periodType) {
      case 'yesterday':
        fromLocal.setUTCDate(fromLocal.getUTCDate() - 1);
        fromLocal.setUTCHours(0, 0, 0, 0);
        toLocal = new Date(fromLocal);
        toLocal.setUTCHours(23, 59, 59, 999);
        break;
      case 'day':
        fromLocal.setUTCHours(0, 0, 0, 0);
        toLocal.setUTCHours(23, 59, 59, 999);
        break;
      case 'week': {
        const dayOfWeek = fromLocal.getUTCDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        fromLocal.setUTCDate(fromLocal.getUTCDate() + diff);
        fromLocal.setUTCHours(0, 0, 0, 0);
        toLocal = new Date(fromLocal);
        toLocal.setUTCDate(toLocal.getUTCDate() + 6);
        toLocal.setUTCHours(23, 59, 59, 999);
        break;
      }
      case 'month':
        fromLocal.setUTCDate(1);
        fromLocal.setUTCHours(0, 0, 0, 0);
        toLocal = new Date(fromLocal);
        toLocal.setUTCMonth(toLocal.getUTCMonth() + 1);
        toLocal.setUTCDate(0);
        toLocal.setUTCHours(23, 59, 59, 999);
        break;
      case 'quarter': {
        const quarter = Math.floor(fromLocal.getUTCMonth() / 3);
        fromLocal.setUTCMonth(quarter * 3, 1);
        fromLocal.setUTCHours(0, 0, 0, 0);
        toLocal = new Date(fromLocal);
        toLocal.setUTCMonth(toLocal.getUTCMonth() + 3);
        toLocal.setUTCDate(0);
        toLocal.setUTCHours(23, 59, 59, 999);
        break;
      }
      case 'year':
        fromLocal.setUTCMonth(0, 1);
        fromLocal.setUTCHours(0, 0, 0, 0);
        toLocal = new Date(fromLocal);
        toLocal.setUTCMonth(11, 31);
        toLocal.setUTCHours(23, 59, 59, 999);
        break;
      default:
        fromLocal.setUTCDate(1);
        fromLocal.setUTCHours(0, 0, 0, 0);
        toLocal = new Date(fromLocal);
        toLocal.setUTCMonth(toLocal.getUTCMonth() + 1);
        toLocal.setUTCDate(0);
        toLocal.setUTCHours(23, 59, 59, 999);
        break;
    }

    const normalized: DashboardPeriod['type'] =
      periodType === 'yesterday' ||
      periodType === 'day' ||
      periodType === 'week' ||
      periodType === 'month' ||
      periodType === 'quarter' ||
      periodType === 'year'
        ? (periodType as DashboardPeriod['type'])
        : 'month';

    return {
      from: this.shiftFromTimezone(fromLocal, offset),
      to: this.shiftFromTimezone(toLocal, offset),
      type: normalized,
    };
  }

  normalizeGrouping(value?: string): TimeGrouping | undefined {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'week') return 'week';
    if (normalized === 'month') return 'month';
    if (normalized === 'day') return 'day';
    return undefined;
  }

  normalizeDirection(direction?: string): OperationsLogFilters['direction'] {
    const upper = String(direction || '').toUpperCase();
    if (upper === 'EARN' || upper === 'REDEEM') return upper;
    return 'ALL';
  }

  normalizeStaffStatus(status?: string): OperationsLogFilters['staffStatus'] {
    const value = String(status || '').toLowerCase();
    if (value === 'current' || value === 'active') return 'current';
    if (value === 'former' || value === 'fired' || value === 'archived')
      return 'former';
    return 'all';
  }

  asRecord(value: unknown): Record<string, unknown> {
    return asRecordShared(value) ?? {};
  }

  coerceCount(value: unknown): number {
    return coerceCountShared(value);
  }

  coerceNumber(value: unknown): number | null {
    return coerceNumberShared(value);
  }

  coerceString(value: unknown): string | null {
    return coerceStringShared(value);
  }

  normalizePortalPermissions(state?: PortalPermissionsState | null) {
    if (!state) return null;
    if (state.allowAll) {
      return { '*': ['*'] } as Record<string, string[]>;
    }
    const entries = Array.isArray(state.resources)
      ? state.resources
      : state.resources instanceof Map
        ? Array.from(state.resources.entries())
        : Object.entries(this.asRecord(state.resources));
    const result: Record<string, string[]> = {};
    for (const [resource, actionsRaw] of entries) {
      if (!resource) continue;
      const actionsRecord = this.asRecord(actionsRaw);
      const actions = Array.isArray(actionsRaw)
        ? actionsRaw.filter((item) => typeof item === 'string')
        : Object.keys(actionsRecord);
      if (actions.length > 0) {
        result[String(resource)] = actions as string[];
      }
    }
    return result;
  }
}
