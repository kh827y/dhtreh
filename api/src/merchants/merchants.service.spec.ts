import { BadRequestException } from '@nestjs/common';
import { MerchantsService } from './merchants.service';

describe('MerchantsService rulesJson validation', () => {
  function makeSvc() {
    const prisma: any = {
      merchant: { upsert: jest.fn().mockResolvedValue({ id: 'M-1', name: 'M-1' }) },
      merchantSettings: {
        upsert: jest.fn().mockImplementation(async ({ where, update, create }: any) => {
          // emulate prisma upsert returning merged object
          const base = { merchantId: where.merchantId };
          const updated = { ...(create || {}), ...(update || {}) };
          // ensure required response fields exist
          return {
            merchantId: base.merchantId,
            earnBps: updated.earnBps ?? 500,
            redeemLimitBps: updated.redeemLimitBps ?? 5000,
            qrTtlSec: updated.qrTtlSec ?? 120,
            webhookUrl: updated.webhookUrl ?? null,
            webhookSecret: updated.webhookSecret ?? null,
            webhookKeyId: updated.webhookKeyId ?? null,
            requireBridgeSig: updated.requireBridgeSig ?? false,
            bridgeSecret: updated.bridgeSecret ?? null,
            redeemCooldownSec: updated.redeemCooldownSec ?? 0,
            earnCooldownSec: updated.earnCooldownSec ?? 0,
            redeemDailyCap: updated.redeemDailyCap ?? null,
            earnDailyCap: updated.earnDailyCap ?? null,
            requireJwtForQuote: updated.requireJwtForQuote ?? false,
            rulesJson: updated.rulesJson ?? null,
            requireStaffKey: updated.requireStaffKey ?? false,
          };
        }),
      },
    };
    return new MerchantsService(prisma);
  }

  it('should reject invalid rules with 400 (BadRequestException)', async () => {
    const svc = makeSvc();
    const badRules = [ { if: { weekdayIn: 'not-array' }, then: { earnBps: 700 } } ];
    await expect(svc.updateSettings('M-1', 500, 5000,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, // requireJwtForQuote
      badRules   // rulesJson
    ))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('should accept valid rules and proceed to save', async () => {
    const svc = makeSvc();
    const okRules = [ { if: { channelIn: ['SMART'] }, then: { earnBps: 700 } } ];
    const r = await svc.updateSettings('M-1', 500, 5000,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, // requireJwtForQuote
      okRules    // rulesJson
    );
    expect(r.earnBps).toBe(500);
    expect(r.rulesJson).toEqual(okRules);
  });
});
