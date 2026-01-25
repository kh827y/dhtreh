import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';

@Injectable()
export class LoyaltyIdempotencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async run<T>(params: {
    merchantId?: string;
    scope: string;
    key?: string;
    requestHash?: string | null;
    execute: () => Promise<T>;
    normalize?: (value: T) => T;
  }): Promise<T> {
    const { merchantId, scope, key, requestHash, execute, normalize } = params;
    const normalizeValue = (value: T) => (normalize ? normalize(value) : value);
    if (!merchantId || !key) {
      const result = await execute();
      return normalizeValue(result);
    }
    const ttlH = this.config.getIdempotencyTtlHours();
    const exp = new Date(Date.now() + ttlH * 3600 * 1000);
    const keyWhere = {
      merchantId,
      scope,
      key,
    };
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { merchantId_scope_key: keyWhere },
    });
    if (existing) {
      if (existing.requestHash && existing.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency-Key уже использован с другим запросом',
        );
      }
      if (existing.response) {
        return normalizeValue(existing.response as T);
      }
      throw new ConflictException('Idempotency-Key уже обрабатывается');
    }
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          merchantId,
          scope,
          key,
          requestHash: requestHash ?? null,
          expiresAt: exp,
          response: Prisma.JsonNull,
        },
      });
    } catch (err) {
      logIgnoredError(
        err,
        'LoyaltyIdempotencyService create key',
        undefined,
        'debug',
      );
      const saved = await this.prisma.idempotencyKey.findUnique({
        where: { merchantId_scope_key: keyWhere },
      });
      if (saved) {
        if (saved.requestHash && saved.requestHash !== requestHash) {
          throw new ConflictException(
            'Idempotency-Key уже использован с другим запросом',
          );
        }
        if (saved.response) {
          return normalizeValue(saved.response as T);
        }
        throw new ConflictException('Idempotency-Key уже обрабатывается');
      }
    }
    try {
      const result = await execute();
      const normalized = normalizeValue(result);
      await this.prisma.idempotencyKey.update({
        where: { merchantId_scope_key: keyWhere },
        data: {
          response: (normalized ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          expiresAt: exp,
        },
      });
      return normalized;
    } catch (err) {
      try {
        await this.prisma.idempotencyKey.delete({
          where: { merchantId_scope_key: keyWhere },
        });
      } catch (cleanupErr) {
        logIgnoredError(
          cleanupErr,
          'LoyaltyIdempotencyService cleanup',
          undefined,
          'debug',
        );
      }
      throw err;
    }
  }
}
