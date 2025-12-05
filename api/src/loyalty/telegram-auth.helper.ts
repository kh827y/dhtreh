import type { PrismaService } from '../prisma.service';
import { validateTelegramInitData } from './telegram.util';

export type TelegramAuthContext = {
  merchantId: string;
  customerId: string;
  tgId: string;
};

export function readTelegramInitDataFromHeader(req: any): string | null {
  try {
    const header = req?.headers?.authorization;
    if (!header || typeof header !== 'string') return null;
    const match = header.match(/^tma\s+(.+)$/i);
    if (!match) return null;
    const initData = match[1]?.trim();
    return initData?.length ? initData : null;
  } catch {
    return null;
  }
}

export async function resolveTelegramAuthContext(
  prisma: PrismaService,
  merchantId: string,
  initData: string,
  tokenHint?: string | null,
): Promise<TelegramAuthContext | null> {
  if (!merchantId || !initData) return null;
  let token = typeof tokenHint === 'string' ? tokenHint.trim() : '';
  if (!token) {
    try {
      const settings = await prisma.merchantSettings.findUnique({
        where: { merchantId },
        select: { telegramBotToken: true },
      });
      token = settings?.telegramBotToken || '';
    } catch {
      token = '';
    }
  }
  if (!token) token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) return null;
  const validation = validateTelegramInitData(token, initData);
  if (!validation.ok || !validation.userId) return null;
  const tgId = String(validation.userId);
  try {
    // Customer теперь per-merchant модель
    const customer = await prisma.customer.findFirst({
      where: { merchantId, tgId },
      select: { id: true },
    });
    if (!customer) return null;
    return {
      merchantId,
      customerId: customer.id,
      tgId,
    };
  } catch {
    return null;
  }
}
