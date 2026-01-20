import { Injectable } from '@nestjs/common';

@Injectable()
export class AppConfigService {
  getString(key: string, fallback?: string): string | undefined {
    const value = process.env[key];
    if (value === undefined || value === '') return fallback;
    return value;
  }

  getNumber(key: string, fallback?: number): number | undefined {
    const raw = this.getString(key);
    if (raw === undefined) return fallback;
    const num = Number(raw);
    return Number.isFinite(num) ? num : fallback;
  }

  getBoolean(key: string, fallback = false): boolean {
    const raw = this.getString(key);
    if (raw === undefined) return fallback;
    const normalized = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
  }

  getJson<T = unknown>(key: string, fallback?: T): T | undefined {
    const raw = this.getString(key);
    if (raw === undefined) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
}
