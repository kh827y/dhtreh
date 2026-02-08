import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';

type RulesUpdaterOptions = {
  ensureMerchant?: boolean;
  maxRetries?: number;
  update?: Omit<
    Prisma.MerchantSettingsUpdateManyMutationInput,
    'rulesJson' | 'updatedAt'
  >;
  create?: Omit<
    Prisma.MerchantSettingsUncheckedCreateInput,
    'merchantId' | 'rulesJson' | 'updatedAt'
  >;
};

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/**
 * Atomically updates merchantSettings.rulesJson via compare-and-swap loop.
 * This prevents lost updates when multiple settings requests modify different
 * rules sections concurrently.
 */
export async function updateMerchantSettingsRulesWithRetry<T>(
  prisma: PrismaService,
  merchantId: string,
  buildRules: (currentRules: Prisma.JsonValue | null | undefined) => T,
  options: RulesUpdaterOptions = {},
): Promise<T> {
  const maxRetries = Math.max(1, options.maxRetries ?? 5);
  const updateData = { ...(options.update ?? {}) };
  const createData = { ...(options.create ?? {}) };

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const current = await prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { rulesJson: true, updatedAt: true },
    });
    const nextRules = buildRules(current?.rulesJson);
    const now = new Date();

    if (current) {
      const patched = await prisma.merchantSettings.updateMany({
        where: {
          merchantId,
          updatedAt: current.updatedAt,
        },
        data: {
          ...updateData,
          rulesJson: nextRules as Prisma.InputJsonValue,
          updatedAt: now,
        },
      });
      if (patched.count === 1) {
        return nextRules;
      }
      continue;
    }

    if (options.ensureMerchant) {
      await prisma.merchant.upsert({
        where: { id: merchantId },
        update: {},
        create: {
          id: merchantId,
          name: merchantId,
          initialName: merchantId,
        },
      });
    }

    try {
      await prisma.merchantSettings.create({
        data: {
          ...createData,
          merchantId,
          rulesJson: nextRules as Prisma.InputJsonValue,
          updatedAt: now,
        },
      });
      return nextRules;
    } catch (error) {
      if (isUniqueViolation(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new ConflictException(
    'Не удалось сохранить настройки: повторите попытку',
  );
}
