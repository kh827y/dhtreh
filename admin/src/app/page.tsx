"use client";
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { getObservabilitySummary, type ObservabilitySummary } from '../lib/admin';
import { listMerchants, type MerchantRow } from '../lib/merchants';

type Stat = { label: string; value: number | string; tone?: 'ok' | 'warn' | 'danger' };

export default function Page() {
  const [obs, setObs] = useState<ObservabilitySummary | null>(null);
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [merchantsLoading, setMerchantsLoading] = useState(false);
  const [err, setErr] = useState('');

  const loadObservability = async () => {
    setLoading(true);
    try {
      const res = await getObservabilitySummary();
      setObs(res);
      setErr('');
    } catch (e: unknown) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  };

  const loadMerchants = async () => {
    setMerchantsLoading(true);
    try {
      const rows = await listMerchants();
      setMerchants(rows);
    } catch (e: unknown) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setMerchantsLoading(false);
    }
  };

  useEffect(() => {
    loadObservability().catch(() => {});
    loadMerchants().catch(() => {});
    const timer = setInterval(() => { loadObservability().catch(() => {}); }, 20000);
    return () => clearInterval(timer);
  }, []);

  const metrics: Stat[] = useMemo(() => {
    const m = obs?.metrics;
    return [
      { label: 'Outbox pending', value: m?.outboxPending ?? '—', tone: (m?.outboxPending || 0) > 0 ? 'warn' : 'ok' },
      { label: 'Outbox DEAD', value: m?.outboxDead ?? '—', tone: (m?.outboxDead || 0) > 0 ? 'danger' : 'ok' },
      { label: 'HTTP 5xx', value: m?.http5xx ?? '—', tone: (m?.http5xx || 0) > 0 ? 'danger' : 'ok' },
      { label: 'HTTP 4xx', value: m?.http4xx ?? '—', tone: (m?.http4xx || 0) > 100 ? 'warn' : 'ok' },
      { label: 'Breaker open', value: m?.circuitOpen ?? '—', tone: (m?.circuitOpen || 0) > 0 ? 'warn' : 'ok' },
      { label: 'Rate limited', value: m?.rateLimited ?? '—', tone: (m?.rateLimited || 0) > 0 ? 'warn' : 'ok' },
    ];
  }, [obs?.metrics]);

  const workerIssues = useMemo(
    () => (obs?.workers || []).filter((w) => w.expected && (!w.alive || w.stale)),
    [obs?.workers],
  );
  const incidents = useMemo(() => (obs?.incidents || []).slice(0, 4), [obs?.incidents]);
  const merchantStats = useMemo(() => {
    const total = merchants.length;
    const expired = merchants.filter((m) => m.subscriptionExpired).length;
    const expiring = merchants.filter((m) => !m.subscriptionExpired && m.subscriptionExpiresSoon).length;
    const loginDisabled = merchants.filter((m) => m.portalLoginEnabled === false).length;
    return { total, expired, expiring, loginDisabled };
  }, [merchants]);
  const latestMerchants = useMemo(
    () => [...merchants].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
    [merchants],
  );

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[#e6edf3]">Системный обзор</h1>
          <p className="text-sm text-[#9fb0c9]">
            Быстрый статус API, воркеров и мерчантов. Основа: реальные данные /observability/summary и /api/admin/*.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={loadMerchants} loading={merchantsLoading}>Обновить мерчантов</Button>
          <Button size="sm" onClick={loadObservability} loading={loading}>Обновить метрики</Button>
        </div>
      </div>

      {err && <div className="rounded-lg border border-[#3f1d2e] bg-[#2a0f1f] text-[#f38ba8] px-3 py-2 text-sm">{err}</div>}

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <Card title="Состояние API и Outbox" subtitle="Ключевые метрики и ошибки">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.map((m) => (
              <StatPill key={m.label} {...m} />
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[#1e2a44] bg-[#10182c] px-3 py-2 text-sm text-[#cbd5e1]">
              <div className="flex items-center justify-between">
                <span>Версия</span>
                <span className="font-semibold text-[#e6edf3]">{obs?.version || '—'}</span>
              </div>
              <div className="text-xs text-[#9fb0c9] mt-1">env: {obs?.env?.appVersion || '—'}</div>
            </div>
            <div className="rounded-lg border border-[#1e2a44] bg-[#10182c] px-3 py-2 text-sm text-[#cbd5e1]">
              <div className="flex items-center justify-between">
                <span>Incidents</span>
                <span className="font-semibold text-[#e6edf3]">{incidents.length || '—'}</span>
              </div>
              <div className="text-xs text-[#9fb0c9] mt-1">Последние события за период обновления</div>
            </div>
          </div>
        </Card>

        <Card title="Инциденты и воркеры" subtitle="Последние события и проверка тикеров">
          {incidents.length === 0 && <div className="text-sm text-[#9fb0c9]">Инцидентов нет</div>}
          <div className="grid gap-3">
            {incidents.map((it) => (
              <div key={it.id} className="rounded-lg border border-[#1e2a44] bg-[#10182c] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#e6edf3]">{it.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#16233d] text-[#cbd5e1] uppercase">{it.severity}</span>
                </div>
                <div className="text-xs text-[#9fb0c9] mt-1">{new Date(it.at).toLocaleString('ru-RU')}</div>
                <div className="text-sm text-[#cbd5e1] mt-1 whitespace-pre-wrap">{it.message}</div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="text-sm font-semibold text-[#e6edf3] mb-1">Проблемные воркеры</div>
            {workerIssues.length === 0 ? (
              <div className="text-sm text-[#9fb0c9]">Все ожидаемые воркеры отвечают</div>
            ) : (
              <div className="grid gap-2">
                {workerIssues.map((w) => (
                  <div key={w.name} className="flex items-center justify-between rounded border border-[#3f1d2e] bg-[#2a0f1f] px-3 py-2 text-sm text-[#f38ba8]">
                    <span>{w.name}</span>
                    <span className="text-xs text-[#f9e2af]">tick {w.lastTickAt ? new Date(w.lastTickAt).toLocaleTimeString('ru-RU') : '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4">
        <Card
          title="Мерчанты"
          subtitle="Сводка по активным / просроченным и быстрый доступ к последним"
          actions={<Link href="/merchants" className="text-sm text-[#89b4fa] hover:underline">Открыть список</Link>}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatBadge label="Всего" value={merchantStats.total} />
            <StatBadge label="Истекла подписка" value={merchantStats.expired} tone="danger" />
            <StatBadge label="Истекает скоро" value={merchantStats.expiring} tone="warn" />
            <StatBadge label="Логин отключён" value={merchantStats.loginDisabled} tone="warn" />
          </div>
          <div className="mt-4">
            <div className="text-sm font-semibold text-[#e6edf3] mb-2">Недавно добавленные</div>
            {latestMerchants.length === 0 && <div className="text-sm text-[#9fb0c9]">Мерчантов пока нет</div>}
            <div className="grid gap-2">
              {latestMerchants.map((m) => (
                <div key={m.id} className="rounded-lg border border-[#1e2a44] bg-[#10182c] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-[#e6edf3] truncate" title={m.name}>{m.name}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${m.subscriptionExpired ? 'bg-[#3f1d2e] text-[#f38ba8]' : m.subscriptionExpiresSoon ? 'bg-[#3b2a14] text-[#f9e2af]' : 'bg-[#123524] text-[#a6e3a1]'}`}>
                      {m.subscriptionExpired ? 'expired' : m.subscriptionExpiresSoon ? 'expiring' : 'active'}
                    </span>
                  </div>
                  <div className="text-xs text-[#9fb0c9] mt-1 flex items-center justify-between gap-2">
                    <span>{m.id}</span>
                    <span>{new Date(m.createdAt).toLocaleDateString('ru-RU')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatPill({ label, value, tone = 'ok' }: Stat) {
  const palette = tone === 'danger'
    ? { bg: '#2a0f1f', text: '#f38ba8', border: '#3f1d2e' }
    : tone === 'warn'
      ? { bg: '#33250f', text: '#f9e2af', border: '#4a3611' }
      : { bg: '#10241b', text: '#a6e3a1', border: '#1d3a2d' };
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
      <div className="text-xs text-[#9fb0c9]">{label}</div>
      <div className="text-lg font-semibold" style={{ color: palette.text }}>{value}</div>
    </div>
  );
}

function StatBadge({ label, value, tone = 'ok' }: Stat) {
  const text = tone === 'danger' ? '#f38ba8' : tone === 'warn' ? '#f9e2af' : '#e6edf3';
  const bg = tone === 'danger' ? '#2a0f1f' : tone === 'warn' ? '#33250f' : '#0e1629';
  return (
    <div className="rounded-lg border border-[#1e2a44] px-3 py-2" style={{ background: bg }}>
      <div className="text-xs text-[#9fb0c9]">{label}</div>
      <div className="text-xl font-semibold" style={{ color: text }}>{value}</div>
    </div>
  );
}
