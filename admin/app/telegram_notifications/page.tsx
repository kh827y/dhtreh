"use client";
import { useEffect, useState } from 'react';

export default function TelegramNotificationsSettingsPage() {
  const [tgState, setTgState] = useState<{
    configured: boolean;
    botUsername: string | null;
    botLink: string | null;
    webhook?: { url?: string | null; hasError?: boolean; lastErrorDate?: number; lastErrorMessage?: string } | null;
  } | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const load = async () => {
    try {
      setBusy(true);
      const st = await fetch('/api/admin/notifications/telegram-notify/state').then(r=>r.json());
      setTgState(st);
    } catch { setTgState(null); } finally { setBusy(false); }
  };

  useEffect(() => { load(); }, []);

  const setWebhook = async () => {
    setBusy(true);
    try { await fetch('/api/admin/notifications/telegram-notify/set-webhook', { method: 'POST' }); } finally { await load(); }
  };
  const deleteWebhook = async () => {
    setBusy(true);
    try { await fetch('/api/admin/notifications/telegram-notify/delete-webhook', { method: 'POST' }); } finally { await load(); }
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h2>Telegram уведомления (сотрудники)</h2>
        <div style={{ fontSize:12, opacity:0.8 }}>
          {busy ? 'Обновление…' : ''}
        </div>
      </div>

      <div style={{ background:'#0e1629', padding:10, borderRadius:8, marginBottom:12 }}>
        <div style={{ display:'grid', gap:8 }}>
          <div style={{ fontSize:13, opacity:0.85 }}>
            Единый Telegram‑бот для рассылки уведомлений сотрудникам. Секреты бота настраиваются через переменные окружения
            <code style={{ marginLeft:4, marginRight:4 }}>TELEGRAM_NOTIFY_BOT_TOKEN</code> и
            <code style={{ marginLeft:4 }}>TELEGRAM_NOTIFY_WEBHOOK_SECRET</code>.
          </div>
          <div style={{ fontSize:13 }}>
            Состояние: {tgState?.configured ? 'настроен' : 'не настроен'}{busy?' …':''}
          </div>
          <div style={{ fontSize:13 }}>
            Бот: {tgState?.botUsername ? (<a href={tgState?.botLink || '#'} target="_blank" rel="noreferrer">{tgState?.botUsername}</a>) : '—'}
          </div>
          <div style={{ fontSize:13 }}>
            Webhook: {tgState?.webhook?.url || '—'} {tgState?.webhook?.hasError ? ` (ошибка: ${tgState?.webhook?.lastErrorMessage || 'да'})` : ''}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={setWebhook} disabled={busy} style={{ padding:'6px 10px' }}>Установить webhook</button>
            <button onClick={deleteWebhook} disabled={busy} style={{ padding:'6px 10px' }}>Удалить webhook</button>
            <button onClick={load} disabled={busy} style={{ padding:'6px 10px' }}>Обновить статус</button>
          </div>
        </div>
      </div>

      <div style={{ fontSize:12, opacity:0.8 }}>
        Внимание: этот бот не связан с Telegram Mini App интеграцией. Он используется только для уведомлений сотрудников и групп.
      </div>
    </div>
  );
}
