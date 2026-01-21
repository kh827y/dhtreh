import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../core/config/app-config.service';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';

type CacheEntry<T> = {
  value?: T;
  pending?: Promise<T>;
  expiresAt: number;
};

@Injectable()
export class AnalyticsCacheService {
  private readonly logger = new Logger(AnalyticsCacheService.name);
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(private readonly config: AppConfigService) {
    const ttl = this.config.getNumber('ANALYTICS_CACHE_TTL_MS', 60000) ?? 60000;
    const max = this.config.getNumber('ANALYTICS_CACHE_MAX', 1000) ?? 1000;
    this.ttlMs = Math.max(1000, Math.floor(ttl));
    this.maxEntries = Math.max(100, Math.floor(max));
  }

  private prune() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
    if (this.cache.size > this.maxEntries) {
      this.cache.clear();
      this.logger.warn('Analytics cache cleared due to size limit');
    }
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async getOrSet<T>(
    key: string,
    compute: () => Promise<T>,
    ttlMs: number = this.ttlMs,
  ): Promise<T> {
    const existing = this.cache.get(key) as CacheEntry<T> | undefined;
    if (existing?.value !== undefined && existing.expiresAt > Date.now()) {
      return existing.value;
    }
    if (existing?.pending) {
      return existing.pending;
    }
    const pending = compute()
      .then((value) => {
        this.cache.set(key, {
          value,
          expiresAt: Date.now() + ttlMs,
        });
        this.prune();
        return value;
      })
      .catch((err) => {
        this.cache.delete(key);
        logIgnoredError(err, 'Analytics cache compute failed', this.logger, 'debug');
        throw err;
      });
    this.cache.set(key, {
      pending,
      expiresAt: Date.now() + ttlMs,
    });
    return pending;
  }

  set<T>(key: string, value: T, ttlMs: number = this.ttlMs) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
    this.prune();
  }

  invalidate(prefix: string) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  getDefaultTtlMs() {
    return this.ttlMs;
  }
}
