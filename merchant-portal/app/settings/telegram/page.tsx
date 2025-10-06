"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";
import Toggle from "../../../components/Toggle";

type Subscriber = { id: string; chatId: string; chatType: string; username: string | null; title: string | null; addedAt?: string | null; lastSeenAt?: string | null };

export default function TelegramSettingsPage() {
  const [state, setState] = React.useState<{ configured: boolean; botUsername: string | null; botLink: string | null } | null>(null);
  const [invite, setInvite] = React.useState<{ startUrl: string; startGroupUrl: string; token: string } | null>(null);
  const [subs, setSubs] = React.useState<Subscriber[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [dailyDigest, setDailyDigest] = React.useState(true);
  const [notifyOrders, setNotifyOrders] = React.useState(true);
  const [notifyReviews, setNotifyReviews] = React.useState(true);

  const loadAll = async () => {
    setBusy(true); setErr('');
    try {
      const s = await fetch('/api/portal/settings/telegram-notify/state').then(r=>r.json());
      setState(s);
      // Если бот не настроен — пропускаем выдачу инвайта
      if (s?.configured) {
        const res = await fetch('/api/portal/settings/telegram-notify/invite', { method: 'POST' });
        let i: any = null;
        try { i = await res.json(); } catch {}
        if (!res.ok || !i?.token) {
          setInvite(null);
          if (!res.ok) setErr(i?.message || 'Не удалось получить инвайт для Telegram');
        } else {
          setInvite(i);
        }
      } else {
        setInvite(null);
      }
      const list = await fetch('/api/portal/settings/telegram-notify/subscribers').then(r=>r.json());
      setSubs(Array.isArray(list) ? list : []);
    } catch (e:any) {
      setErr(String(e?.message || e));
      setState(null); setInvite(null); setSubs([]);
    } finally { setBusy(false); }
  };

  React.useEffect(() => { loadAll(); }, []);

  const deactivate = async (id: string) => {
    try {
      await fetch(`/api/portal/settings/telegram-notify/subscribers/${encodeURIComponent(id)}/deactivate`, { method: 'POST' });
      setSubs((prev) => (prev||[]).filter(x => x.id !== id));
    } catch {}
  };

  const botLogin = state?.botUsername || '@notify_bot';
  const startUrl = invite?.startUrl || (state?.botLink ? `${state.botLink}?start=...` : '#');
  const startGroupUrl = invite?.startGroupUrl || (state?.botLink ? `${state.botLink}?startgroup=...` : '#');

  const generateNewToken = async () => {
    try {
      setBusy(true); setErr('');
      const res = await fetch('/api/portal/settings/telegram-notify/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceNew: true }),
      });
      let i: any = null;
      try { i = await res.json(); } catch {}
      if (!res.ok || !i?.token) {
        setInvite(null);
        if (!res.ok) setErr(i?.message || 'Не удалось сгенерировать новый инвайт');
      } else {
        setInvite(i);
      }
    } catch (e:any) {
      setErr(String(e?.message || e));
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>Уведомления в Telegram</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>Получайте оперативные уведомления об операциях и отзывах прямо в мессенджер.</div>
      </div>

      <Card>
        <CardHeader title="Настройки" subtitle="Подключите бота и управляйте уведомлениями" />
        <CardBody>
          <div style={{ display: 'grid', gap: 16 }}>
            {err && <div style={{ color:'#f38ba8' }}>{err}</div>}
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              Вы можете получать уведомления в Telegram. Нажмите одну из кнопок ниже, чтобы подписаться на уведомления.
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Button disabled={!invite || busy} onClick={() => window.open(startUrl, '_blank')}>
                Начать чат с ботом
              </Button>
              <Button variant="secondary" disabled={!invite || busy} onClick={() => window.open(startGroupUrl, '_blank')}>
                Добавить бота в групповой чат
              </Button>
              <Button variant="ghost" disabled={busy || !state?.configured} onClick={generateNewToken}>
                Сгенерировать новый токен
              </Button>
            </div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Вы также можете найти бота <b>{botLogin}</b> в Telegram
              {invite?.token
                ? <> и отправить ему команду <b>/start {invite.token}</b>.</>
                : <>. Сгенерируйте инвайт, чтобы получить персональный токен для команды <b>/start</b>.</>
              }
            </div>

            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              <Toggle checked={notifyOrders} onChange={setNotifyOrders} label="Оповещать о новых заказах" />
              <Toggle checked={notifyReviews} onChange={setNotifyReviews} label="Оповещать о новых отзывах" />
              <Toggle checked={dailyDigest} onChange={setDailyDigest} label="Ежедневная сводка по показателям" />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Подключенные пользователи" subtitle="Список получателей уведомлений" />
        <CardBody>
          {(subs && subs.length) ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {subs.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(148,163,184,0.2)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontWeight: 600 }}>{item.username || item.title || (item.chatType.includes('group') ? 'Группа' : 'Пользователь')}</div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>{item.chatType.includes('group') ? 'Группа' : 'Пользователь'}</div>
                  </div>
                  <button className="btn btn-ghost" onClick={() => deactivate(item.id)}>Отвязать</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ opacity: 0.7 }}>Нет подключенных пользователей</div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
