import { WalletType } from '@prisma/client';
import type { PrismaService } from '../../../core/prisma/prisma.service';

export const ensureWallet = async (
  prisma: PrismaService,
  merchantId: string,
  customerId: string,
): Promise<number> => {
  const existing = await prisma.wallet.findUnique({
    where: {
      customerId_merchantId_type: {
        customerId,
        merchantId,
        type: WalletType.POINTS,
      },
    },
  });
  if (existing) return existing.balance;

  const created = await prisma.wallet.create({
    data: {
      customerId,
      merchantId,
      type: WalletType.POINTS,
      balance: 0,
    },
  });
  return created.balance;
};
