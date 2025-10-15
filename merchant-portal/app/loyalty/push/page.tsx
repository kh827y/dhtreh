"use client";

import React from "react";

type TabKey = "ACTIVE" | "ARCHIVED";

type PushCampaign = {
  id: string;
  text: string;
  audience: string;
  scheduledAt: string | null;
  status: string;
  totalRecipients: number;
  sent: number;
  failed: number;
  updatedAt: string;
};

type CampaignScopeState = Record<TabKey, PushCampaign[]>;

type AudienceOption = {
  id: string;
  label: string;
  isSystem: boolean;
  systemKey?: string | null;
  customerCount?: number | null;
};

const MAX_SYMBOLS = 300;
const DEFAULT_SCOPE_STATE: CampaignScopeState = {
  ACTIVE: [],
  ARCHIVED: [],
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const text = await res.text();
  if (!res.ok) {
    const message = text || res.statusText;
    throw new Error(message);
  }
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

export default function PushPage() {
  const [tab, setTab] = React.useState<TabKey>("ACTIVE");
  const [campaigns, setCampaigns] = React.useState<CampaignScopeState>(DEFAULT_SCOPE_STATE);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [audiences, setAudiences] = React.useState<AudienceOption[]>([]);
  const [audiencesLoaded, setAudiencesLoaded] = React.useState(false);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [showTextError, setShowTextError] = React.useState(false);
  const [showDateError, setShowDateError] = React.useState(false);
  const [form, setForm] = React.useState({
    text: "",
    audience: "",
    startAt: "",
  });
  const timezoneLabel = React.useMemo(() => {
    const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
    return timeZone?.replace(/_/g, " ") ?? "локальному времени";
  }, []);

  const loadCampaigns = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [active, archived] = await Promise.all<[
        PushCampaign[],
        PushCampaign[]
      ]>([
        fetchJson<PushCampaign[]>("/api/portal/communications/push?scope=ACTIVE"),
        fetchJson<PushCampaign[]>("/api/portal/communications/push?scope=ARCHIVED"),
      ]);
      setCampaigns({ ACTIVE: active, ARCHIVED: archived });
    } catch (err: any) {
      setError(err?.message || "Не удалось загрузить push-рассылки");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudiences = React.useCallback(async () => {
    if (audiencesLoaded) return;
    try {
      const list = await fetchJson<any[]>("/api/portal/audiences?includeSystem=1");
      const mapped: AudienceOption[] = list
        .filter((item) => !item.archivedAt)
        .map((item) => ({
          id: String(item.id),
          label: item.name as string,
          isSystem: Boolean(item.isSystem),
          systemKey: item.systemKey ?? null,
          customerCount: item.customerCount ?? null,
        }));
      setAudiences(mapped);
      setAudiencesLoaded(true);
      if (!form.audience) {
        const allOption =
          mapped.find((a) => a.systemKey === "all-customers" || a.isSystem) ??
          mapped[0];
        if (allOption) {
          setForm((prev) => ({ ...prev, audience: allOption.id }));
        }
      }
    } catch {
      setAudiencesLoaded(true);
    }
  }, [audiencesLoaded, form.audience]);

  React.useEffect(() => {
    loadCampaigns().catch(() => {});
  }, [loadCampaigns]);

  const remaining = Math.max(0, MAX_SYMBOLS - form.text.length);

  const textError = React.useMemo(() => {
    if (!form.text.trim()) return "Введите текст уведомления";
    if (form.text.length > MAX_SYMBOLS) return `Превышен лимит в ${MAX_SYMBOLS} символов`;
    return "";
  }, [form.text]);

  const dateError = React.useMemo(() => {
    if (!form.startAt) return "Укажите дату и время";
    const date = new Date(form.startAt);
    if (Number.isNaN(date.getTime())) return "Некорректная дата";
    if (date.getTime() < Date.now()) return "Дата не может быть в прошлом";
    return "";
  }, [form.startAt]);

  const canSchedule = !textError && !dateError && !saving;
  const canSendNow = !textError && !saving;

  function openModal() {
    setIsModalOpen(true);
    setShowTextError(false);
    setShowDateError(false);
    setSaving(false);
    loadAudiences().catch(() => {});
  }

  function closeModal() {
    setIsModalOpen(false);
    setShowTextError(false);
    setShowDateError(false);
    setSaving(false);
    setForm((prev) => ({
      ...prev,
      text: "",
      startAt: "",
    }));
  }

  const currentList = campaigns[tab];
  const totalRecords = currentList.length;
  const selectedAudience = audiences.find((a) => a.id === form.audience) || null;

  async function submitCampaign(immediate: boolean) {
    if (immediate) {
      setShowTextError(true);
      if (textError || saving) return;
    } else {
      setShowTextError(true);
      setShowDateError(true);
      if (!canSchedule) return;
    }
    if (!form.audience) {
      setShowTextError(true);
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, any> = {
        text: form.text.trim(),
        audienceId: form.audience || null,
        audienceName: selectedAudience?.label ?? null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      if (!immediate && form.startAt) {
        body.scheduledAt = new Date(form.startAt).toISOString();
      } else {
        body.scheduledAt = null;
      }

      await fetchJson("/api/portal/communications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      closeModal();
      await loadCampaigns();
    } catch (err: any) {
      setSaving(false);
      setShowTextError(true);
      setShowDateError(!immediate);
      setError(err?.message || "Не удалось сохранить push-рассылку");
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>PUSH-рассылки</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={openModal}
          style={{ padding: "10px 18px", borderRadius: 10 }}
        >
          Создать push-рассылку
        </button>
      </header>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 12 }}>
          {(["ACTIVE", "ARCHIVED"] as TabKey[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: "1px solid transparent",
                background: tab === item ? "#38bdf8" : "rgba(148,163,184,0.1)",
                color: tab === item ? "#0f172a" : "#e2e8f0",
                fontWeight: tab === item ? 600 : 400,
              }}
            >
              {item === "ACTIVE" ? "Активные" : "Архивные"}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Всего: {loading ? "…" : totalRecords} записей</div>
      </div>

      {error ? (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: "rgba(248,113,113,0.12)",
            border: "1px solid rgba(248,113,113,0.35)",
            color: "#fecaca",
          }}
        >
          {error}
        </div>
      ) : loading ? (
        <div style={{ padding: 40, textAlign: "center", opacity: 0.7 }}>Загрузка...</div>
      ) : tab === "ACTIVE" && currentList.length === 0 ? (
        <div
          style={{
            padding: "48px 24px",
            borderRadius: 16,
            background: "rgba(15,23,42,0.65)",
            border: "1px dashed rgba(148,163,184,0.35)",
            textAlign: "center",
            display: "grid",
            gap: 12,
            placeItems: "center",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600 }}>Ещё нет активных push-рассылок</div>
          <div style={{ fontSize: 14, opacity: 0.75 }}>
            Создайте первую кампанию, чтобы напомнить клиентам о ваших предложениях.
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openModal}
            style={{ padding: "10px 18px", borderRadius: 10 }}
          >
            Создать push-рассылку
          </button>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 13, opacity: 0.7 }}>
                <th style={{ padding: "12px 8px" }}>Дата запуска</th>
                <th style={{ padding: "12px 8px" }}>Текст</th>
                <th style={{ padding: "12px 8px" }}>Аудитория</th>
                <th style={{ padding: "12px 8px" }}>Статус</th>
                <th style={{ padding: "12px 8px" }}>Всего</th>
                <th style={{ padding: "12px 8px" }}>Отправлено</th>
                <th style={{ padding: "12px 8px" }}>Ошибок</th>
              </tr>
            </thead>
            <tbody>
              {currentList.map((campaign) => (
                <tr key={campaign.id} style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
                  <td style={{ padding: "12px 8px", whiteSpace: "nowrap" }}>
                    {formatDateTime(campaign.scheduledAt)}
                  </td>
                  <td style={{ padding: "12px 8px" }}>{campaign.text}</td>
                  <td style={{ padding: "12px 8px" }}>{campaign.audience || "—"}</td>
                  <td style={{ padding: "12px 8px" }}>{campaign.status}</td>
                  <td style={{ padding: "12px 8px" }}>{campaign.totalRecipients}</td>
                  <td style={{ padding: "12px 8px" }}>{campaign.sent}</td>
                  <td style={{ padding: "12px 8px" }}>{campaign.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(15,23,42,0.72)",
            zIndex: 90,
            padding: 16,
          }}
        >
          <div
            style={{
              width: "min(520px, 100%)",
              background: "#0f172a",
              borderRadius: 20,
              padding: 24,
              boxShadow: "0 32px 80px rgba(15,23,42,0.55)",
              position: "relative",
              display: "grid",
              gap: 20,
            }}
          >
            <button
              type="button"
              onClick={closeModal}
              aria-label="Отмена"
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "none",
                background: "rgba(148,163,184,0.12)",
                color: "#e2e8f0",
                fontSize: 18,
              }}
            >
              ×
            </button>
            <h2 style={{ margin: 0, fontSize: 20 }}>Создать push-рассылку</h2>
            <div style={{ display: "grid", gap: 16 }}>
              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Текст уведомления</span>
                <textarea
                  value={form.text}
                  maxLength={MAX_SYMBOLS}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, text: event.target.value.slice(0, MAX_SYMBOLS) }))
                  }
                  rows={4}
                  style={{
                    padding: "12px",
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(15,23,42,0.6)",
                    color: "#e2e8f0",
                    resize: "vertical",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span
                    style={{
                      color: "#f87171",
                      visibility: showTextError && textError ? "visible" : "hidden",
                    }}
                  >
                    {textError || " "}
                  </span>
                  <span style={{ opacity: 0.7 }}>{remaining}/{MAX_SYMBOLS}</span>
                </div>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Аудитория</span>
                <select
                  value={form.audience}
                  onChange={(event) => setForm((prev) => ({ ...prev, audience: event.target.value }))}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(15,23,42,0.6)",
                    color: "#e2e8f0",
                  }}
                >
                  <option value="" disabled>
                    Выберите аудиторию
                  </option>
                  {audiences.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                      {typeof option.customerCount === "number" ? ` (${option.customerCount})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Запланировать на</span>
                <input
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(event) => setForm((prev) => ({ ...prev, startAt: event.target.value }))}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(15,23,42,0.6)",
                    color: "#e2e8f0",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span
                    style={{
                      color: "#f87171",
                      visibility: showDateError && dateError ? "visible" : "hidden",
                    }}
                  >
                    {dateError || " "}
                  </span>
                  <span style={{ opacity: 0.7 }}>время по {timezoneLabel}</span>
                </div>
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={closeModal}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  background: "rgba(148,163,184,0.12)",
                  border: "1px solid rgba(148,163,184,0.35)",
                  color: "#e2e8f0",
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => submitCampaign(true)}
                disabled={!canSendNow}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  background: canSendNow ? "#38bdf8" : "rgba(56,189,248,0.3)",
                  border: "none",
                  color: canSendNow ? "#0f172a" : "rgba(15,23,42,0.6)",
                  fontWeight: 600,
                  cursor: canSendNow ? "pointer" : "not-allowed",
                }}
              >
                Запустить сейчас
              </button>
              <button
                type="button"
                onClick={() => submitCampaign(false)}
                disabled={!canSchedule}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  background: canSchedule ? "#22d3ee" : "rgba(34,211,238,0.2)",
                  border: "none",
                  color: canSchedule ? "#0f172a" : "rgba(15,23,42,0.6)",
                  fontWeight: 600,
                  cursor: canSchedule ? "pointer" : "not-allowed",
                }}
              >
                Запланировать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
