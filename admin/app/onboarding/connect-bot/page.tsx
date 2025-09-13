"use client";
import { useEffect, useState } from 'react';
import { getSettings, updateSettings, registerTelegramBot, type MerchantSettings } from '../../../lib/admin';

export default function ConnectBot() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [s, setS] = useState<MerchantSettings | null>(null);
  const [token, setToken] = useState<string>('');
  const [msg, setMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => { getSettings(merchantId).then(setS).catch(e=>setMsg(String(e?.message||e))); }, [merchantId]);

  const saveToken = async () => {
    if (!token) { setMsg('Введите BotFather токен'); return; }
    setLoading(true);
    try {
      const upd = await updateSettings(merchantId, { earnBps: s?.earnBps ?? 500, redeemLimitBps: s?.redeemLimitBps ?? 5000, telegramBotToken: token });
      setS(upd);
      const res = await registerTelegramBot(merchantId, token);
      setMsg(`Бот @${res.username} подключен. Webhook: ${res.webhookUrl}`);
    } catch (e:any) {
      setMsg('Ошибка: ' + (e.message || e));
    } finally { setLoading(false); }
  };

  return (
    <div>
      <h3>Шаг 1. Подключить бота</h3>
      <div>
        <label>BotFather токен: </label>
        <input value={token} onChange={e=>setToken(e.target.value)} placeholder="123456:ABC..." style={{ width: 380, marginLeft: 8 }} />
        <button onClick={saveToken} disabled={loading || !token} style={{ marginLeft: 8 }}>Подключить</button>
      </div>
      {s?.telegramBotUsername && (
        <div style={{ marginTop: 12 }}>Текущий бот: <b>@{s.telegramBotUsername}</b></div>
      )}
      {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}
