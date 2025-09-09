import * as crypto from 'crypto';

export function validateTelegramInitData(botToken: string, initData: string): { ok: boolean; userId?: string } {
  try {
    const url = new URLSearchParams(initData);
    const hash = url.get('hash') || '';
    const dataPairs: string[] = [];
    url.forEach((v, k) => { if (k !== 'hash') dataPairs.push(`${k}=${v}`); });
    dataPairs.sort();
    const dataCheckString = dataPairs.join('\n');
    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (hmac !== hash) return { ok: false };
    const userJson = url.get('user');
    if (userJson) {
      const user = JSON.parse(userJson);
      return { ok: true, userId: String(user.id) };
    }
    const chatJson = url.get('chat');
    if (chatJson) {
      const chat = JSON.parse(chatJson);
      return { ok: true, userId: String(chat.id) };
    }
    return { ok: false };
  } catch { return { ok: false }; }
}

