"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Skeleton } from "@loyalty/ui";
import Toggle from "../../../components/Toggle";
import Sparkline from "../../../components/Sparkline";
import TagSelect from "../../../components/TagSelect";
import { Calendar, Users2, TrendingUp, PlusCircle, X, RefreshCw, Bell, Flame } from "lucide-react";

const ALL_AUDIENCE_VALUE = "__ALL__";

const tabs = [
  { id: "UPCOMING" as const, label: "Предстоящие" },
  { id: "ACTIVE" as const, label: "Активные" },
  { id: "PAST" as const, label: "Прошедшие" },
];

type CampaignReward = {
  awardPoints: boolean;
  points: number;
  pointsExpire: boolean;
  pointsExpireDays?: number | null;
};

type CampaignNotification = {
  pushOnStart: boolean;
  pushMessage?: string;
  pushReminder: boolean;
  pushReminderMessage?: string;
};

type Campaign = {
  id: string;
  name: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  segmentId: string | null;
  segmentName: string;
  totalAudience: number; // всего в аудитории
  usedCount: number; // активировали/получили бонус
  revenueSeries: number[];
  launched: boolean;
  createdAt: string;
  reward: CampaignReward;
  notifications: CampaignNotification;
};

type AudienceOption = { value: string; label: string; description?: string; size?: number };

type ActionFormState = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  audience: string;
  awardPoints: boolean;
  points: string;
  pointsExpire: boolean;
  pushOnStart: boolean;
  pushMessage: string;
  pushReminder: boolean;
  pushReminderMessage: string;
  launched: boolean;
};

const defaultForm: ActionFormState = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  audience: "",
  awardPoints: true,
  points: "100",
  pointsExpire: false,
  pushOnStart: false,
  pushMessage: "",
  pushReminder: false,
  pushReminderMessage: "",
  launched: true,
};

// удалены мок-данные: работаем только с реальным API

function computeTab(action: Campaign, now = new Date()): "UPCOMING" | "ACTIVE" | "PAST" {
  const start = action.startDate ? new Date(action.startDate) : null;
  const end = action.endDate ? new Date(action.endDate) : null;
  if (action.launched) {
    if (end && end < now) return "PAST";
    if (start && start > now) return "UPCOMING";
    return "ACTIVE";
  }
  // not launched -> treat as upcoming by default
  if (start && start <= now && (!end || end >= now)) {
    return "ACTIVE";
  }
  if (start && start > now) return "UPCOMING";
  if (end && end < now) return "PAST";
  return "UPCOMING";
}

const PushPreview: React.FC<{ title: string; message: string }> = ({ title, message }) => (
  <div
    style={{
      background: "linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.92))",
      border: "1px solid rgba(148,163,184,0.2)",
      borderRadius: 14,
      padding: "12px 16px",
      minWidth: 220,
      color: "#e2e8f0",
      fontSize: 13,
      boxShadow: "0 16px 40px rgba(15,23,42,0.35)",
    }}
  >
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Bell size={16} />
      </div>
      <div style={{ fontWeight: 600 }}>{title || "Уведомление"}</div>
    </div>
    <div style={{ marginTop: 6, lineHeight: 1.4 }}>{message || "Текст уведомления"}</div>
  </div>
);

export default function ActionsEarnPage() {
  const [tab, setTab] = React.useState<typeof tabs[number]['id']>('ACTIVE');
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState<ActionFormState>(defaultForm);
  const [saving, setSaving] = React.useState(false);
  const [audiences, setAudiences] = React.useState<AudienceOption[]>([]);
  const [audLoading, setAudLoading] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [allCustomersTotal, setAllCustomersTotal] = React.useState<number | null>(null);
  const now = React.useMemo(() => new Date(), []);

  const loadCampaigns = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/portal/loyalty/promotions');
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const mapped: Campaign[] = Array.isArray(json)
        ? json.map((item: any) => {
          const reward: CampaignReward = {
            awardPoints: (item.reward?.type || '').toUpperCase() === 'POINTS',
            points: Number(item.reward?.value ?? 0) || 0,
            pointsExpire: Boolean(item.reward?.metadata?.pointsExpire ?? item.metadata?.pointsExpire),
            pointsExpireDays: item.reward?.metadata?.pointsExpireDays ?? item.metadata?.pointsExpireDays ?? null,
          };
          const notifications: CampaignNotification = {
            pushOnStart: Boolean(item.metadata?.pushOnStart),
            pushMessage: item.metadata?.pushMessage || '',
            pushReminder: Boolean(item.metadata?.pushReminder),
            pushReminderMessage: item.metadata?.pushReminderMessage || '',
          };
          const revenueSeries: number[] = Array.isArray(item.analytics?.revenueSeries)
            ? item.analytics.revenueSeries
            : [];
          const totalAudience =
            item.segment?._count?.customers ??
            item.segment?.customersCount ??
            item.analytics?.metrics?.audienceTotal ??
            item.analytics?.audienceTotal ??
            0;
          const usedCount = item.analytics?.metrics?.participantsCount ?? item.analytics?.participantsCount ?? 0;
          const segmentIdVal = (Object.prototype.hasOwnProperty.call(item, 'targetSegmentId'))
            ? item.targetSegmentId
            : (item.segment?.id ?? null);
          const segmentNameVal = segmentIdVal ? (item.segment?.name || 'Сегмент') : 'Все клиенты';
          return {
            id: item.id,
            name: item.name || 'Без названия',
            description: item.description || '',
            startDate: item.startDate || null,
            endDate: item.endDate || null,
            segmentId: segmentIdVal || null,
            segmentName: segmentNameVal,
            totalAudience,
            usedCount,
            revenueSeries,
            launched: item.status === 'ACTIVE' || item.status === 'PAUSED',
            createdAt: item.createdAt || new Date().toISOString(),
            reward,
            notifications,
          } as Campaign;
        })
        : [];
      setCampaigns(mapped);
    } catch (e: any) {
      try {
        setError(String(e?.message || e));
      } catch (err) {
        setError('Ошибка загрузки акций');
      }
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudiences = React.useCallback(async () => {
    setAudLoading(true);
    try {
      const res = await fetch('/api/portal/audiences');
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const base: AudienceOption[] = Array.isArray(json)
        ? json.map((a: any) => ({
            value: a.id,
            label: a.name || 'Без названия',
            description: a.description || '',
            size: a._count?.customers ?? a.customersCount ?? undefined,
          }))
        : [];
      const allOption: AudienceOption = {
        value: ALL_AUDIENCE_VALUE,
        label: 'Все клиенты',
        description: 'Без ограничений по сегменту',
      };
      setAudiences([allOption, ...base]);
    } catch {
      setAudiences([]);
    } finally {
      setAudLoading(false);
    }
  }, []);

  const loadAllCustomersTotal = React.useCallback(async () => {
    // Плейсхолдер до загрузки
    setAllCustomersTotal(null);
    try {
      const res = await fetch('/api/portal/analytics/customers');
      if (!res.ok) return;
      const json: any = await res.json();
      const v = Number(json?.totalCustomers);
      if (Number.isFinite(v)) setAllCustomersTotal(v);
    } catch {}
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all([loadCampaigns(), loadAudiences(), loadAllCustomersTotal()]);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCampaigns, loadAudiences, loadAllCustomersTotal]);

  const filtered = React.useMemo(() =>
    campaigns.filter((item) => computeTab(item, now) === tab),
  [campaigns, tab, now]);

  const handleCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setShowCreate(true);
  };

  const handleOpenEdit = (c: Campaign) => {
    setEditingId(c.id);
    setForm({
      name: c.name || '',
      description: c.description || '',
      startDate: c.startDate ? c.startDate.slice(0, 10) : '',
      endDate: c.endDate ? c.endDate.slice(0, 10) : '',
      audience: c.segmentId || '',
      awardPoints: !!c.reward.awardPoints,
      points: String(c.reward.points || 0),
      pointsExpire: !!c.reward.pointsExpire,
      pushOnStart: !!c.notifications.pushOnStart,
      pushMessage: c.notifications.pushMessage || '',
      pushReminder: !!c.notifications.pushReminder,
      pushReminderMessage: c.notifications.pushReminderMessage || '',
      launched: c.launched,
    });
    setShowCreate(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      alert('Укажите название акции');
      return;
    }
    // Аудитория может быть пустой ("Все клиенты")
    if (form.awardPoints && Number(form.points || 0) <= 0) {
      alert('Укажите количество баллов');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        status: form.launched ? 'ACTIVE' : 'DRAFT',
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        targetSegmentId: form.audience || null,
        type: 'BONUS',
        reward: {
          type: 'POINTS',
          value: Number(form.points || 0),
          metadata: {
            pointsExpire: form.pointsExpire,
            pointsExpireDays: form.pointsExpire ? 30 : undefined,
          },
        },
        metadata: {
          pushOnStart: form.pushOnStart,
          pushMessage: form.pushMessage,
          pushReminder: form.pushReminder,
          pushReminderMessage: form.pushReminderMessage,
          // напоминание за 2 дня до конца
          reminderOffsetHours: form.pushReminder ? 48 : null,
        },
        rules: {},
      };
      if (editingId) {
        await fetch(`/api/portal/loyalty/promotions/${encodeURIComponent(editingId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch('/api/portal/loyalty/promotions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      await loadCampaigns();
      setShowCreate(false);
    } finally {
      setSaving(false);
    }
  };

  const renderCard = (campaign: Campaign) => {
    const isInactive = !campaign.launched;
    const baseTotal = Math.max(0, Number(campaign.totalAudience || 0));
    const isAllCustomers = !campaign.segmentId || /^(все\s+клиенты|all\s+customers)$/i.test(campaign.segmentName || '');
    const total = isAllCustomers ? (allCustomersTotal ?? 0) : baseTotal;
    const used = Math.min(total, Math.max(0, Number(campaign.usedCount || 0)));
    const ignored = Math.max(0, total - used);
    const usedShare = total ? Math.round((used / total) * 100) : 0;
    const ignoredShare = total ? Math.round((ignored / total) * 100) : 0;
    const revLast = Number(
      campaign.revenueSeries && campaign.revenueSeries.length > 0
        ? campaign.revenueSeries[campaign.revenueSeries.length - 1]
        : 0
    ) || 0;
    const sumRev = campaign.revenueSeries?.reduce((a, b) => a + b, 0) || 0;
    const showRevStats = revLast > 0 || sumRev > 0;
    return (
      <div
        key={campaign.id}
        role="button"
        tabIndex={0}
        onClickCapture={() => handleOpenEdit(campaign)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenEdit(campaign); } }}
        style={{ cursor: 'pointer' }}
      >
      <Card
        style={{ position: 'relative', overflow: 'hidden' }}
      >
        {/* Убрана визуальная метка 'Акция не запущена' по требованию */}
        <CardHeader title={campaign.name} />
        <CardBody>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.1fr 1fr 1.2fr',
              gap: 20,
              alignItems: 'stretch',
            }}
          >
            {/* Left: Info */}
            <div style={{ display: 'grid', gap: 10 }}>
              {campaign.description && (
                <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{campaign.description}</div>
              )}
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <Calendar size={16} />
                  <span>{formatRange(campaign.startDate, campaign.endDate)}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <Users2 size={16} />
                  <span>Аудитория: {campaign.segmentName || '—'}</span>
                </div>
                {campaign.reward.awardPoints ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                    <Flame size={16} />
                    <span>{campaign.reward.points} баллов</span>
                    {campaign.reward.pointsExpire && (
                      <span style={{ opacity: 0.6 }}>сгорают после окончания</span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, opacity: 0.7 }}>Без начисления баллов</div>
                )}
              </div>
            </div>

            {/* Middle: Audience shares */}
            <div
              style={{
                display: 'grid',
                gap: 10,
                padding: 12,
                border: '1px solid rgba(148,163,184,0.18)',
                borderRadius: 12,
                background: 'rgba(148,163,184,0.08)'
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: 12, alignItems: 'baseline' }}>
                <span style={{ fontSize: 13 }}>Вся аудитория</span>
                <strong style={{ fontSize: 13 }}>
                  {isAllCustomers
                    ? (allCustomersTotal === null ? '—' : allCustomersTotal.toLocaleString('ru-RU'))
                    : total.toLocaleString('ru-RU')}
                </strong>
                <span style={{ fontSize: 13 }}>Воспользовались</span>
                <strong style={{ fontSize: 13 }}>{used.toLocaleString('ru-RU')} {total ? `(${usedShare}%)` : ''}</strong>
                <span style={{ fontSize: 13 }}>Проигнорировали</span>
                <strong style={{ fontSize: 13 }}>{ignored.toLocaleString('ru-RU')} {total ? `(${ignoredShare}%)` : ''}</strong>
              </div>
              <div style={{ height: 8, borderRadius: 6, background: 'rgba(148,163,184,0.25)', overflow: 'hidden' }}>
                <div style={{ width: `${usedShare}%`, height: '100%', background: 'linear-gradient(90deg, rgba(99,102,241,0.95), rgba(129,140,248,0.9))' }} />
              </div>
            </div>

            {/* Right: Revenue sparkline */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'flex-end' }}>
              <Sparkline data={campaign.revenueSeries} width={360} height={96} />
              {showRevStats && (
                <div style={{ display: 'grid', gap: 2, fontSize: 12, textAlign: 'right' }}>
                  <div style={{ opacity: 0.7 }}>Последний период</div>
                  <div style={{ fontWeight: 600 }}>{revLast.toLocaleString('ru-RU')} ₽</div>
                  <div style={{ opacity: 0.7 }}>Σ {sumRev.toLocaleString('ru-RU')} ₽</div>
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Акции</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Создавайте и управляйте кампаниями с повышенным начислением баллов</div>
        </div>
        <Button variant="primary" onClick={handleCreate} startIcon={<PlusCircle size={16} />}>Создать акцию</Button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            className="btn"
            onClick={() => setTab(t.id)}
            style={{
              minWidth: 140,
              background: tab === t.id ? 'var(--brand-primary)' : 'rgba(255,255,255,0.05)',
              color: tab === t.id ? '#0f172a' : '#f8fafc',
              fontWeight: tab === t.id ? 600 : 500,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}

      <Card>
        <CardHeader title={`${tabs.find((t) => t.id === tab)?.label}`} subtitle={`${filtered.length} акция(ий)`} />
        <CardBody>
          {loading ? (
            <Skeleton height={240} />
          ) : filtered.length ? (
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr' }}>
              {filtered.map(renderCard)}
            </div>
          ) : (
            <div style={{ padding: 16, opacity: 0.7 }}>Нет акций в этом разделе</div>
          )}
        </CardBody>
      </Card>

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.72)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 80 }}>
          <div style={{ width: 'min(900px, 96vw)', maxHeight: '92vh', overflow: 'auto', background: 'rgba(12,16,26,0.96)', borderRadius: 18, border: '1px solid rgba(148,163,184,0.14)', boxShadow: '0 30px 80px rgba(2,6,23,0.5)', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(148,163,184,0.14)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{editingId ? 'Редактировать акцию' : 'Создать акцию'}</div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Заполните параметры для начисления баллов</div>
              </div>
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}><X size={18} /></button>
            </div>

            <div style={{ padding: 24, display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gap: 12 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>Название акции (видно только вам)</label>
                <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Например, Лето x2" style={{ padding: 12, borderRadius: 10 }} />
                <textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Краткое описание для команды" style={{ padding: 12, borderRadius: 10, minHeight: 80, resize: 'vertical' }} />
              </div>

              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
                <DateButton
                  label="Дата начала"
                  value={form.startDate}
                  defaultLabel="Сразу"
                  onChange={(value) => setForm((prev) => ({ ...prev, startDate: value }))}
                />
                <DateButton
                  label="Дата завершения"
                  value={form.endDate}
                  defaultLabel="Бессрочно"
                  onChange={(value) => setForm((prev) => ({ ...prev, endDate: value }))}
                />
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>Аудитория, кому доступна акция</label>
                  <button
                    className="btn btn-ghost"
                    title="Обновить размер аудитории"
                    onClick={async () => {
                      if (!form.audience) return;
                      await fetch(`/api/portal/audiences/${encodeURIComponent(form.audience)}/refresh`, { method: 'POST' });
                      await loadAudiences();
                    }}
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
                <TagSelect
                  options={audiences}
                  value={form.audience ? [form.audience] : [ALL_AUDIENCE_VALUE]}
                  onChange={(values) => {
                    const v = values[0];
                    const next = !v || v === ALL_AUDIENCE_VALUE ? '' : v;
                    setForm((prev) => ({ ...prev, audience: next }));
                  }}
                  allowMultiple={false}
                  placeholder="Выберите аудиторию"
                />
                {form.audience && (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Размер аудитории: {audiences.find(a => a.value === form.audience)?.size?.toLocaleString('ru-RU') ?? '—'}
                  </div>
                )}
                <div style={{ fontSize: 12, opacity: 0.7 }}>Если вы не нашли подходящей аудитории, <a href="/audiences" style={{ color: '#818cf8', textDecoration: 'underline' }}>создайте новую</a></div>
              </div>

              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Toggle checked={form.awardPoints} onChange={(value) => setForm((prev) => ({ ...prev, awardPoints: value }))} label="Начислить баллы" />
                  {form.awardPoints && (
                    <input value={form.points} onChange={(e) => setForm((prev) => ({ ...prev, points: e.target.value.replace(/[^0-9]/g, '') || '0' }))} placeholder="Введите количество баллов" style={{ padding: 10, borderRadius: 10, width: 180 }} />
                  )}
                </div>
                {form.awardPoints && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Toggle checked={form.pointsExpire} onChange={(value) => setForm((prev) => ({ ...prev, pointsExpire: value }))} label="Баллы сгорают после окончания акции" />
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 16 }}>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
                  <NotificationEditor
                    title="PUSH-уведомление при старте"
                    enabled={form.pushOnStart}
                    message={form.pushMessage}
                    onToggle={(value) => setForm((prev) => ({ ...prev, pushOnStart: value }))}
                    onChange={(value) => setForm((prev) => ({ ...prev, pushMessage: value }))}
                  />
                  <NotificationEditor
                    title="Повторить за 2 дня до конца"
                    enabled={form.pushReminder}
                    message={form.pushReminderMessage}
                    onToggle={(value) => setForm((prev) => ({ ...prev, pushReminder: value }))}
                    onChange={(value) => setForm((prev) => ({ ...prev, pushReminderMessage: value }))}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Toggle checked={form.launched} onChange={(value) => setForm((prev) => ({ ...prev, launched: value }))} label="Запустить акцию" />
                <span style={{ fontSize: 12, opacity: 0.7 }}>{form.launched ? 'Сразу появится в активных акциях' : 'Будет сохранена как черновик'}</span>
              </div>
            </div>

            <div style={{ padding: '18px 24px', borderTop: '1px solid rgba(148,163,184,0.14)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn" onClick={() => setShowCreate(false)} disabled={saving}>Отмена</button>
              <Button variant="primary" onClick={handleSubmit} disabled={saving} startIcon={<PlusCircle size={16} />}>
                {saving ? 'Сохраняем…' : (editingId ? 'Сохранить' : 'Создать акцию')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type DateButtonProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  defaultLabel: string;
};

const DateButton: React.FC<DateButtonProps> = ({ label, value, onChange, defaultLabel }) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const display = value ? new Date(value).toLocaleDateString('ru-RU') : defaultLabel;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label style={{ fontSize: 13, opacity: 0.8 }}>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn" onClick={() => inputRef.current?.showPicker?.() ?? inputRef.current?.click()} style={{ minWidth: 160 }}>{display}</button>
        <button className="btn btn-ghost" onClick={() => onChange('')} title="Сбросить"><X size={16} /></button>
      </div>
      <input ref={inputRef} type="date" value={value} onChange={(e) => onChange(e.target.value)} style={{ display: 'none' }} />
    </div>
  );
};

type NotificationEditorProps = {
  title: string;
  enabled: boolean;
  message: string;
  onToggle: (value: boolean) => void;
  onChange: (value: string) => void;
};

const NotificationEditor: React.FC<NotificationEditorProps> = ({ title, enabled, message, onToggle, onChange }) => (
  <div style={{
    padding: 16,
    border: '1px solid rgba(148,163,184,0.18)',
    borderRadius: 14,
    background: 'rgba(148,163,184,0.08)',
    display: 'grid',
    gap: 10,
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>
      <Toggle checked={enabled} onChange={onToggle} label={enabled ? 'Вкл' : 'Выкл'} />
    </div>
    {enabled && (
      <div style={{ display: 'grid', gap: 8 }}>
        <textarea value={message} onChange={(e) => onChange(e.target.value.slice(0, 300))} placeholder="Текст уведомления" style={{ padding: 10, borderRadius: 10, minHeight: 90 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, opacity: 0.7 }}>
          <span>Используйте переменные: {"{name}"}</span>
          <span>{message.length}/300</span>
        </div>
        <PushPreview title="Пуш-уведомление" message={message} />
      </div>
    )}
  </div>
);

function formatRange(from: string | null, to: string | null) {
  if (!from && !to) return 'Бессрочно';
  if (from && to) return `${new Date(from).toLocaleDateString('ru-RU')} — ${new Date(to).toLocaleDateString('ru-RU')}`;
  if (from) return `с ${new Date(from).toLocaleDateString('ru-RU')}`;
  if (to) return `до ${new Date(to).toLocaleDateString('ru-RU')}`;
  return '—';
}
