import * as crypto from 'crypto';

const parseEntityId = (json: string): string | null => {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!('id' in parsed)) return null;
    const id = (parsed as { id?: unknown }).id;
    if (typeof id === 'string' || typeof id === 'number') {
      return String(id);
    }
  } catch {}
  return null;
};

export function validateTelegramInitData(
  botToken: string,
  initData: string,
): { ok: boolean; userId?: string } {
  try {
    const url = new URLSearchParams(initData);
    const hash = url.get('hash') || '';
    const dataPairs: string[] = [];
    url.forEach((v, k) => {
      if (k === 'hash') return;
      dataPairs.push(`${k}=${v}`);
    });
    dataPairs.sort();
    const dataCheckString = dataPairs.join('\n');
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    const hmac = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    if (hmac !== hash) return { ok: false };
    const userJson = url.get('user');
    if (userJson) {
      const userId = parseEntityId(userJson);
      if (userId) return { ok: true, userId };
    }
    const chatJson = url.get('chat');
    if (chatJson) {
      const userId = parseEntityId(chatJson);
      if (userId) return { ok: true, userId };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}
