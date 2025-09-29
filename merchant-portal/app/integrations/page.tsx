"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody, Button, Skeleton } from '@loyalty/ui';

type Integration = {
  id: string;
  type: string;
  provider: string;
  isActive: boolean;
  lastSync?: string | null;
  errorCount: number;
};

type TelegramSummary = {
  enabled: boolean;
  botUsername: string | null;
  botLink: string | null;
  miniappUrl: string | null;
  connectionHealthy: boolean;
  tokenMask: string | null;
  message?: string | null;
};

function StatusPill({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
      <span>{label}</span>
    </div>
  );
}

export default function IntegrationsPage() {
  const router = useRouter();
  const [items, setItems] = React.useState<Integration[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState('');
  const [telegram, setTelegram] = React.useState<TelegramSummary | null>(null);
  const [telegramLoading, setTelegramLoading] = React.useState(true);
  const [telegramError, setTelegramError] = React.useState('');

  async function loadIntegrations() {
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('/api/portal/integrations');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setMsg(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function loadTelegram() {
    setTelegramLoading(true);
    setTelegramError('');
    try {
      const res = await fetch('/api/portal/integrations/telegram-mini-app');
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setTelegram(null);
        setTelegramError((data && typeof data?.message === 'string' && data.message) || 'Не удалось загрузить Telegram-интеграцию');
      } else {
        setTelegram(data ?? null);
        setTelegramError((data && typeof data?.message === 'string' && data.message) || '');
      }
    } catch (error: any) {
      setTelegram(null);
      setTelegramError(String(error?.message || error));
    } finally {
      setTelegramLoading(false);
    }
  }

  React.useEffect(() => {
    loadIntegrations();
    loadTelegram();
  }, []);

  const statusLabel = telegram?.enabled ? 'Подключена' : 'Не подключена';
  const statusColor = telegram?.enabled ? '#22c55e' : 'rgba(148,163,184,0.45)';
  const connectionLabel = telegram?.enabled
    ? telegram.connectionHealthy
      ? 'Подключение к боту работает'
      : 'Подключение к боту не удалось'
    : 'Telegram Mini App не активна';
  const connectionColor = !telegram?.enabled
    ? 'rgba(148,163,184,0.45)'
    : telegram.connectionHealthy
    ? '#22c55e'
    : '#f87171';

  const handleOpenTelegram = () => {
    router.push('/integrations/telegram-mini-app');
  };

  const telegramCard = (
    <Card
      style={{
        border: '1px solid rgba(148,163,184,0.18)',
        background: 'radial-gradient(circle at top left, rgba(56,189,248,0.15), rgba(15,23,42,0.75))',
        transition: 'border-color .2s ease, transform .2s ease',
      }}
    >
      <CardBody>
        {telegramLoading ? (
          <Skeleton height={160} />
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 24, alignItems: 'center' }}>
              <div
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: '50%',
                  background: 'rgba(56,189,248,0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="58" height="58" viewBox="0 0 48 48" aria-hidden="true">
                  <circle cx="24" cy="24" r="24" fill="#1d9bf0" />
                  <path
                    d="M33.6 15.2 29 32.4c-.3 1.1-1.1 1.3-2.1.8l-5.7-4.2-2.8 2.7c-.3.3-.5.5-1 .5l.4-5.9 10.7-9.6c.5-.5-.1-.7-.8-.3l-13.2 8.3-5.7-1.8c-1.2-.4-1.3-1.1.3-1.6l21.6-8.3c1-.4 1.9.2 1.6 1.6Z"
                    fill="#fff"
                  />
                </svg>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>Telegram Mini App</div>
                <div style={{ fontSize: 13, opacity: 0.75 }}>Программа лояльности в мини-приложении Telegram</div>
                {telegram?.enabled && telegram.botUsername && (
                  <div style={{ fontSize: 13, opacity: 0.85 }}>
                    Подключен бот: <span style={{ fontWeight: 600 }}>{telegram.botUsername}</span>
                  </div>
                )}
                {telegram?.tokenMask && (
                  <div style={{ fontSize: 12, opacity: 0.6 }}>Последний проверенный токен: {telegram.tokenMask}</div>
                )}
                {telegramError && (
                  <div style={{ fontSize: 12, color: '#f97316' }}>{telegramError}</div>
                )}
              </div>
              <div style={{ display: 'grid', justifyItems: 'end', gap: 12 }}>
                <StatusPill color={statusColor} label={statusLabel} />
                <div style={{ fontSize: 12, opacity: 0.7 }}>Подробнее →</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.85 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: connectionColor }} />
              <span>{connectionLabel}</span>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Интеграции</div>
          <div style={{ opacity: 0.8, fontSize: 13 }}>Bridge / POS / CRM / Payments</div>
        </div>
        <Button variant="primary" disabled>
          Подключить интеграцию
        </Button>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={handleOpenTelegram}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleOpenTelegram();
          }
        }}
        style={{ outline: 'none', cursor: 'pointer' }}
      >
        {telegramCard}
      </div>

      <Card>
        <CardHeader title="Подключённые интеграции" />
        <CardBody>
          {loading ? (
            <Skeleton height={160} />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {items.map((it) => (
                <div
                  key={it.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 160px 160px 160px 120px',
                    gap: 8,
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,.06)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{it.provider}</div>
                    <div style={{ opacity: 0.8, fontSize: 12 }}>{it.type}</div>
                  </div>
                  <div style={{ opacity: 0.9 }}>{it.isActive ? 'Активна' : 'Отключена'}</div>
                  <div style={{ opacity: 0.9 }}>{it.lastSync ? new Date(it.lastSync).toLocaleString() : '—'}</div>
                  <div style={{ opacity: 0.9 }}>Ошибки: {it.errorCount}</div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button size="sm" disabled>
                      Подробнее
                    </Button>
                  </div>
                </div>
              ))}
              {!items.length && <div style={{ opacity: 0.7 }}>Интеграции не подключены</div>}
              {msg && <div style={{ color: '#f87171' }}>{msg}</div>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
