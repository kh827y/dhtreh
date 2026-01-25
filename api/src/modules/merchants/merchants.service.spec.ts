import { BadRequestException } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import type { PrismaService } from '../../core/prisma/prisma.service';
import { MerchantsSettingsService } from './services/merchants-settings.service';
import { AppConfigService } from '../../core/config/app-config.service';
import type { LookupCacheService } from '../../core/cache/lookup-cache.service';
import type { MerchantsAccessService } from './services/merchants-access.service';
import type { MerchantsStaffService } from './services/merchants-staff.service';
import { MerchantsOutletsService } from './services/merchants-outlets.service';
import type { MerchantsOutboxService } from './services/merchants-outbox.service';
import type { MerchantsAntifraudService } from './services/merchants-antifraud.service';
import type { MerchantsLedgerService } from './services/merchants-ledger.service';
import type { MerchantsAdminService } from './services/merchants-admin.service';
import type { MerchantsPortalAuthService } from './services/merchants-portal-auth.service';
import type { MerchantsIntegrationsService } from './services/merchants-integrations.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type MerchantSettingsData = {
  earnBps?: number;
  redeemLimitBps?: number;
  qrTtlSec?: number;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  webhookKeyId?: string | null;
  redeemCooldownSec?: number;
  earnCooldownSec?: number;
  redeemDailyCap?: number | null;
  earnDailyCap?: number | null;
  requireJwtForQuote?: boolean;
  rulesJson?: unknown;
};
type MerchantSettingsUpsertArgs = {
  where: { merchantId: string };
  update?: MerchantSettingsData;
  create?: MerchantSettingsData;
};
type PrismaStub = {
  merchant: {
    findUnique: MockFn;
    upsert: MockFn;
  };
  merchantSettings: {
    findUnique: MockFn;
    upsert: MockFn<unknown, [MerchantSettingsUpsertArgs]>;
  };
};
type PrismaOutletStub = {
  merchant: { upsert: MockFn };
  merchantSettings: { findUnique: MockFn };
  outlet: { count: MockFn; create: MockFn };
};
type CacheStub = {
  invalidateSettings: MockFn;
  invalidateOutlet?: MockFn;
  invalidateStaff?: MockFn;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub | PrismaOutletStub) =>
  stub as unknown as PrismaService;
const asCacheService = (stub: CacheStub) =>
  stub as unknown as LookupCacheService;
const asAccessService = (stub: object) => stub as MerchantsAccessService;
const asStaffService = (stub: object) => stub as MerchantsStaffService;
const asOutletsService = (stub: object) => stub as MerchantsOutletsService;
const asOutboxService = (stub: object) => stub as MerchantsOutboxService;
const asAntifraudService = (stub: object) => stub as MerchantsAntifraudService;
const asLedgerService = (stub: object) => stub as MerchantsLedgerService;
const asAdminService = (stub: object) => stub as MerchantsAdminService;
const asPortalAuthService = (stub: object) =>
  stub as MerchantsPortalAuthService;
const asIntegrationsService = (stub: object) =>
  stub as MerchantsIntegrationsService;
const makeOutletsService = (prisma: PrismaOutletStub, cache: CacheStub) =>
  new MerchantsOutletsService(asPrismaService(prisma), asCacheService(cache));
const makeSettingsService = (prisma: PrismaStub) =>
  new MerchantsSettingsService(
    asPrismaService(prisma),
    new AppConfigService(),
    asCacheService({ invalidateSettings: mockFn() }),
  );
const makeSettingsStub = () =>
  ({
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    normalizeRulesJson: jest.fn((value: unknown) => value),
  }) as unknown as MerchantsSettingsService;

describe('MerchantsService rulesJson validation', () => {
  function makeSvc() {
    const prisma: PrismaStub = {
      merchant: {
        findUnique: mockFn().mockResolvedValue({ id: 'M-1' }),
        upsert: mockFn().mockResolvedValue({ id: 'M-1', name: 'M-1' }),
      },
      merchantSettings: {
        findUnique: mockFn().mockResolvedValue({
          pointsTtlDays: 0,
          rulesJson: null,
        }),
        upsert: mockFn<
          unknown,
          [MerchantSettingsUpsertArgs]
        >().mockImplementation(
          ({ where, update, create }: MerchantSettingsUpsertArgs) => {
            // emulate prisma upsert returning merged object
            const base = { merchantId: where.merchantId };
            const updated = { ...(create || {}), ...(update || {}) };
            // ensure required response fields exist
            return {
              merchantId: base.merchantId,
              earnBps: updated.earnBps ?? 300,
              redeemLimitBps: updated.redeemLimitBps ?? 5000,
              qrTtlSec: updated.qrTtlSec ?? 300,
              webhookUrl: updated.webhookUrl ?? null,
              webhookSecret: updated.webhookSecret ?? null,
              webhookKeyId: updated.webhookKeyId ?? null,
              redeemCooldownSec: updated.redeemCooldownSec ?? 0,
              earnCooldownSec: updated.earnCooldownSec ?? 0,
              redeemDailyCap: updated.redeemDailyCap ?? null,
              earnDailyCap: updated.earnDailyCap ?? null,
              requireJwtForQuote: updated.requireJwtForQuote ?? false,
              rulesJson: updated.rulesJson ?? null,
            };
          },
        ),
      },
    };
    return new MerchantsService(
      makeSettingsService(prisma),
      asAccessService({}),
      asStaffService({}),
      asOutletsService({}),
      asOutboxService({}),
      asAntifraudService({}),
      asLedgerService({}),
      asAdminService({}),
      asPortalAuthService({}),
      asIntegrationsService({}),
    );
  }

  it('should reject invalid rules with 400 (BadRequestException)', async () => {
    const svc = makeSvc();
    const badRules = {
      rules: [{ if: { channelIn: 'not-array' }, then: { earnBps: 700 } }],
    };
    await expect(
      svc.updateSettings(
        'M-1',
        500,
        5000,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined, // requireJwtForQuote
        badRules, // rulesJson
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should accept valid rules and proceed to save', async () => {
    const svc = makeSvc();
    const okRules = {
      rules: [{ if: { channelIn: ['SMART'] }, then: { earnBps: 700 } }],
    };
    const r = await svc.updateSettings(
      'M-1',
      500,
      5000,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined, // requireJwtForQuote
      okRules, // rulesJson
    );
    expect(r.earnBps).toBe(500);
    expect(r.rulesJson).toEqual({
      ...okRules,
      schemaVersion: 2,
    });
  });

  it('keeps antifraud device limits and preserves block factors', async () => {
    const svc = makeSvc();
    const payload = {
      af: {
        merchant: { limit: 10, windowSec: 60 },
        device: { limit: 5, windowSec: 120 },
        staff: { limit: 3, windowSec: 60 },
        customer: { limit: 2, windowSec: 60 },
        blockFactors: ['no_device_id', 'velocity'],
      },
    };

    const result = await svc.updateSettings(
      'M-1',
      500,
      5000,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      payload,
    );

    expect(result.rulesJson).toEqual({
      schemaVersion: 2,
      af: {
        merchant: { limit: 10, windowSec: 60 },
        device: { limit: 5, windowSec: 120 },
        staff: { limit: 3, windowSec: 60 },
        customer: { limit: 2, windowSec: 60 },
        blockFactors: ['no_device_id', 'velocity'],
      },
    });
  });
});

describe('MerchantsService outlet limits', () => {
  it('blocks outlet creation when limit reached', async () => {
    const prisma: PrismaOutletStub = {
      merchant: { upsert: mockFn().mockResolvedValue({ id: 'M-1' }) },
      merchantSettings: {
        findUnique: mockFn().mockResolvedValue({ maxOutlets: 2 }),
      },
      outlet: {
        count: mockFn().mockResolvedValue(2),
        create: mockFn(),
      },
    };
    const svc = new MerchantsService(
      makeSettingsStub(),
      asAccessService({}),
      asStaffService({}),
      makeOutletsService(prisma, {
        invalidateSettings: mockFn(),
        invalidateOutlet: mockFn(),
        invalidateStaff: mockFn(),
      }),
      asOutboxService({}),
      asAntifraudService({}),
      asLedgerService({}),
      asAdminService({}),
      asPortalAuthService({}),
      asIntegrationsService({}),
    );
    await expect(svc.createOutlet('M-1', 'Main')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.outlet.create).not.toHaveBeenCalled();
  });
});
