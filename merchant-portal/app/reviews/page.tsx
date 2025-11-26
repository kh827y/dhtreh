"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Skeleton } from "@loyalty/ui";
import Toggle from "../../components/Toggle";
import StarRating from "../../components/StarRating";

type SelectOption = { value: string; label: string };

type ApiReviewItem = {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  customer?: { id: string; name?: string | null; phone?: string | null; email?: string | null } | null;
  staff?: { id: string; name?: string | null } | null;
  outlet?: { id: string; name?: string | null } | null;
  deviceId?: string | null;
};

type ReviewsApiResponse = {
  items?: ApiReviewItem[];
  total?: number;
  outlets?: Array<{ id: string; name?: string | null }>;
  staff?: Array<{ id: string; name?: string | null }>;
};

type ReviewRow = {
  id: string;
  customer: { id: string; name: string };
  rating: number;
  comment: string | null;
   device: string | null;
  staff: string;
  outlet: string;
  createdAt: string;
};

const ratingFilters = [
  { value: "5", label: "⭐⭐⭐⭐⭐ 5 звезд и ниже" },
  { value: "4", label: "⭐⭐⭐⭐ 4 звезды и ниже" },
  { value: "3", label: "⭐⭐⭐ 3 звезды и ниже" },
  { value: "2", label: "⭐⭐ 2 звезды и ниже" },
  { value: "1", label: "⭐ 1 звезда" },
];

const shareThresholds = [
  { value: "5", label: "⭐⭐⭐⭐⭐ 5 звезд" },
  { value: "4", label: "⭐⭐⭐⭐ 4 звезды и выше" },
  { value: "3", label: "⭐⭐⭐ 3 звезды и выше" },
  { value: "2", label: "⭐⭐ 2 звезды и выше" },
  { value: "1", label: "⭐ 1 звезда и выше" },
];

export default function ReviewsPage() {
  const [loading, setLoading] = React.useState(false);
  const [withCommentOnly, setWithCommentOnly] = React.useState(false);
  const [selectedOutlet, setSelectedOutlet] = React.useState("all");
  const [selectedStaff, setSelectedStaff] = React.useState("all");
  const [reviews, setReviews] = React.useState<ReviewRow[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [outletOptions, setOutletOptions] = React.useState<SelectOption[]>([
    { value: "all", label: "Все торговые точки" },
  ]);
  const [staffOptions, setStaffOptions] = React.useState<SelectOption[]>([
    { value: "all", label: "Все сотрудники" },
  ]);
  const fetchIdRef = React.useRef(0);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsSnapshot, setSettingsSnapshot] = React.useState<any | null>(null);
  const [settingsError, setSettingsError] = React.useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = React.useState(false);

  const [notifyEnabled, setNotifyEnabled] = React.useState(true);
  const [notifyThreshold, setNotifyThreshold] = React.useState("3");
  const [emailEnabled, setEmailEnabled] = React.useState(false);
  const [emailTargets, setEmailTargets] = React.useState("support@merchant.ru");
  const [telegramEnabled, setTelegramEnabled] = React.useState(true);
  const [shareEnabled, setShareEnabled] = React.useState(false);
  const [shareThreshold, setShareThreshold] = React.useState("5");
  const [sharePlatforms, setSharePlatforms] = React.useState<{ yandex: boolean; twogis: boolean; google: boolean }>({ yandex: true, twogis: false, google: false });

  const applyShareSettings = React.useCallback((data: any) => {
    const share = data?.rulesJson?.reviewsShare;
    setShareEnabled(Boolean(share?.enabled));
    const th = Number(share?.threshold);
    const normalized = Number.isFinite(th) ? Math.min(5, Math.max(1, Math.round(th))) : 5;
    setShareThreshold(String(normalized));
    const platforms = share?.platforms && typeof share.platforms === "object" ? share.platforms : {};
    setSharePlatforms({
      yandex: Boolean(platforms?.yandex?.enabled),
      twogis: Boolean(platforms?.twogis?.enabled),
      google: Boolean(platforms?.google?.enabled),
    });
  }, []);

  React.useEffect(() => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    let cancelled = false;
    const params = new URLSearchParams();
    if (withCommentOnly) params.set("withCommentOnly", "1");
    if (selectedOutlet !== "all") params.set("outletId", selectedOutlet);
    if (selectedStaff !== "all") params.set("staffId", selectedStaff);
    const search = params.toString();
    (async () => {
      try {
        const res = await fetch(`/api/portal/reviews${search ? `?${search}` : ""}`, { cache: "no-store" });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Ошибка ${res.status}`);
        }
        const data = (await res.json()) as ReviewsApiResponse;
        if (cancelled || fetchIdRef.current !== fetchId) return;

        const normalizedReviews: ReviewRow[] = Array.isArray(data?.items)
          ? data.items
              .filter((item): item is ApiReviewItem => !!item && typeof item === "object")
              .map((item) => {
                const customerId = typeof item.customer?.id === "string" ? item.customer.id.trim() : "";
                const customerName =
                  (item.customer?.name && item.customer.name.trim()) ||
                  (item.customer?.phone && item.customer.phone.trim()) ||
                  (item.customer?.email && item.customer.email.trim()) ||
                  "—";
                const rawDeviceId = typeof item.deviceId === "string" ? item.deviceId.trim() : "";
                const device = rawDeviceId || "—";
                const staffName = (item.staff?.name || "").trim() || "—";
                const outletName = (item.outlet?.name || "").trim() || "—";
                const comment = typeof item.comment === "string" ? item.comment.trim() : "";
                return {
                  id: item.id,
                  rating: item.rating,
                  comment: comment.length > 0 ? comment : null,
                  createdAt: item.createdAt,
                  customer: { id: customerId, name: customerName },
                  device,
                  staff: staffName,
                  outlet: outletName,
                };
              })
          : [];

        setReviews(normalizedReviews);
        setTotalCount(typeof data?.total === "number" ? data.total : normalizedReviews.length);

        const nextOutletOptions: SelectOption[] = [
          { value: "all", label: "Все торговые точки" },
          ...(Array.isArray(data?.outlets)
            ? data.outlets
                .filter((item): item is { id: string; name?: string | null } => !!item && typeof item === "object")
                .map((item) => ({
                  value: item.id,
                  label: (item.name || "").trim() || "Без названия",
                }))
            : []),
        ];
        setOutletOptions(nextOutletOptions);
        if (selectedOutlet !== "all" && !nextOutletOptions.some((opt) => opt.value === selectedOutlet)) {
          setSelectedOutlet("all");
        }

        const nextStaffOptions: SelectOption[] = [
          { value: "all", label: "Все сотрудники" },
          ...(Array.isArray(data?.staff)
            ? data.staff
                .filter((item): item is { id: string; name?: string | null } => !!item && typeof item === "object")
                .map((item) => ({
                  value: item.id,
                  label: (item.name || "").trim() || item.id,
                }))
            : []),
        ];
        setStaffOptions(nextStaffOptions);
        if (selectedStaff !== "all" && !nextStaffOptions.some((opt) => opt.value === selectedStaff)) {
          setSelectedStaff("all");
        }
      } catch (error) {
        console.error(error);
        if (cancelled || fetchIdRef.current !== fetchId) return;
        setReviews([]);
        setTotalCount(0);
      } finally {
        if (cancelled || fetchIdRef.current !== fetchId) return;
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [withCommentOnly, selectedOutlet, selectedStaff]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setSettingsError(null);
        const res = await fetch("/api/portal/settings", { cache: "no-store" });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Ошибка ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;
        setSettingsSnapshot(data);
        applyShareSettings(data);
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setSettingsError(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyShareSettings]);

  const handleSaveSettings = React.useCallback(async () => {
    if (!settingsSnapshot) {
      alert("Настройки ещё загружаются, повторите попытку позже");
      return;
    }
    const base = settingsSnapshot;
    const rulesBase = base?.rulesJson && typeof base.rulesJson === "object"
      ? { ...base.rulesJson }
      : Array.isArray(base?.rulesJson)
        ? { rules: base.rulesJson }
        : {};
    const prevShare = rulesBase?.reviewsShare && typeof rulesBase.reviewsShare === "object" ? rulesBase.reviewsShare : {};
    const prevPlatforms = prevShare?.platforms && typeof prevShare.platforms === "object" ? prevShare.platforms : {};
    const thresholdValue = Math.min(5, Math.max(1, parseInt(shareThreshold, 10) || 5));
    rulesBase.reviewsShare = {
      enabled: shareEnabled,
      threshold: thresholdValue,
      platforms: {
        yandex: { ...(prevPlatforms?.yandex ?? {}), enabled: sharePlatforms.yandex },
        twogis: { ...(prevPlatforms?.twogis ?? {}), enabled: sharePlatforms.twogis },
        google: { ...(prevPlatforms?.google ?? {}), enabled: sharePlatforms.google },
      },
    };

    const payload: Record<string, unknown> = {
      earnBps: base.earnBps,
      redeemLimitBps: base.redeemLimitBps,
      qrTtlSec: base.qrTtlSec,
      webhookUrl: base.webhookUrl ?? undefined,
      webhookSecret: base.webhookSecret ?? undefined,
      webhookKeyId: base.webhookKeyId ?? undefined,
      webhookSecretNext: base.webhookSecretNext ?? undefined,
      webhookKeyIdNext: base.webhookKeyIdNext ?? undefined,
      useWebhookNext: base.useWebhookNext ?? undefined,
      redeemCooldownSec: base.redeemCooldownSec ?? undefined,
      earnCooldownSec: base.earnCooldownSec ?? undefined,
      redeemDailyCap: base.redeemDailyCap ?? undefined,
      earnDailyCap: base.earnDailyCap ?? undefined,
      requireJwtForQuote: base.requireJwtForQuote ?? undefined,
      rulesJson: rulesBase,
      requireBridgeSig: base.requireBridgeSig ?? undefined,
      bridgeSecret: base.bridgeSecret ?? undefined,
      bridgeSecretNext: base.bridgeSecretNext ?? undefined,
      requireStaffKey: base.requireStaffKey ?? undefined,
      pointsTtlDays: base.pointsTtlDays ?? undefined,
      earnDelayDays: base.earnDelayDays ?? undefined,
      telegramBotToken: base.telegramBotToken ?? undefined,
      telegramBotUsername: base.telegramBotUsername ?? undefined,
      telegramStartParamRequired: base.telegramStartParamRequired ?? undefined,
      miniappBaseUrl: base.miniappBaseUrl ?? undefined,
      miniappThemePrimary: base.miniappThemePrimary ?? undefined,
      miniappThemeBg: base.miniappThemeBg ?? undefined,
      miniappLogoUrl: base.miniappLogoUrl ?? undefined,
    };

    setSettingsSaving(true);
    try {
      const res = await fetch("/api/portal/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Ошибка ${res.status}`);
      }
      const updated = await res.json();
      setSettingsSnapshot(updated);
      applyShareSettings(updated);
      setSettingsOpen(false);
      alert("Настройки сохранены");
    } catch (error) {
      console.error(error);
      alert(`Не удалось сохранить настройки: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSettingsSaving(false);
    }
  }, [applyShareSettings, settingsSnapshot, shareEnabled, shareThreshold, sharePlatforms]);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Отзывы</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Собирает статистику о качестве обслуживания. Позволяет улучшать сервис и оперативно реагировать на низкие оценки.
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, maxWidth: 520 }}>
            <b>В телеграм приложении:</b> после каждой покупки показывает окно запросом оценки о качестве обслуживания.
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
              Показывать только с комментариями
            </label>
            <select value={selectedOutlet} onChange={(e) => setSelectedOutlet(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
              {outletOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select value={selectedStaff} onChange={(e) => setSelectedStaff(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
              {staffOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Отзывы" subtitle={`${totalCount} записей`} />
        <CardBody>
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
                    <th style={thStyle}>Устройство / сотрудник</th>
                    <th style={thStyle}>Торговая точка</th>
                    <th style={thStyle}>Дата и время визита</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.14)' }}>
                      <td style={tdStyle}>
                        {row.customer.id ? (
                          <a href={`/customers/${row.customer.id}`} style={{ color: '#818cf8', textDecoration: 'none' }}>{row.customer.name}</a>
                        ) : (
                          <span>{row.customer.name}</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <StarRating rating={row.rating} size={18} />
                      </td>
                      <td style={tdStyle}>{row.comment ? row.comment : <span style={{ opacity: 0.6 }}>Без комментария</span>}</td>
                      <td style={tdStyle}>
                        {(() => {
                          const hasDevice = Boolean(row.device && row.device !== '—');
                          const actorLabel = hasDevice ? 'Устройство' : 'Сотрудник';
                          const actorValue = hasDevice ? row.device : row.staff;
                          return (
                            <div style={{ display: 'grid', gap: 2 }}>
                              <span>{actorLabel}: {actorValue || '—'}</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td style={tdStyle}>{row.outlet}</td>
                      <td style={tdStyle}>{new Date(row.createdAt).toLocaleString('ru-RU')}</td>
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

      {settingsOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.74)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 90 }}>
          <div style={{ width: 'min(720px, 96vw)', background: 'rgba(12,16,26,0.96)', borderRadius: 20, border: '1px solid rgba(148,163,184,0.16)', boxShadow: '0 28px 80px rgba(2,6,23,0.5)', display: 'grid', gridTemplateRows: 'auto 1fr auto', maxHeight: '92vh', overflow: 'auto' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(148,163,184,0.18)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Настройки уведомлений</div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Настройте пороги и каналы уведомлений об оценках</div>
              </div>
              <button className="btn btn-ghost" onClick={() => setSettingsOpen(false)}>✕</button>
            </div>

            <div style={{ padding: 24, display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Toggle checked={notifyEnabled} onChange={setNotifyEnabled} label="Уведомлять при оценках" />
                  <select value={notifyThreshold} onChange={(e) => setNotifyThreshold(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
                    {ratingFilters.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <Toggle checked={emailEnabled} onChange={setEmailEnabled} label="Отправлять оценки на электронную почту" />
                {emailEnabled && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <input value={emailTargets} onChange={(e) => setEmailTargets(e.target.value)} placeholder="Введите email адрес(а)" style={{ padding: 10, borderRadius: 10 }} />
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Можно указать несколько почт через запятую</div>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                <Toggle checked={telegramEnabled} onChange={setTelegramEnabled} label="Оповещать об оценках в телеграм" />
                {telegramEnabled && (
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Подключить телеграм аккаунты для уведомлений можно <a href="/settings/telegram" style={{ color: '#818cf8', textDecoration: 'underline' }}>настройках</a>.
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <Toggle checked={shareEnabled} onChange={setShareEnabled} label="Улучшать отзывы о заведении на Яндекс.Картах, 2ГИС, Google" />
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Если клиент поставит хорошую оценку, ему будет предложено перейти в другие сервисы и поделиться там своим отзывом.
                </div>
                {settingsError && (
                  <div style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', padding: '10px 12px', borderRadius: 12, fontSize: 13 }}>
                    Не удалось загрузить актуальные настройки: {settingsError}
                  </div>
                )}
                {shareEnabled && (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <label style={{ fontSize: 13, opacity: 0.8 }}>Оценка при которой предлагать делиться отзывом в других сервисах</label>
                      <select value={shareThreshold} onChange={(e) => setShareThreshold(e.target.value)} style={{ padding: 10, borderRadius: 10 }}>
                        {shareThresholds.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      Сервисы в которых можно будет поделиться отзывом. Для каждой торговой точки необходимо задать ссылку на карточку объекта из сервиса отзывов, это можно сделать в настройке торговой точки в <a href="/outlets" style={{ color: '#818cf8', textDecoration: 'underline' }}>разделе «Торговые точки»</a>.
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <Toggle checked={sharePlatforms.yandex} onChange={(value) => setSharePlatforms((prev) => ({ ...prev, yandex: value }))} label="Яндекс" />
                      <Toggle checked={sharePlatforms.twogis} onChange={(value) => setSharePlatforms((prev) => ({ ...prev, twogis: value }))} label="2ГИС" />
                      <Toggle checked={sharePlatforms.google} onChange={(value) => setSharePlatforms((prev) => ({ ...prev, google: value }))} label="Google" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(148,163,184,0.18)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn" onClick={() => setSettingsOpen(false)} disabled={settingsSaving}>Отмена</button>
              <Button variant="primary" onClick={handleSaveSettings} disabled={settingsSaving}>
                {settingsSaving ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 11,
  opacity: 0.6,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  borderBottom: '1px solid rgba(148,163,184,0.18)',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 12px',
  fontSize: 13,
};
