"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, Skeleton } from '@loyalty/ui';

type TelegramSummary = {
  enabled: boolean;
  botUsername: string | null;
  botLink: string | null;
  miniappUrl: string | null;
  connectionHealthy: boolean;
  tokenMask: string | null;
  message?: string | null;
};

type RestApiSummary = {
  enabled: boolean;
  apiKeyMask: string | null;
  baseUrl: string | null;
  requireBridgeSignature: boolean;
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
  const [telegram, setTelegram] = React.useState<TelegramSummary | null>(null);
  const [telegramLoading, setTelegramLoading] = React.useState(true);
  const [telegramError, setTelegramError] = React.useState('');
  const [restApi, setRestApi] = React.useState<RestApiSummary | null>(null);
  const [restLoading, setRestLoading] = React.useState(true);
  const [restError, setRestError] = React.useState('');

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

  async function loadRestApi() {
    setRestLoading(true);
    setRestError('');
    try {
      const res = await fetch('/api/portal/integrations/rest-api');
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRestApi(null);
        throw new Error((data && typeof data?.message === 'string' && data.message) || 'Не удалось загрузить REST API');
      }
      setRestApi(data ?? null);
      setRestError((data && typeof data?.message === 'string' && data.message) || '');
    } catch (error: any) {
      setRestApi(null);
      setRestError(String(error?.message || error));
    } finally {
      setRestLoading(false);
    }
  }

  React.useEffect(() => {
    loadTelegram();
    loadRestApi();
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

  const handleOpenRestApi = () => {
    router.push('/integrations/rest-api');
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

  const restStatusLabel = restApi?.enabled ? 'Активна' : 'Не подключена';
  const restStatusColor = restApi?.enabled ? '#22c55e' : 'rgba(148,163,184,0.45)';
  const restApiCard = (
    <Card
      style={{
        border: '1px solid rgba(148,163,184,0.18)',
        background: 'linear-gradient(135deg, rgba(16,185,129,0.14), rgba(15,23,42,0.78))',
        transition: 'border-color .2s ease, transform .2s ease',
      }}
    >
      <CardBody>
        {restLoading ? (
          <Skeleton height={160} />
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 24, alignItems: 'center' }}>
              <div
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: '50%',
                  background: 'rgba(16,185,129,0.16)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="54" height="54" viewBox="0 0 48 48" aria-hidden="true">
                  <circle cx="24" cy="24" r="24" fill="#10b981" />
                  <path
                    d="M31 15c-2.9 0-5.2 1.9-5.9 4.5a6.5 6.5 0 0 0-5.1-.2c-2 .8-3.3 2.7-3.3 4.9a5.1 5.1 0 0 0 3.8 4.9v1.9c0 .5.5 1 1.1 1H25a1 1 0 0 0 1-1v-1.8a2.7 2.7 0 0 0 2.2-2.7 2.8 2.8 0 0 0-2.8-2.8h-3.9a1 1 0 0 1-.9-1c0-.4.2-.7.5-.9a4.5 4.5 0 0 1 6.9 3.6 1 1 0 0 0 1.1.9h1.8a1 1 0 0 0 1-.9C31.9 20.6 35 18 38 18a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1h-7Z"
                    fill="#0f172a"
                  />
                </svg>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>REST API</div>
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  Доступ для внешних CRM/касс по API-ключу (CODE / CALCULATE / BONUS / REFUND)
                </div>
                {restApi?.apiKeyMask && (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Маска ключа: {restApi.apiKeyMask}</div>
                )}
                {restError && <div style={{ fontSize: 12, color: '#f97316' }}>{restError}</div>}
              </div>
              <div style={{ display: 'grid', justifyItems: 'end', gap: 12 }}>
                <StatusPill color={restStatusColor} label={restStatusLabel} />
                <div style={{ fontSize: 12, opacity: 0.7 }}>Подробнее →</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.85 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: restStatusColor }} />
              <span>
                {restApi?.baseUrl
                  ? `Базовый URL: ${restApi.baseUrl}`
                  : 'API_BASE_URL не задан, ключ можно выпустить на странице интеграции'}
              </span>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );

  const integrationsCards = [
    {
      key: 'rest',
      enabled: Boolean(restApi?.enabled),
      card: (
        <div
          role="button"
          tabIndex={0}
          onClick={handleOpenRestApi}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleOpenRestApi();
            }
          }}
          style={{ outline: 'none', cursor: 'pointer' }}
        >
          {restApiCard}
        </div>
      ),
    },
    {
      key: 'telegram',
      enabled: Boolean(telegram?.enabled),
      card: (
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
      ),
    },
  ].sort((a, b) => Number(b.enabled) - Number(a.enabled));

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Интеграции</div>
        </div>
      </div>

      {integrationsCards.map((item) => (
        <React.Fragment key={item.key}>{item.card}</React.Fragment>
      ))}
    </div>
  );
}
