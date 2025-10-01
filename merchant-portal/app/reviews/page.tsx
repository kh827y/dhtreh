"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Skeleton } from "@loyalty/ui";
import Toggle from "../../components/Toggle";
import StarRating from "../../components/StarRating";

const ratingOptions = [
  { value: "all", label: "Все оценки" },
  { value: "5", label: "⭐⭐⭐⭐⭐ 5 звёзд" },
  { value: "4", label: "⭐⭐⭐⭐ 4 звезды и выше" },
  { value: "3", label: "⭐⭐⭐ 3 звезды и выше" },
  { value: "2", label: "⭐⭐ 2 звезды и выше" },
  { value: "1", label: "⭐ 1 звезда и выше" },
];

const shareThresholdOptions = [
  { value: "5", label: "⭐⭐⭐⭐⭐ 5 звёзд" },
  { value: "4", label: "⭐⭐⭐⭐ 4 звезды и выше" },
  { value: "3", label: "⭐⭐⭐ 3 звезды и выше" },
  { value: "2", label: "⭐⭐ 2 звезды и выше" },
  { value: "1", label: "⭐ 1 звезда и выше" },
];

type ReviewItem = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  orderId?: string | null;
  customer: { id: string; name: string | null; phone: string | null };
  staff: { id: string; name: string | null } | null;
  outlet: { id: string; name: string | null } | null;
  hasResponse?: boolean;
};

type ReviewStats = {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: Record<number, number>;
  recommendationRate: number;
  responseRate: number;
  averageResponseTime: number;
  topTags: Array<{ tag: string; count: number }>;
};

type ReviewFiltersResponse = {
  outlets: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; name: string }>;
};

type ReviewsResponse = {
  items: ReviewItem[];
  total: number;
  hasMore: boolean;
  stats: ReviewStats;
  filters: ReviewFiltersResponse;
};

type SharePlatformState = {
  enabled: boolean;
  url: string;
};

type ReviewSettingsState = {
  notifyEnabled: boolean;
  notifyThreshold: string;
  emailEnabled: boolean;
  emailRecipients: string;
  telegramEnabled: boolean;
  shareEnabled: boolean;
  shareThreshold: string;
  share: {
    yandex: SharePlatformState;
    twoGis: SharePlatformState;
    google: SharePlatformState;
  };
};

const defaultSettings: ReviewSettingsState = {
  notifyEnabled: false,
  notifyThreshold: "5",
  emailEnabled: false,
  emailRecipients: "",
  telegramEnabled: false,
  shareEnabled: false,
  shareThreshold: "5",
  share: {
    yandex: { enabled: false, url: "" },
    twoGis: { enabled: false, url: "" },
    google: { enabled: false, url: "" },
  },
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 14px',
  fontSize: 12,
  textTransform: 'uppercase',
  color: 'rgba(148,163,184,0.8)',
  borderBottom: '1px solid rgba(148,163,184,0.16)',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 14,
  verticalAlign: 'top',
  borderBottom: '1px solid rgba(148,163,184,0.12)',
};

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString('ru-RU');
  } catch {
    return value;
  }
}

function parseEmails(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter((item, idx, arr) => item.length > 0 && arr.indexOf(item) === idx);
}

export default function ReviewsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [withCommentOnly, setWithCommentOnly] = React.useState(false);
  const [selectedOutlet, setSelectedOutlet] = React.useState("all");
  const [selectedStaff, setSelectedStaff] = React.useState("all");
  const [selectedRating, setSelectedRating] = React.useState("all");
  const [reviews, setReviews] = React.useState<ReviewItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [stats, setStats] = React.useState<ReviewStats | null>(null);
  const [outletOptions, setOutletOptions] = React.useState<Array<{ id: string; name: string }>>([]);
  const [staffOptions, setStaffOptions] = React.useState<Array<{ id: string; name: string }>>([]);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settings, setSettings] = React.useState<ReviewSettingsState>(defaultSettings);
  const [settingsDirty, setSettingsDirty] = React.useState(false);
  const [error, setError] = React.useState("");

  const loadReviews = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (withCommentOnly) params.set('withCommentOnly', '1');
      if (selectedRating !== 'all') params.set('ratingGte', selectedRating);
      if (selectedOutlet !== 'all') params.set('outletId', selectedOutlet);
      if (selectedStaff !== 'all') params.set('staffId', selectedStaff);
      params.set('limit', '50');
      const res = await fetch(`/api/portal/reviews?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ReviewsResponse;
      setReviews(data.items || []);
      setTotal(data.total || 0);
      setStats(data.stats || null);
      const outlets = [{ id: 'all', name: 'Все торговые точки' }, ...(data.filters?.outlets || [])];
      const staff = [{ id: 'all', name: 'Все сотрудники' }, ...(data.filters?.staff || [])];
      setOutletOptions(outlets);
      setStaffOptions(staff);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [withCommentOnly, selectedRating, selectedOutlet, selectedStaff]);

  const loadSettings = React.useCallback(async () => {
    try {
      const res = await fetch('/api/portal/reviews/settings');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSettings({
        notifyEnabled: !!data.notifyEnabled,
        notifyThreshold: String(data.notifyThreshold ?? 5),
        emailEnabled: !!data.emailEnabled,
        emailRecipients: Array.isArray(data.emailRecipients) ? data.emailRecipients.join(', ') : '',
        telegramEnabled: !!data.telegramEnabled,
        shareEnabled: !!data.shareEnabled,
        shareThreshold: String(data.shareThreshold ?? 5),
        share: {
          yandex: {
            enabled: !!data.sharePlatforms?.yandex?.enabled,
            url: data.sharePlatforms?.yandex?.url ?? '',
          },
          twoGis: {
            enabled: !!data.sharePlatforms?.twoGis?.enabled,
            url: data.sharePlatforms?.twoGis?.url ?? '',
          },
          google: {
            enabled: !!data.sharePlatforms?.google?.enabled,
            url: data.sharePlatforms?.google?.url ?? '',
          },
        },
      });
      setSettingsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  React.useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  React.useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSettings = React.useCallback(
    (updater: (prev: ReviewSettingsState) => ReviewSettingsState) => {
      setSettings((prev) => {
        const next = updater(prev);
        setSettingsDirty(true);
        return next;
      });
    },
    [],
  );

  const handleSaveSettings = React.useCallback(async () => {
    setSaving(true);
    try {
      const payload = {
        notifyEnabled: settings.notifyEnabled,
        notifyThreshold: Number(settings.notifyThreshold) || 5,
        emailEnabled: settings.emailEnabled,
        emailRecipients: parseEmails(settings.emailRecipients),
        telegramEnabled: settings.telegramEnabled,
        shareEnabled: settings.shareEnabled,
        shareThreshold: Number(settings.shareThreshold) || 5,
        shareYandex: { enabled: settings.share.yandex.enabled, url: settings.share.yandex.url || null },
        shareTwoGis: { enabled: settings.share.twoGis.enabled, url: settings.share.twoGis.url || null },
        shareGoogle: { enabled: settings.share.google.enabled, url: settings.share.google.url || null },
      };
      const res = await fetch('/api/portal/reviews/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadSettings();
      setSettingsDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [settings, loadSettings]);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Отзывы</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Собирайте обратную связь после покупки и улучшайте качество сервиса.
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, maxWidth: 520 }}>
            Клиентам предлагается оценить визит прямо в миниприложении. Хорошим оценкам можно предложить поделиться отзывом в сторонних сервисах.
          </div>
        </div>
        <Button variant="primary" onClick={() => setSettingsOpen(true)}>Настройки</Button>
      </div>

      <Card>
        <CardHeader title="Фильтры" subtitle="Уточните выборку отзывов" />
        <CardBody>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={withCommentOnly} onChange={(e) => setWithCommentOnly(e.target.checked)} />
              Только с комментариями
            </label>
            <select value={selectedOutlet} onChange={(e) => setSelectedOutlet(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
              {outletOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.name}</option>
              ))}
            </select>
            <select value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
              {staffOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.name}</option>
              ))}
            </select>
            <select value={selectedRating} onChange={(e) => setSelectedRating(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
              {ratingOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Отзывы" subtitle={`${total} записей`} />
        <CardBody>
          {error && !loading && (
            <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(248,113,113,0.12)', color: '#f87171' }}>{error}</div>
          )}
          {loading ? (
            <Skeleton height={220} />
          ) : reviews.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Клиент</th>
                    <th style={thStyle}>Оценка</th>
                    <th style={thStyle}>Комментарий</th>
                    <th style={thStyle}>Сотрудник</th>
                    <th style={thStyle}>Торговая точка</th>
                    <th style={thStyle}>Дата визита</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((row) => (
                    <tr key={row.id}>
                      <td style={tdStyle}>
                        <a href={`/customers/${row.customer.id}`} style={{ color: '#818cf8', textDecoration: 'none' }}>
                          {row.customer.name || row.customer.phone || row.customer.id}
                        </a>
                      </td>
                      <td style={tdStyle}>
                        <StarRating rating={row.rating} size={18} />
                      </td>
                      <td style={tdStyle}>{row.comment ? row.comment : <span style={{ opacity: 0.6 }}>Без комментария</span>}</td>
                      <td style={tdStyle}>{row.staff?.name || '—'}</td>
                      <td style={tdStyle}>{row.outlet?.name || '—'}</td>
                      <td style={tdStyle}>{formatDate(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: 16, opacity: 0.7 }}>Отзывов не найдено</div>
          )}
        </CardBody>
      </Card>

      {stats && (
        <Card>
          <CardHeader title="Статистика" />
          <CardBody>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.averageRating.toFixed(1)}</div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Средняя оценка</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{stats.totalReviews}</div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Всего отзывов</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{stats.recommendationRate}%</div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Рекомендуют сервис</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{stats.responseRate}%</div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Есть ответ от мерчанта</div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)', zIndex: 90, display: 'flex', alignItems: 'flex-end' }} onClick={() => setSettingsOpen(false)}>
          <div style={{ background: 'rgba(12,18,32,0.98)', width: '100%', maxWidth: 520, margin: '0 auto', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: '24px 20px 28px', border: '1px solid rgba(148,163,184,0.22)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Настройки отзывов</div>
              <button onClick={() => setSettingsOpen(false)} style={{ border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }} aria-label="Закрыть">✕</button>
            </div>

            <div style={{ display: 'grid', gap: 18 }}>
              <Toggle
                checked={settings.notifyEnabled}
                onChange={(value) => updateSettings((prev) => ({ ...prev, notifyEnabled: value }))}
                label="Уведомлять о новых оценках"
              />
              {settings.notifyEnabled && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.75 }}>Оценка для уведомления</label>
                  <select value={settings.notifyThreshold} onChange={(e) => updateSettings((prev) => ({ ...prev, notifyThreshold: e.target.value }))} style={{ padding: 10, borderRadius: 10 }}>
                    {ratingOptions.filter((opt) => opt.value !== 'all').map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <Toggle
                checked={settings.emailEnabled}
                onChange={(value) => updateSettings((prev) => ({ ...prev, emailEnabled: value }))}
                label="Отправлять оценки на электронную почту"
              />
              {settings.emailEnabled && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 13, opacity: 0.75 }}>Список адресов (через запятую)</label>
                  <textarea
                    value={settings.emailRecipients}
                    onChange={(e) => updateSettings((prev) => ({ ...prev, emailRecipients: e.target.value }))}
                    style={{ padding: 10, borderRadius: 10, minHeight: 70 }}
                    placeholder="support@example.com, manager@example.com"
                  />
                </div>
              )}

              <Toggle
                checked={settings.telegramEnabled}
                onChange={(value) => updateSettings((prev) => ({ ...prev, telegramEnabled: value }))}
                label="Оповещать об оценках в Telegram"
              />

              <Toggle
                checked={settings.shareEnabled}
                onChange={(value) => updateSettings((prev) => ({ ...prev, shareEnabled: value }))}
                label="Улучшать отзывы на внешних площадках"
              />

              {settings.shareEnabled && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ fontSize: 13, opacity: 0.75 }}>Предлагать поделиться при оценке</label>
                    <select value={settings.shareThreshold} onChange={(e) => updateSettings((prev) => ({ ...prev, shareThreshold: e.target.value }))} style={{ padding: 10, borderRadius: 10 }}>
                      {shareThresholdOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ fontSize: 12, opacity: 0.65 }}>
                    Для каждой платформы укажите ссылку. Кнопки увидят клиенты, поставившие высокую оценку.
                  </div>

                  {(['yandex', 'twoGis', 'google'] as const).map((platform) => {
                    const label = platform === 'yandex' ? 'Яндекс.Карты' : platform === 'twoGis' ? '2ГИС' : 'Google';
                    const value = settings.share[platform];
                    return (
                      <div key={platform} style={{ display: 'grid', gap: 8 }}>
                        <Toggle
                          checked={value.enabled}
                          onChange={(enabled) => updateSettings((prev) => ({
                            ...prev,
                            share: {
                              ...prev.share,
                              [platform]: { ...prev.share[platform], enabled },
                            },
                          }))}
                          label={`Показывать кнопку «${label}»`}
                        />
                        {value.enabled && (
                          <input
                            value={value.url}
                            onChange={(e) => updateSettings((prev) => ({
                              ...prev,
                              share: {
                                ...prev.share,
                                [platform]: { ...prev.share[platform], url: e.target.value },
                              },
                            }))}
                            placeholder={`https://... ссылка на карточку ${label}`}
                            style={{ padding: 10, borderRadius: 10 }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                <Button variant="secondary" onClick={() => { loadSettings(); setSettingsDirty(false); }}>Сбросить</Button>
                <Button variant="primary" disabled={!settingsDirty || saving} onClick={handleSaveSettings}>
                  {saving ? 'Сохраняем…' : 'Сохранить'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
