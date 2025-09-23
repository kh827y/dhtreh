"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";
import Toggle from "../../../components/Toggle";

const BOT_LOGIN = process.env.NEXT_PUBLIC_TELEGRAM_BOT_LOGIN || "loyalty_notify_bot";
const BOT_TOKEN_HINT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN_HINT || "demo-token";

const initialConnections = [
  { id: 'tg-1', username: '@alexey', type: 'user' },
  { id: 'tg-2', username: '@support_team', type: 'group' },
];

export default function TelegramSettingsPage() {
  const [connections, setConnections] = React.useState(initialConnections);
  const [dailyDigest, setDailyDigest] = React.useState(true);
  const [notifyOrders, setNotifyOrders] = React.useState(true);
  const [notifyReviews, setNotifyReviews] = React.useState(true);

  const removeConnection = (id: string) => {
    setConnections((prev) => prev.filter((item) => item.id !== id));
  };

  const botUrl = `https://telegram.me/${BOT_LOGIN}`;
  const startUrl = `${botUrl}?start=${BOT_TOKEN_HINT}`;
  const startGroupUrl = `${botUrl}?startgroup=${BOT_TOKEN_HINT}`;

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
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Вы можете получать уведомления в Telegram, для этого начните чат с ботом или добавьте его в групповой чат.
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Button onClick={() => window.open(startUrl, '_blank')}>Начать чат с ботом</Button>
              <Button variant="secondary" onClick={() => window.open(startGroupUrl, '_blank')}>Добавить бота в групповой чат</Button>
            </div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Вы также можете найти бота <b>{BOT_LOGIN}</b> в Telegram и отправить ему сообщение <b>/start {BOT_TOKEN_HINT}</b>.
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
          {connections.length ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {connections.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(148,163,184,0.2)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontWeight: 600 }}>{item.username}</div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>{item.type === 'group' ? 'Группа' : 'Пользователь'}</div>
                  </div>
                  <button className="btn btn-ghost" onClick={() => removeConnection(item.id)}>Отвязать</button>
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
