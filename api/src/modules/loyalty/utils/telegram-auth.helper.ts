import type { PrismaService } from '../../../core/prisma/prisma.service';
import { validateTelegramInitData } from './telegram.util';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';

export type TelegramAuthContext = {
  merchantId: string;
  customerId: string;
  tgId: string;
};

type RequestLike = {
  headers?: Record<string, unknown> | undefined;
};

export function readTelegramInitDataFromHeader(
  req: RequestLike,
): string | null {
  try {
    const header = req?.headers?.authorization;
    if (!header || typeof header !== 'string') return null;
    const match = header.match(/^tma\s+(.+)$/i);
    if (!match) return null;
    const initData = match[1]?.trim();
    return initData?.length ? initData : null;
  } catch (err) {
    logIgnoredError(
      err,
      'readTelegramInitDataFromHeader',
      undefined,
      'debug',
    );
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
  } catch (err) {
    logIgnoredError(
      err,
      'resolveTelegramAuthContext settings lookup',
      undefined,
      'debug',
    );
    if (!token) token = '';
  }
  if (!token) return null;
  if (startParamRequired) {
    try {
      const params = new URLSearchParams(initData);
      const startParam =
        params.get('start_param') || params.get('startapp') || '';
      if (!startParam) return null;
      const trimmed = startParam.trim();
      const isReferral = /^ref[_-]/i.test(trimmed);
      if (!isReferral && trimmed !== merchantId) {
        return null;
      }
    } catch (err) {
      logIgnoredError(
        err,
        'resolveTelegramAuthContext start_param parse',
        undefined,
        'debug',
      );
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
  } catch (err) {
    logIgnoredError(
      err,
      'resolveTelegramAuthContext customer lookup',
      undefined,
      'debug',
    );
    return null;
  }
}
