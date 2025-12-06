"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Skeleton, Chart } from "@loyalty/ui";
import Toggle from "../../../components/Toggle";
import TagSelect from "../../../components/TagSelect";
import { Calendar, Users2, PlusCircle, X, RefreshCw, Bell, Flame } from "lucide-react";

const tabs = [
  { id: "UPCOMING" as const, label: "Предстоящие" },
  { id: "ACTIVE" as const, label: "Активные" },
  { id: "PAST" as const, label: "Прошедшие" },
];

type PromotionStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELED" | "ARCHIVED" | string;

type CampaignReward = {
  awardPoints: boolean;
  points: number;
  pointsExpire: boolean;
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
  status: PromotionStatus;
  startDate: string | null;
  endDate: string | null;
  segmentId: string | null;
  audienceIsAll: boolean;
  segmentName: string;
  totalAudience: number; // всего в аудитории
  usedCount: number; // активировали/получили бонус
  revenueSeries: number[];
  revenueDates?: string[];
  revenueNet: number;
  launched: boolean;
  createdAt: string;
  reward: CampaignReward;
  notifications: CampaignNotification;
};

type AudienceOption = { value: string; label: string; description?: string; size?: number; isAll?: boolean };

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

function normalizeStatus(status: any): PromotionStatus {
  if (!status) return "DRAFT";
  const upper = String(status).toUpperCase();
  switch (upper) {
    case "ACTIVE":
    case "PAUSED":
    case "SCHEDULED":
    case "COMPLETED":
    case "CANCELED":
    case "ARCHIVED":
    case "DRAFT":
      return upper;
    default:
      return upper;
  }
}

function formatRange(from: string | null, to: string | null) {
  if (!from && !to) return "Бессрочно";
  if (from && to) return `${new Date(from).toLocaleDateString("ru-RU")} — ${new Date(to).toLocaleDateString("ru-RU")}`;
  if (from) return `с ${new Date(from).toLocaleDateString("ru-RU")}`;
  if (to) return `до ${new Date(to).toLocaleDateString("ru-RU")}`;
  return "—";
}

function safeNumber(value: any): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatMoney(value: number) {
  return value.toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
}

function computeTab(action: Campaign, now = new Date()): "UPCOMING" | "ACTIVE" | "PAST" {
  const status = normalizeStatus(action.status);
  const start = action.startDate ? new Date(action.startDate) : null;
  const end = action.endDate ? new Date(action.endDate) : null;
  if (status === "COMPLETED" || status === "ARCHIVED" || status === "CANCELED") return "PAST";
  if ((status === "ACTIVE" || status === "PAUSED") && (!end || end >= now)) return "ACTIVE";
  if (status === "SCHEDULED") return "UPCOMING";
  if (start && start > now) return "UPCOMING";
  if (end && end < now) return "PAST";
  return status === "ACTIVE" ? "ACTIVE" : "UPCOMING";
}

type RevenueData = { series: number[]; dates: string[] | null };

function deriveRevenueSeries(metrics: any): RevenueData {
  const charts = metrics && typeof metrics === "object" ? (metrics.charts as Record<string, any>) ?? {} : {};
  const candidates = [
    charts.revenueNet,
    charts.redeemedNet,
    charts.redeemNet,
    charts.revenueRedeemed,
    charts.redeemed,
    charts.daily,
    charts.weekly,
    charts.monthly,
    charts.revenueSeries,
  ].find((value) => Array.isArray(value)) as number[] | undefined;
  const rawSeries = Array.isArray(candidates) ? candidates : [];
  const dates =
    Array.isArray(charts.revenueDates) && charts.revenueDates.length === rawSeries.length
      ? charts.revenueDates
      : null;
  const sanitized = rawSeries
    .map((value) => safeNumber(value))
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (sanitized.length && safeNumber(metrics?.pointsRedeemed) > 0 && safeNumber(metrics?.revenueRedeemed) > 0) {
    const totalRevenue = sanitized.reduce((acc, value) => acc + value, 0);
    const totalPoints = safeNumber(metrics.pointsRedeemed);
    if (totalRevenue > 0) {
      return {
        series: sanitized.map((value) => Math.max(0, value - (totalPoints * (value / totalRevenue)))),
        dates,
      };
    }
  }
  return { series: sanitized, dates };
}

function deriveAudienceSize(segment: any, analytics: any): number {
  const countFromSegment =
    safeNumber(segment?._count?.customers) ||
    safeNumber(segment?.customerCount) ||
    safeNumber(segment?.customersCount) ||
    safeNumber(segment?.metricsSnapshot?.estimatedCustomers);
  if (countFromSegment > 0) return countFromSegment;
  const audienceFromAnalytics =
    safeNumber(analytics?.metrics?.audienceTotal) ||
    safeNumber(analytics?.audienceTotal);
  return audienceFromAnalytics;
}

type RevenuePoint = { date: Date; value: number };
const DAY_MS = 86_400_000;
const WINDOW_DAYS = 7;
const MAX_LOOKBACK_DAYS = 365;

function parseDate(value: string): Date | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function buildRevenuePoints(series: number[], dates?: string[]): RevenuePoint[] {
  const hasDates = Array.isArray(dates) && dates.length === series.length;
  const today = new Date();
  return series
    .map((value, index) => {
      const date = hasDates
        ? parseDate(dates![index]!)
        : new Date(today.getTime() - (series.length - 1 - index) * DAY_MS);
      if (!date) return null;
      return { date, value: Math.max(0, safeNumber(value)) };
    })
    .filter((item): item is RevenuePoint => item !== null && Number.isFinite(item.value) && item.value >= 0);
}

function formatShortDate(value: Date | null) {
  if (!value || Number.isNaN(value.getTime())) return "—";
  return value.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

export default function ActionsEarnPage() {
  const [tab, setTab] = React.useState<typeof tabs[number]["id"]>("ACTIVE");
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState<ActionFormState>(defaultForm);
  const [saving, setSaving] = React.useState(false);
  const [audiences, setAudiences] = React.useState<AudienceOption[]>([]);
  const [audLoading, setAudLoading] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const now = React.useMemo(() => new Date(), []);
  const [chartWindow, setChartWindow] = React.useState<Record<string, number>>({});

  const loadAudiences = React.useCallback(async () => {
    setAudLoading(true);
    try {
      const res = await fetch("/api/portal/audiences?includeSystem=1");
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const base: AudienceOption[] = Array.isArray(json)
        ? json.map((a: any) => ({
            value: a.id,
            label: a.name || "Без названия",
            description: a.description || "",
            size:
              safeNumber(a.customerCount) ||
              safeNumber(a._count?.customers) ||
              safeNumber(a.metricsSnapshot?.estimatedCustomers),
            isAll: a.systemKey === "all-customers" || (a.isSystem && /все\s+клиенты/i.test(a.name || "")),
          }))
        : [];
      const sorted = base.sort((a, b) => (b.isAll ? 1 : 0) - (a.isAll ? 1 : 0));
      setAudiences(sorted);
    } catch {
      setAudiences([]);
    } finally {
      setAudLoading(false);
    }
  }, []);

  const allAudience = React.useMemo(() => audiences.find((a) => a.isAll) ?? null, [audiences]);
  const audienceSizes = React.useMemo(() => {
    const map = new Map<string, number>();
    audiences.forEach((a) => {
      if (typeof a.size === "number") {
        map.set(a.value, a.size);
      }
    });
    return map;
  }, [audiences]);

  const loadCampaigns = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/portal/loyalty/promotions");
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const mapped: Campaign[] = Array.isArray(json)
        ? json.map((item: any) => {
            const status = normalizeStatus(item.status);
            const rewardSource = item.reward ?? item.rewardMetadata ?? {};
            const rewardMeta =
              (rewardSource.metadata && typeof rewardSource.metadata === "object" ? rewardSource.metadata : rewardSource) ??
              {};
            const reward: CampaignReward = {
              awardPoints: (rewardSource.type || "").toString().toUpperCase() === "POINTS",
              points: safeNumber(rewardSource.value ?? item.rewardValue),
              pointsExpire: Boolean(rewardMeta.pointsExpire ?? rewardMeta.pointsExpireAfterEnd),
            };
            const notifications: CampaignNotification = {
              pushOnStart: Boolean(item.metadata?.pushOnStart),
              pushMessage: item.metadata?.pushMessage || "",
              pushReminder: Boolean(item.metadata?.pushReminder),
              pushReminderMessage: item.metadata?.pushReminderMessage || "",
            };
            const metrics = item.analytics?.metrics ?? item.analytics ?? item.metrics ?? {};
            const revenueData = deriveRevenueSeries(metrics);
            const netRevenue = Math.max(
              0,
              safeNumber(metrics.revenueRedeemed ?? metrics.revenueGenerated) -
                safeNumber(metrics.pointsRedeemed ?? metrics.pointsIssued),
            );
            const totalAudience = deriveAudienceSize(item.segment ?? item.audience, item.analytics);
            const usedCount =
              safeNumber(metrics.participantsCount) ||
              safeNumber(item.analytics?.participantsCount) ||
              safeNumber(item.participantsCount);
            const segment =
              (Object.prototype.hasOwnProperty.call(item, "segment") ? item.segment : item.audience) ?? {};
            const targetSegment = Object.prototype.hasOwnProperty.call(item, "targetSegmentId")
              ? item.targetSegmentId
              : segment?.id ?? null;
            const name = segment?.name || item.segmentName || (targetSegment ? "Сегмент" : "Все клиенты");
            const audienceIsAll =
              segment?.systemKey === "all-customers" ||
              segment?.isSystem === true ||
              (!targetSegment && /все\s+клиенты/i.test(name || ""));
            return {
              id: item.id,
              name: item.name || "Без названия",
              description: item.description || "",
              status,
              startDate: item.startDate ?? item.startAt ?? null,
              endDate: item.endDate ?? item.endAt ?? null,
              segmentId: targetSegment || null,
              audienceIsAll,
              segmentName: name,
              totalAudience,
              usedCount,
              revenueSeries: revenueData.series.length ? revenueData.series : netRevenue > 0 ? [netRevenue] : [],
              revenueDates: revenueData.dates ?? undefined,
              revenueNet: netRevenue,
              launched: status === "ACTIVE" || status === "PAUSED" || status === "SCHEDULED",
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
      } catch {
        setError("Ошибка загрузки акций");
      }
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all([loadCampaigns(), loadAudiences()]);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCampaigns, loadAudiences]);

  React.useEffect(() => {
    if (!form.audience && allAudience?.value) {
      setForm((prev) => ({ ...prev, audience: allAudience.value }));
    }
  }, [allAudience?.value, form.audience]);

  const filtered = React.useMemo(
    () => campaigns.filter((item) => computeTab(item, now) === tab),
    [campaigns, tab, now],
  );

  const handleCreate = () => {
    setEditingId(null);
    setForm((prev) => ({
      ...defaultForm,
      audience: allAudience?.value ?? "",
    }));
    setShowCreate(true);
  };

  const handleOpenEdit = (c: Campaign) => {
    const audienceFromCampaign = c.segmentId || (c.audienceIsAll ? allAudience?.value ?? "" : "");
    setEditingId(c.id);
    setForm({
      name: c.name || "",
      description: c.description || "",
      startDate: c.startDate ? c.startDate.slice(0, 10) : "",
      endDate: c.endDate ? c.endDate.slice(0, 10) : "",
      audience: audienceFromCampaign,
      awardPoints: !!c.reward.awardPoints,
      points: String(c.reward.points || 0),
      pointsExpire: !!c.reward.pointsExpire,
      pushOnStart: !!c.notifications.pushOnStart,
      pushMessage: c.notifications.pushMessage || "",
      pushReminder: !!c.notifications.pushReminder,
      pushReminderMessage: c.notifications.pushReminderMessage || "",
      launched: c.status === "ACTIVE" || c.status === "SCHEDULED" || c.status === "PAUSED",
    });
    setShowCreate(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      alert("Укажите название акции");
      return;
    }
    if (form.awardPoints && Number(form.points || 0) <= 0) {
      alert("Укажите количество баллов");
      return;
    }
    if (form.startDate && form.endDate) {
      const startMs = new Date(form.startDate).getTime();
      const endMs = new Date(form.endDate).getTime();
      if (startMs > endMs) {
        alert("Дата начала не может быть позже даты завершения");
        return;
      }
    }
    if (form.pointsExpire && !form.endDate) {
      alert("Укажите дату завершения, чтобы баллы сгорели после окончания акции");
      return;
    }
    const startIso = form.startDate ? new Date(form.startDate).toISOString() : null;
    const endIso = form.endDate ? new Date(form.endDate).toISOString() : null;
    let status: PromotionStatus = form.launched ? "ACTIVE" : "DRAFT";
    if (form.launched && startIso) {
      const start = new Date(startIso);
      if (start.getTime() > Date.now()) status = "SCHEDULED";
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        status,
        startDate: startIso,
        endDate: endIso,
        targetSegmentId: form.audience || allAudience?.value || null,
        type: "BONUS",
        reward: {
          type: "POINTS",
          value: Number(form.points || 0),
          metadata: {
            pointsExpire: form.pointsExpire,
            pointsExpireAfterEnd: form.pointsExpire,
          },
        },
        metadata: {
          pushOnStart: form.pushOnStart,
          pushMessage: form.pushMessage,
          pushReminder: form.pushReminder,
          pushReminderMessage: form.pushReminderMessage,
          reminderOffsetHours: form.pushReminder ? 48 : null,
        },
        rules: {},
      };
      const endpoint = editingId
        ? `/api/portal/loyalty/promotions/${encodeURIComponent(editingId)}`
        : "/api/portal/loyalty/promotions";
      await fetch(endpoint, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await loadCampaigns();
      setShowCreate(false);
    } finally {
      setSaving(false);
    }
  };

  const renderCard = (campaign: Campaign) => {
    const audienceId = campaign.segmentId || (campaign.audienceIsAll ? allAudience?.value ?? "" : "");
    const totalFromSegments = audienceId ? audienceSizes.get(audienceId) ?? null : null;
    const baseTotal = totalFromSegments ?? Math.max(0, Number(campaign.totalAudience || 0));
    const total = baseTotal;
    const used = Math.min(total, Math.max(0, Number(campaign.usedCount || 0)));
    const ignored = Math.max(0, total - used);
    const usedShare = total ? Math.round((used / total) * 100) : 0;
    const ignoredShare = total ? Math.round((ignored / total) * 100) : 0;
    const tabId = computeTab(campaign, now);

    return (
      <div
        key={campaign.id}
        role="button"
        tabIndex={0}
        onClick={() => handleOpenEdit(campaign)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleOpenEdit(campaign);
          }
        }}
        style={{ cursor: "pointer" }}
      >
        <Card style={{ position: "relative", borderRadius: 0, margin: 0 }}>
          <CardBody style={{ padding: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(260px,1.2fr) minmax(320px,1.6fr)",
                gap: 16,
                alignItems: "stretch",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 12,
                  borderRadius: 12,
                  background: "rgba(148,163,184,0.06)",
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>
                    {campaign.name}
                  </div>
                  {campaign.description && (
                    <div style={{ fontSize: 13, lineHeight: 1.35, opacity: 0.9 }}>
                      {campaign.description}
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <Calendar size={16} />
                      <span>{formatRange(campaign.startDate, campaign.endDate)}</span>
                    </div>
                    {campaign.reward.awardPoints && (
                      <div
                        style={{
                          display: "inline-flex",
                          gap: 6,
                          alignItems: "center",
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "rgba(79,70,229,0.12)",
                        }}
                      >
                        <Flame size={14} />
                        <span>{campaign.reward.points} баллов</span>
                        {campaign.reward.pointsExpire && (
                          <span style={{ opacity: 0.7, fontSize: 12 }}>до окончания акции</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Users2 size={16} />
                    <span>
                      Аудитория: <span style={{ fontWeight: 500 }}>{campaign.segmentName || "—"}</span>
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                    gap: 10,
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  <div style={{ display: "grid", gap: 4 }}>
                    <span style={{ opacity: 0.7 }}>Вся аудитория</span>
                    <strong style={{ fontSize: 13 }}>
                      {total ? total.toLocaleString("ru-RU") : "—"}
                    </strong>
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    <span style={{ opacity: 0.7 }}>Воспользовались</span>
                    <strong style={{ fontSize: 13 }}>
                      {used.toLocaleString("ru-RU")} {total ? `(${usedShare}%)` : ""}
                    </strong>
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    <span style={{ opacity: 0.7 }}>Проигнорировали</span>
                    <strong style={{ fontSize: 13 }}>
                      {ignored.toLocaleString("ru-RU")} {total ? `(${ignoredShare}%)` : ""}
                    </strong>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 6,
                    height: 8,
                    borderRadius: 6,
                    background: "rgba(148,163,184,0.25)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${usedShare}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, rgba(99,102,241,0.95), rgba(129,140,248,0.9))",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  padding: "12px 12px 8px",
                  borderRadius: 12,
                  background: "rgba(148,163,184,0.06)",
                }}
              >
                <RevenueChart
                  campaignId={campaign.id}
                  dates={campaign.revenueDates}
                  series={campaign.revenueSeries}
                  chartWindow={chartWindow}
                  setChartWindow={setChartWindow}
                />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Акции</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Создавайте и управляйте кампаниями с повышенным начислением баллов
          </div>
        </div>
        <Button variant="primary" onClick={handleCreate} startIcon={<PlusCircle size={16} />}>
          Создать акцию
        </Button>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            className="btn"
            onClick={() => setTab(t.id)}
            style={{
              minWidth: 140,
              background: tab === t.id ? "var(--brand-primary)" : "rgba(255,255,255,0.05)",
              color: tab === t.id ? "#0f172a" : "#f8fafc",
              fontWeight: tab === t.id ? 600 : 500,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div>}

      <Card>
        <CardHeader title={`${tabs.find((t) => t.id === tab)?.label}`} />
        <CardBody>
          {loading ? (
            <Skeleton height={240} />
          ) : filtered.length ? (
            <div style={{ display: "grid", gap: 0, gridTemplateColumns: "1fr" }}>
              {filtered.map(renderCard)}
            </div>
          ) : (
            <div style={{ padding: 16, opacity: 0.7 }}>Нет акций в этом разделе</div>
          )}
        </CardBody>
      </Card>

      {showCreate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.72)",
            backdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 80,
          }}
        >
          <div
            style={{
              width: "min(900px, 96vw)",
              maxHeight: "92vh",
              overflow: "auto",
              background: "rgba(12,16,26,0.96)",
              borderRadius: 18,
              border: "1px solid rgba(148,163,184,0.14)",
              boxShadow: "0 30px 80px rgba(2,6,23,0.5)",
              display: "grid",
              gridTemplateRows: "auto 1fr auto",
            }}
          >
            <div
              style={{
                padding: "18px 24px",
                borderBottom: "1px solid rgba(148,163,184,0.14)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {editingId ? "Редактировать акцию" : "Создать акцию"}
                </div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Заполните параметры для начисления баллов</div>
              </div>
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 24, display: "grid", gap: 18 }}>
              <div style={{ display: "grid", gap: 12 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>Название акции (видно только вам)</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Например, Лето x2"
                  style={{ padding: 12, borderRadius: 10 }}
                />
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Краткое описание для команды"
                  style={{ padding: 12, borderRadius: 10, minHeight: 80, resize: "vertical" }}
                />
              </div>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
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

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>Аудитория, кому доступна акция</label>
                  <button
                    className="btn btn-ghost"
                    title="Обновить размер аудитории"
                    onClick={async () => {
                      if (!form.audience) return;
                      await fetch(`/api/portal/audiences/${encodeURIComponent(form.audience)}/refresh`, {
                        method: "POST",
                      });
                      await loadAudiences();
                    }}
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
                <TagSelect
                  options={audiences}
                  value={form.audience ? [form.audience] : allAudience?.value ? [allAudience.value] : []}
                  onChange={(values) => {
                    const v = values[0];
                    setForm((prev) => ({ ...prev, audience: v || "" }));
                  }}
                  allowMultiple={false}
                  placeholder={audLoading ? "Загружаем аудитории..." : "Выберите аудиторию"}
                  disabled={audLoading}
                />
                {form.audience && (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Размер аудитории:{" "}
                    {audiences.find((a) => a.value === form.audience)?.size?.toLocaleString("ru-RU") ?? "—"}
                  </div>
                )}
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Если вы не нашли подходящей аудитории,{" "}
                  <a href="/audiences" style={{ color: "#818cf8", textDecoration: "underline" }}>
                    создайте новую
                  </a>
                </div>
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <Toggle
                    checked={form.awardPoints}
                    onChange={(value) => setForm((prev) => ({ ...prev, awardPoints: value }))}
                    label="Начислить баллы"
                  />
                  {form.awardPoints && (
                    <input
                      value={form.points}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          points: e.target.value.replace(/[^0-9]/g, "") || "0",
                        }))
                      }
                      placeholder="Введите количество баллов"
                      style={{ padding: 10, borderRadius: 10, width: 180 }}
                    />
                  )}
                </div>
                {form.awardPoints && (
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <Toggle
                      checked={form.pointsExpire}
                      onChange={(value) => setForm((prev) => ({ ...prev, pointsExpire: value }))}
                      label="Баллы сгорают после окончания акции"
                    />
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
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

              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Toggle
                  checked={form.launched}
                  onChange={(value) => setForm((prev) => ({ ...prev, launched: value }))}
                  label="Запустить акцию"
                />
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  {form.launched ? "Сразу появится в активных акциях" : "Будет сохранена как черновик"}
                </span>
              </div>
            </div>

            <div
              style={{
                padding: "18px 24px",
                borderTop: "1px solid rgba(148,163,184,0.14)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
              }}
            >
              <button className="btn" onClick={() => setShowCreate(false)} disabled={saving}>
                Отмена
              </button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={saving}
                startIcon={<PlusCircle size={16} />}
              >
                {saving ? "Сохраняем…" : editingId ? "Сохранить" : "Создать акцию"}
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
  const display = value ? new Date(value).toLocaleDateString("ru-RU") : defaultLabel;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontSize: 13, opacity: 0.8 }}>{label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          className="btn"
          onClick={() => inputRef.current?.showPicker?.() ?? inputRef.current?.click()}
          style={{ minWidth: 160 }}
        >
          {display}
        </button>
        <button className="btn btn-ghost" onClick={() => onChange("")} title="Сбросить">
          <X size={16} />
        </button>
      </div>
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ display: "none" }}
      />
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

const NotificationEditor: React.FC<NotificationEditorProps> = ({
  title,
  enabled,
  message,
  onToggle,
  onChange,
}) => (
  <div
    style={{
      padding: 16,
      border: "1px solid rgba(148,163,184,0.18)",
      borderRadius: 14,
      background: "rgba(148,163,184,0.08)",
      display: "grid",
      gap: 10,
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>
      <Toggle checked={enabled} onChange={onToggle} label={enabled ? "Вкл" : "Выкл"} />
    </div>
    {enabled && (
      <div style={{ display: "grid", gap: 8 }}>
        <textarea
          value={message}
          onChange={(e) => onChange(e.target.value.slice(0, 300))}
          placeholder="Текст уведомления"
          style={{ padding: 10, borderRadius: 10, minHeight: 90 }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            opacity: 0.7,
          }}
        >
          <span>Используйте переменные: {"{name}"}</span>
          <span>{message.length}/300</span>
        </div>
        <PushPreview title="Пуш-уведомление" message={message} />
      </div>
    )}
  </div>
);

type RevenueChartProps = {
  campaignId: string;
  dates?: string[];
  series: number[];
  chartWindow: Record<string, number>;
  setChartWindow: React.Dispatch<React.SetStateAction<Record<string, number>>>;
};

const REVENUE_LINE_COLOR = "#ffffff";

const RevenueChart: React.FC<RevenueChartProps> = ({
  campaignId,
  dates,
  series,
  chartWindow,
  setChartWindow,
}) => {
  const points = React.useMemo(() => buildRevenuePoints(series, dates), [series, dates]);
  if (!points.length) {
    return <div style={{ fontSize: 12, opacity: 0.6 }}>Нет данных по выручке</div>;
  }

  const lastPoint = points[points.length - 1];
  if (!lastPoint) {
    return <div style={{ fontSize: 12, opacity: 0.6 }}>Нет данных по выручке</div>;
  }
  const lastDate = lastPoint.date;
  const earliestDate = new Date(lastDate.getTime() - MAX_LOOKBACK_DAYS * DAY_MS);
  let earliestIdx = points.findIndex((p) => p.date >= earliestDate);
  if (earliestIdx === -1) earliestIdx = 0;
  const maxStart = Math.max(earliestIdx, points.length - WINDOW_DAYS);
  const storedStart = chartWindow[campaignId];
  const start = Math.min(
    Math.max(earliestIdx, storedStart ?? maxStart),
    Math.max(earliestIdx, points.length - WINDOW_DAYS),
  );
  const windowPoints = points.slice(start, start + WINDOW_DAYS);
  const windowSum = windowPoints.reduce((acc, p) => acc + p.value, 0);
  const totalSum = points.reduce((acc, p) => acc + p.value, 0);

  const canPrev = start > earliestIdx;
  const canNext = start + WINDOW_DAYS < points.length;
  const shiftWindow = (delta: number) => {
    setChartWindow((prev) => {
      const base = prev[campaignId] ?? start;
      const next = Math.min(
        Math.max(earliestIdx, base + delta),
        Math.max(earliestIdx, points.length - WINDOW_DAYS),
      );
      return { ...prev, [campaignId]: next };
    });
  };

  const categories = React.useMemo(
    () => windowPoints.map((p) => formatShortDate(p.date)),
    [windowPoints],
  );
  const option = React.useMemo(
    () => ({
      color: [REVENUE_LINE_COLOR],
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "line" as const },
        valueFormatter: (value: any) => formatMoney(Math.round(Number(value) || 0)),
      },
      grid: { left: 64, right: 16, top: 8, bottom: 4, containLabel: true },
      xAxis: {
        type: "category" as const,
        data: categories,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.6)" } },
        axisLabel: { color: "rgba(226,232,240,0.9)", fontSize: 11, margin: 4 },
      },
      yAxis: {
        type: "value" as const,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.25)" } },
        axisLabel: {
          color: "rgba(226,232,240,0.9)",
          formatter: (v: number) => formatMoney(Math.round(Number(v) || 0)),
        },
      },
      series: [
        {
          name: "Выручка",
          type: "line" as const,
          smooth: true,
          showSymbol: true,
          symbol: "circle",
          symbolSize: 5,
          lineStyle: { width: 2, color: REVENUE_LINE_COLOR },
          itemStyle: { color: REVENUE_LINE_COLOR },
          areaStyle: { opacity: 0.18, color: "rgba(255,255,255,0.18)" },
          data: windowPoints.map((p) => Math.round(p.value)),
        },
      ],
    }),
    [categories, windowPoints],
  );

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          fontSize: 12,
          marginTop: -8,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ opacity: 0.7 }}>За неделю:</span>
            <strong>{formatMoney(Math.round(windowSum))}</strong>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ opacity: 0.7 }}>За все время:</span>
            <strong>{formatMoney(Math.round(totalSum))}</strong>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="btn btn-ghost"
            disabled={!canPrev}
            onClick={() => shiftWindow(-WINDOW_DAYS)}
            style={{ padding: "8px 12px", minWidth: "auto", fontSize: 16, lineHeight: 1 }}
          >
            ←
          </button>
          <button
            className="btn btn-ghost"
            disabled={!canNext}
            onClick={() => shiftWindow(WINDOW_DAYS)}
            style={{ padding: "8px 12px", minWidth: "auto", fontSize: 16, lineHeight: 1 }}
          >
            →
          </button>
        </div>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%" }}
      >
        <Chart height={180} option={option} />
      </div>
    </div>
  );
};
