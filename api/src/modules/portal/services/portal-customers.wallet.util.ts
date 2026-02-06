import { WalletType } from '@prisma/client';
import type { PrismaService } from '../../../core/prisma/prisma.service';

export const ensureWallet = async (
  prisma: PrismaService,
  merchantId: string,
  customerId: string,
): Promise<number> => {
  const wallet = await prisma.wallet.upsert({
    where: {
      customerId_merchantId_type: {
        customerId,
        merchantId,
        type: WalletType.POINTS,
      },
    },
    update: {},
    create: {
      customerId,
      merchantId,
      type: WalletType.POINTS,
      balance: 0,
    },
  });
  return wallet.balance;
};
