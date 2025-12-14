"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Card, CardBody, Button, Skeleton, MotionFadeIn } from "@loyalty/ui";
import Toggle from "../../components/Toggle";
import { 
  Settings, 
  Star, 
  User, 
  Store, 
  Smartphone, 
  MessageSquare, 
  TrendingUp, 
  MessageCircle,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown
} from "lucide-react";

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
  customer: { id: string; name: string; initials: string };
  rating: number;
  comment: string | null;
  device: string | null;
  staff: string;
  outlet: string;
  createdAt: string;
};

type DeviceInfo = {
  id: string;
  code: string;
  outletId: string;
  outletName: string;
};

const shareThresholds = [
  { value: "5", label: "⭐⭐⭐⭐⭐ 5 звезд" },
  { value: "4", label: "⭐⭐⭐⭐ 4 звезды и выше" },
  { value: "3", label: "⭐⭐⭐ 3 звезды и выше" },
  { value: "2", label: "⭐⭐ 2 звезды и выше" },
  { value: "1", label: "⭐ 1 звезда и выше" },
];

const PAGE_SIZE = 10;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Custom Select Component
function CustomSelect({ 
  value, 
  onChange, 
  options, 
  icon: Icon,
  placeholder 
}: { 
  value: string; 
  onChange: (val: string) => void; 
  options: SelectOption[];
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  placeholder?: string;
}) {
  return (
    <div style={selectWrapperStyle}>
      {Icon && <Icon size={16} color="var(--fg-muted)" />}
      <select 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        style={selectStyle}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown size={14} color="var(--fg-muted)" style={{ pointerEvents: 'none', flexShrink: 0 }} />
    </div>
  );
}

export default function ReviewsPage() {
  const [loading, setLoading] = React.useState(false);
  const [withCommentOnly, setWithCommentOnly] = React.useState(false);
  const [selectedOutlet, setSelectedOutlet] = React.useState("all");
  const [selectedStaff, setSelectedStaff] = React.useState("all");
  const [selectedDevice, setSelectedDevice] = React.useState("all");
  const [page, setPage] = React.useState(1);
  
  const [reviews, setReviews] = React.useState<ReviewRow[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const [outletOptions, setOutletOptions] = React.useState<SelectOption[]>([
    { value: "all", label: "Все торговые точки" },
  ]);
  const [staffOptions, setStaffOptions] = React.useState<SelectOption[]>([
    { value: "all", label: "Все сотрудники" },
  ]);
  const [deviceOptions, setDeviceOptions] = React.useState<SelectOption[]>([
    { value: "all", label: "Все устройства" },
  ]);

  // Stats for ALL filtered reviews (separate fetch)
  const [statsAvg, setStatsAvg] = React.useState<number>(0);
  const [statsWithComments, setStatsWithComments] = React.useState<number>(0);

  const fetchIdRef = React.useRef(0);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsSnapshot, setSettingsSnapshot] = React.useState<any | null>(null);
  const [settingsError, setSettingsError] = React.useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = React.useState(false);

  // Settings state
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

  // Fetch devices from outlets API on mount
  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/portal/outlets", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const allDevices: DeviceInfo[] = [];
        const outlets: SelectOption[] = [{ value: "all", label: "Все торговые точки" }];
        
        if (Array.isArray(data?.items)) {
          data.items.forEach((outlet: any) => {
            if (outlet?.id) {
              outlets.push({ value: outlet.id, label: outlet.name || "Без названия" });
            }
            if (Array.isArray(outlet?.devices)) {
              outlet.devices.forEach((d: DeviceInfo) => {
                if (d?.id && d?.code) {
                  allDevices.push(d);
                }
              });
            }
          });
        }
        
        setOutletOptions(outlets);
        // Use device code as value since API filters by deviceId which is the code
        setDeviceOptions([
          { value: "all", label: "Все устройства" },
          ...allDevices.map(d => ({ value: d.code, label: `${d.code} (${d.outletName})` }))
        ]);
      } catch (err) {
        console.error("Failed to fetch outlets/devices", err);
      }
    })();
  }, []);

  // Fetch stats for ALL filtered reviews (without pagination)
  React.useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("limit", "10000"); // Large number to get all for stats
    if (withCommentOnly) params.set("withCommentOnly", "1");
    if (selectedOutlet !== "all") params.set("outletId", selectedOutlet);
    if (selectedStaff !== "all") params.set("staffId", selectedStaff);
    if (selectedDevice !== "all") params.set("deviceId", selectedDevice);
    
    (async () => {
      try {
        const res = await fetch(`/api/portal/reviews?${params.toString()}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as ReviewsApiResponse;
        if (cancelled) return;
        
        const items = Array.isArray(data?.items) ? data.items : [];
        if (items.length > 0) {
          const sum = items.reduce((acc, r) => acc + (r.rating || 0), 0);
          setStatsAvg(Number((sum / items.length).toFixed(1)));
          setStatsWithComments(items.filter(r => r.comment && r.comment.trim().length > 0).length);
        } else {
          setStatsAvg(0);
          setStatsWithComments(0);
        }
      } catch {
        if (!cancelled) {
          setStatsAvg(0);
          setStatsWithComments(0);
        }
      }
    })();
    
    return () => { cancelled = true; };
  }, [withCommentOnly, selectedOutlet, selectedStaff, selectedDevice]);

  // Fetch paginated reviews
  React.useEffect(() => {
    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String((page - 1) * PAGE_SIZE));
    if (withCommentOnly) params.set("withCommentOnly", "1");
    if (selectedOutlet !== "all") params.set("outletId", selectedOutlet);
    if (selectedStaff !== "all") params.set("staffId", selectedStaff);
    if (selectedDevice !== "all") params.set("deviceId", selectedDevice);
    
    const search = params.toString();
    (async () => {
      try {
        const res = await fetch(`/api/portal/reviews?${search}`, { cache: "no-store" });
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
                const staffNameRaw = (item.staff?.name || "").trim();
                const staffName = staffNameRaw || "—";
                const outletName = (item.outlet?.name || "").trim() || "—";
                const comment = typeof item.comment === "string" ? item.comment.trim() : "";
                return {
                  id: item.id,
                  rating: item.rating,
                  comment: comment.length > 0 ? comment : null,
                  createdAt: item.createdAt,
                  customer: { id: customerId, name: customerName, initials: getInitials(customerName) },
                  device: rawDeviceId || null,
                  staff: staffName,
                  outlet: outletName,
                };
              })
          : [];

        setReviews(normalizedReviews);
        setTotalCount(typeof data?.total === "number" ? data.total : normalizedReviews.length);

        // Update staff options if returned
        if (Array.isArray(data?.staff)) {
          const nextStaffOptions: SelectOption[] = [
            { value: "all", label: "Все сотрудники" },
            ...data.staff
              .filter((item): item is { id: string; name?: string | null } => !!item && typeof item === "object")
              .map((item) => ({
                value: item.id,
                label: (item.name || "").trim() || item.id,
              })),
          ];
          setStaffOptions(nextStaffOptions);
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

    return () => { cancelled = true; };
  }, [withCommentOnly, selectedOutlet, selectedStaff, selectedDevice, page]);

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [withCommentOnly, selectedOutlet, selectedStaff, selectedDevice]);

  // Fetch settings when modal opens
  React.useEffect(() => {
    if (!settingsOpen) return;
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
    return () => { cancelled = true; };
  }, [settingsOpen, applyShareSettings]);

  // Blur background while modal is open (even if backdrop-filter is unsupported)
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    if (settingsOpen) {
      body.classList.add("modal-blur-active");
    } else {
      body.classList.remove("modal-blur-active");
    }
    return () => {
      body.classList.remove("modal-blur-active");
    };
  }, [settingsOpen]);

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

    const payload: Record<string, unknown> = { ...base, rulesJson: rulesBase };

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
    } catch (error) {
      console.error(error);
      alert(`Не удалось сохранить настройки: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSettingsSaving(false);
    }
  }, [applyShareSettings, settingsSnapshot, shareEnabled, shareThreshold, sharePlatforms]);

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Header Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 640 }}>
            <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 12px', color: 'var(--fg)' }}>
              Отзывы
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--fg-secondary)', margin: 0 }}>
              Сбор статистики качества обслуживания. Клиенту предоставляется возможность оставить оценку визита после совершения покупки. Позволяет улучшать сервис и оперативно реагировать на низкие оценки.
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => setSettingsOpen(true)}
            leftIcon={<Settings size={16} />}
            style={{ flexShrink: 0 }}
          >
            Настройки
          </Button>
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <Card style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(250, 204, 21, 0.1)', color: '#ca8a04', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Star size={24} strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: 'var(--fg)' }}>{statsAvg > 0 ? statsAvg : '—'}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-muted)', marginTop: 4 }}>Средняя оценка</div>
            </div>
          </Card>
          
          <Card style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(99, 102, 241, 0.1)', color: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={24} strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: 'var(--fg)' }}>{totalCount}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-muted)', marginTop: 4 }}>Всего отзывов</div>
            </div>
          </Card>

          <Card style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageCircle size={24} strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: 'var(--fg)' }}>{statsWithComments || '—'}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-muted)', marginTop: 4 }}>С комментариями</div>
            </div>
          </Card>
        </div>
      </div>

      {/* Toolbar */}
      <Card>
        <CardBody style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <CustomSelect
              value={selectedOutlet}
              onChange={setSelectedOutlet}
              options={outletOptions}
              icon={Store}
            />
            <CustomSelect
              value={selectedStaff}
              onChange={setSelectedStaff}
              options={staffOptions}
              icon={User}
            />
            <CustomSelect
              value={selectedDevice}
              onChange={setSelectedDevice}
              options={deviceOptions}
              icon={Smartphone}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
              <Toggle checked={withCommentOnly} onChange={setWithCommentOnly} label="Только с текстом" />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Content Table */}
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                <th style={{ ...thStyle, width: '15%' }}>Клиент</th>
                <th style={{ ...thStyle, width: '8%' }}>Оценка</th>
                <th style={{ ...thStyle, width: '35%' }}>Комментарий</th>
                <th style={{ ...thStyle, width: '14%' }}>Источник</th>
                <th style={{ ...thStyle, width: '14%' }}>Точка</th>
                <th style={{ ...thStyle, width: '14%' }}>Дата</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                 Array.from({ length: 5 }).map((_, i) => (
                   <tr key={i}>
                     <td colSpan={6} style={{ padding: 16 }}>
                       <Skeleton height={40} />
                     </td>
                   </tr>
                 ))
              ) : reviews.length > 0 ? (
                reviews.map((review) => (
                  <tr key={review.id} className="list-row">
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ 
                          width: 32, height: 32, borderRadius: 999, flexShrink: 0,
                          background: 'var(--bg-surface)',
                          color: 'var(--fg-secondary)', fontWeight: 600, fontSize: 12,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: '1px solid var(--border-default)'
                        }}>
                          {review.customer.initials}
                        </div>
                        <div style={{ fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                           {review.customer.id ? (
                              <a href={`/customers/${review.customer.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                {review.customer.name}
                              </a>
                            ) : review.customer.name}
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                         <Star size={16} fill={review.rating >= 4 ? '#22c55e' : review.rating >= 3 ? '#facc15' : '#ef4444'} strokeWidth={0} />
                         <span style={{ fontWeight: 600, color: review.rating >= 4 ? '#15803d' : review.rating >= 3 ? '#a16207' : '#b91c1c' }}>{review.rating}</span>
                       </div>
                    </td>
                    <td style={{ ...tdStyle, ...commentCellStyle }}>
                      {review.comment ? (
                        <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--fg)', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                          {review.comment}
                        </div>
                      ) : (
                        <span style={{ opacity: 0.4, fontSize: 13 }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {review.device ? (
                            <Smartphone size={14} color="var(--fg-muted)" />
                          ) : (
                            <User size={14} color="var(--fg-muted)" />
                          )}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {review.device || review.staff}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                          {review.device ? 'Устройство' : 'Сотрудник'}
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ color: 'var(--fg-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{review.outlet}</span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ color: 'var(--fg)' }}>{new Date(review.createdAt).toLocaleDateString('ru-RU')}</span>
                        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{new Date(review.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--fg-muted)' }}>
                    Отзывов не найдено
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
              Страница {page} из {totalPages}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button 
                variant="secondary" 
                size="sm" 
                disabled={page === 1 || loading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                leftIcon={<ChevronLeft size={16} />}
              >
                Назад
              </Button>
              <Button 
                variant="secondary" 
                size="sm" 
                disabled={page >= totalPages || loading}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                rightIcon={<ChevronRight size={16} />}
              >
                Вперед
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Settings Modal - rendered via Portal to body */}
      {settingsOpen && typeof document !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'grid', gap: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)' }}>Настройки отзывов</div>
              </div>
              <button 
                onClick={() => setSettingsOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-muted)', padding: 4 }}
              >
                <X size={24} />
              </button>
            </div>

            <div className="modal-body" style={{ gap: 32 }}>
              <section>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fg-muted)', marginBottom: 16 }}>
                  Сбор отзывов на картах
                </div>
                <div style={{ display: 'grid', gap: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <div>
                        <div style={{ fontWeight: 500 }}>Предлагать поделиться отзывом</div>
                        <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>На Яндекс, Google или 2ГИС</div>
                      </div>
                      <Toggle checked={shareEnabled} onChange={setShareEnabled} />
                  </div>

                  {shareEnabled && (
                    <div style={{ display: 'grid', gap: 16, padding: 16, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-default)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                         <label style={{ fontSize: 13, fontWeight: 500 }}>Минимальная оценка для предложения</label>
                         <select 
                            value={shareThreshold} 
                            onChange={(e) => setShareThreshold(e.target.value)} 
                            style={{ ...modalSelectStyle }}
                          >
                            {shareThresholds.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                      </div>

                      <div style={{ display: 'grid', gap: 12 }}>
                        <label style={{ fontSize: 13, fontWeight: 500 }}>Платформы</label>
                        <div style={{ display: 'flex', gap: 24 }}>
                          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                            <div style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: sharePlatforms.yandex ? 'var(--brand-primary)' : 'transparent', borderColor: sharePlatforms.yandex ? 'var(--brand-primary)' : 'var(--border-default)' }}>
                              {sharePlatforms.yandex && <Check size={12} color="white" />}
                            </div>
                            <input type="checkbox" checked={sharePlatforms.yandex} onChange={(e) => setSharePlatforms(p => ({...p, yandex: e.target.checked}))} style={{ display: 'none' }} />
                            <span>Яндекс</span>
                          </label>
                          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                            <div style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: sharePlatforms.twogis ? 'var(--brand-primary)' : 'transparent', borderColor: sharePlatforms.twogis ? 'var(--brand-primary)' : 'var(--border-default)' }}>
                              {sharePlatforms.twogis && <Check size={12} color="white" />}
                            </div>
                            <input type="checkbox" checked={sharePlatforms.twogis} onChange={(e) => setSharePlatforms(p => ({...p, twogis: e.target.checked}))} style={{ display: 'none' }} />
                            <span>2ГИС</span>
                          </label>
                          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                            <div style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: sharePlatforms.google ? 'var(--brand-primary)' : 'transparent', borderColor: sharePlatforms.google ? 'var(--brand-primary)' : 'var(--border-default)' }}>
                              {sharePlatforms.google && <Check size={12} color="white" />}
                            </div>
                            <input type="checkbox" checked={sharePlatforms.google} onChange={(e) => setSharePlatforms(p => ({...p, google: e.target.checked}))} style={{ display: 'none' }} />
                            <span>Google</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="modal-footer">
              <Button variant="secondary" onClick={() => setSettingsOpen(false)}>Отмена</Button>
              <Button variant="primary" onClick={handleSaveSettings} disabled={settingsSaving}>
                {settingsSaving ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const selectWrapperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--border-default)',
  background: 'var(--bg-surface)',
  minWidth: 200,
  flex: 1,
  maxWidth: 280,
  cursor: 'pointer',
  transition: 'border-color 0.2s, box-shadow 0.2s',
};

const selectStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: 14,
  color: 'var(--fg)',
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
};

const modalSelectStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--border-default)',
  background: 'var(--bg-body)',
  color: 'var(--fg)',
  fontSize: 14,
  cursor: 'pointer',
  outline: 'none',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--fg-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 13,
  verticalAlign: 'top',
};

const commentCellStyle: React.CSSProperties = {
  maxWidth: 0, // Trick to force text wrapping in fixed-layout table
};
