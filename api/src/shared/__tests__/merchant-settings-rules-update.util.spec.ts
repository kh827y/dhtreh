import { ConflictException } from '@nestjs/common';
import { updateMerchantSettingsRulesWithRetry } from '../merchant-settings-rules-update.util';
import type { PrismaService } from '../../core/prisma/prisma.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;

type PrismaStub = {
  merchantSettings: {
    findUnique: MockFn<Promise<unknown>, [unknown?]>;
    updateMany: MockFn<Promise<{ count: number }>, [unknown?]>;
    create: MockFn<Promise<unknown>, [unknown?]>;
  };
  merchant: {
    upsert: MockFn<Promise<unknown>, [unknown?]>;
  };
};

const asPrisma = (stub: PrismaStub) => stub as unknown as PrismaService;

const makePrisma = (): PrismaStub => ({
  merchantSettings: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  merchant: {
    upsert: jest.fn(),
  },
});

describe('updateMerchantSettingsRulesWithRetry', () => {
  it('updates existing rules via CAS', async () => {
    const prisma = makePrisma();
    prisma.merchantSettings.findUnique.mockResolvedValue({
      rulesJson: { miniapp: { supportTelegram: '@old' } },
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prisma.merchantSettings.updateMany.mockResolvedValue({ count: 1 });

    const next = await updateMerchantSettingsRulesWithRetry(
      asPrisma(prisma),
      'm1',
      (current) => ({
        ...(current as Record<string, unknown>),
        miniapp: { supportTelegram: '@new' },
      }),
    );

    expect(next).toEqual({
      miniapp: { supportTelegram: '@new' },
    });
    expect(prisma.merchantSettings.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.merchantSettings.create).not.toHaveBeenCalled();
  });

  it('retries CAS collision and succeeds on next attempt', async () => {
    const prisma = makePrisma();
    prisma.merchantSettings.findUnique
      .mockResolvedValueOnce({
        rulesJson: { rfm: { recency: { mode: 'auto' } } },
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        rulesJson: { rfm: { recency: { mode: 'manual', recencyDays: 30 } } },
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
      });
    prisma.merchantSettings.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await updateMerchantSettingsRulesWithRetry(
      asPrisma(prisma),
      'm1',
      (current) => ({
        ...(current as Record<string, unknown>),
        reviews: { enabled: true },
      }),
      { maxRetries: 3 },
    );

    expect(prisma.merchantSettings.updateMany).toHaveBeenCalledTimes(2);
  });

  it('creates settings when row does not exist', async () => {
    const prisma = makePrisma();
    prisma.merchantSettings.findUnique.mockResolvedValue(null);
    prisma.merchant.upsert.mockResolvedValue({ id: 'm1' });
    prisma.merchantSettings.create.mockResolvedValue({ merchantId: 'm1' });

    await updateMerchantSettingsRulesWithRetry(
      asPrisma(prisma),
      'm1',
      () => ({ miniapp: { supportTelegram: '@support' } }),
      { ensureMerchant: true },
    );

    expect(prisma.merchant.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.merchantSettings.create).toHaveBeenCalledTimes(1);
  });

  it('throws conflict after retry exhaustion', async () => {
    const prisma = makePrisma();
    prisma.merchantSettings.findUnique.mockResolvedValue({
      rulesJson: { miniapp: {} },
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prisma.merchantSettings.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      updateMerchantSettingsRulesWithRetry(
        asPrisma(prisma),
        'm1',
        () => ({ miniapp: { supportTelegram: '@new' } }),
        { maxRetries: 2 },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
