import type { PrismaService } from '../prisma.service';
import { validateTelegramInitData } from './telegram.util';
import { createHmac } from 'crypto';

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
  let startParamRequired = false;
  try {
    const settings = await prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { telegramBotToken: true, telegramStartParamRequired: true },
    });
    if (!token) token = settings?.telegramBotToken || '';
    startParamRequired = Boolean(settings?.telegramStartParamRequired);
  } catch {
    if (!token) token = '';
  }
  if (!token) return null;
  if (startParamRequired) {
    try {
      const params = new URLSearchParams(initData);
      const startParam =
        params.get('start_param') || params.get('startapp') || '';
      if (!startParam) return null;
      const parts = startParam.split('.');
      const looksLikeJwt =
        parts.length === 3 &&
        parts.every((x) => x && /^[A-Za-z0-9_-]+$/.test(x));
      if (looksLikeJwt) {
        const secret = process.env.TMA_LINK_SECRET || '';
        if (!secret) return null;
        const [h, pld, sig] = parts;
        const data = `${h}.${pld}`;
        const expected = createHmac('sha256', secret)
          .update(data)
          .digest('base64')
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_');
        if (expected !== sig) return null;
        const json = JSON.parse(
          Buffer.from(pld.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
            'utf8',
          ),
        );
        const claimedMerchant =
          typeof json?.merchantId === 'string' ? json.merchantId : '';
        if (claimedMerchant && claimedMerchant !== merchantId) return null;
      } else if (startParam !== merchantId) {
        return null;
      }
    } catch {
      return null;
    }
  }
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
