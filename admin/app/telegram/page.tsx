"use client";
import { useEffect, useState } from 'react';
import { getSettings, updateSettings, type MerchantSettings, registerTelegramBot, rotateTelegramWebhook, deactivateTelegramBot } from '../../lib/admin';

export default function TelegramPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || 'M-1');
  const [s, setS] = useState<MerchantSettings | null>(null);
  const [msg, setMsg] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    setLoading(true);
    getSettings(merchantId).then(setS).catch((e:any)=>setMsg(String(e?.message||e))).finally(()=>setLoading(false));
  }, [merchantId]);

  const save = async () => {
    if (!s) return;
    setLoading(true);
    try {
      const dto = {
        earnBps: s.earnBps,
        redeemLimitBps: s.redeemLimitBps,
        qrTtlSec: s.qrTtlSec,
        telegramBotToken: s.telegramBotToken || undefined,
        telegramBotUsername: s.telegramBotUsername || undefined,
        telegramStartParamRequired: !!s.telegramStartParamRequired,
        miniappBaseUrl: s.miniappBaseUrl || undefined,
      };
      const r = await updateSettings(merchantId, dto);
      setS(r); setMsg('Сохранено');
    } catch (e:any) { setMsg('Ошибка сохранения: ' + (e.message || e)); }
    finally { setLoading(false); }
  };

  const register = async () => {
    if (!s?.telegramBotToken) { setMsg('Укажите Telegram Bot Token и нажмите Сохранить'); return; }
    setLoading(true);
    try {
      const res = await registerTelegramBot(merchantId, s.telegramBotToken);
      setMsg(`Бот @${res.username} зарегистрирован, webhook: ${res.webhookUrl}`);
      const fresh = await getSettings(merchantId);
      setS(fresh);
    } catch (e:any) {
      setMsg('Ошибка регистрации бота: ' + (e.message || e));
    } finally { setLoading(false); }
  };

  const rotate = async () => {
    setLoading(true);
    try {
      await rotateTelegramWebhook(merchantId);
      setMsg('Секрет вебхука ротирован и обновлен');
    } catch (e:any) { setMsg('Ошибка ротации: ' + (e.message || e)); }
    finally { setLoading(false); }
  };

  const deactivate = async () => {
    setLoading(true);
    try {
      await deactivateTelegramBot(merchantId);
      setMsg('Бот деактивирован и webhook удален');
    } catch (e:any) { setMsg('Ошибка деактивации: ' + (e.message || e)); }
    finally { setLoading(false); }
  };

  const deeplink = () => {
    const username = s?.telegramBotUsername?.replace(/^@/, '') || 'bot';
    const base = `https://t.me/${username}/${s?.telegramStartParamRequired ? 'startapp' : 'start'}`;
    const param = encodeURIComponent(merchantId);
    return `${base}?startapp=${param}`;
  };

  return (
    <div>
      <h2>Telegram и Мини‑аппа</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
        <label>
          Мерчант:
          <input value={merchantId} onChange={e=>setMerchantId(e.target.value)} style={{ marginLeft: 8 }} />
        </label>
        {loading && <span>Загрузка…</span>}
      </div>

      {s && (
        <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
          <div>
            <label>QR TTL (сек):</label>
            <input type="number" min={15} max={600} value={s.qrTtlSec} onChange={e=>setS({ ...s, qrTtlSec: parseInt(e.target.value||'120',10) })} style={{ marginLeft: 8, width: 100 }} />
          </div>
          <div>
            <label>Telegram Bot Token:</label>
            <input value={s.telegramBotToken || ''} onChange={e=>setS({ ...s, telegramBotToken: e.target.value })} style={{ marginLeft: 8, width: 520 }} placeholder="12345:ABC..." />
          </div>
          <div>
            <label>Telegram Bot Username:</label>
            <input value={s.telegramBotUsername || ''} onChange={e=>setS({ ...s, telegramBotUsername: e.target.value })} style={{ marginLeft: 8, width: 320 }} placeholder="@my_loyalty_bot" />
          </div>
          <div>
            <label>
              Требовать start_param
              <input type="checkbox" checked={!!s.telegramStartParamRequired} onChange={e=>setS({ ...s, telegramStartParamRequired: e.target.checked })} style={{ marginLeft: 8 }} />
            </label>
          </div>
          <div>
            <label>Miniapp Base URL:</label>
            <input value={s.miniappBaseUrl || ''} onChange={e=>setS({ ...s, miniappBaseUrl: e.target.value })} style={{ marginLeft: 8, width: 520 }} placeholder="https://miniapp.example.com" />
          </div>
          <div>
            <button onClick={save} disabled={loading} style={{ padding: '8px 12px' }}>Сохранить</button>
            <button onClick={register} disabled={loading || !s.telegramBotToken} style={{ padding: '8px 12px', marginLeft: 8 }}>Зарегистрировать бота</button>
            <button onClick={rotate} disabled={loading} style={{ padding: '8px 12px', marginLeft: 8 }}>Ротация секрета вебхука</button>
            <button onClick={deactivate} disabled={loading} style={{ padding: '8px 12px', marginLeft: 8, color: '#f38ba8' }}>Деактивировать бота</button>
          </div>
          <div style={{ opacity: 0.85 }}>
            Deep link: {s.telegramBotUsername ? <a href={deeplink()} target="_blank" style={{ color: '#89b4fa' }}>{deeplink()}</a> : '—'}
          </div>
        </div>
      )}

      {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}

