"use client";

import React from "react";

type TabKey = "ACTIVE" | "ARCHIVED";

type TelegramCampaign = {
  id: string;
  audienceId: string | null;
  audienceName: string | null;
  text: string;
  scheduledAt: string | null;
  status: string;
  totalRecipients: number;
  sent: number;
  failed: number;
  imageAssetId?: string | null;
  imageMeta?: {
    fileName?: string | null;
    mimeType?: string | null;
  } | null;
};

type AudienceOption = {
  id: string;
  label: string;
  isSystem: boolean;
  systemKey?: string | null;
  customerCount?: number;
};

type CampaignScopeState = Record<TabKey, TelegramCampaign[]>;

const MAX_SYMBOLS = 4096;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
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

function ActionMenu({ actions }: { actions: string[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          border: "1px solid rgba(148,163,184,0.35)",
          background: "rgba(15,23,42,0.6)",
          color: "#e2e8f0",
          fontSize: 18,
          lineHeight: 1,
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: 40,
            background: "#0f172a",
            borderRadius: 12,
            padding: 8,
            boxShadow: "0 20px 40px rgba(15,23,42,0.45)",
            minWidth: 180,
            display: "grid",
            gap: 4,
            zIndex: 20,
          }}
        >
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => setOpen(false)}
              style={{
                textAlign: "left",
                padding: "8px 12px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                color: "#e2e8f0",
                cursor: "pointer",
              }}
            >
              {action}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || res.statusText);
  }
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

export default function TelegramPage() {
  const [tab, setTab] = React.useState<TabKey>("ACTIVE");
  const [campaigns, setCampaigns] = React.useState<CampaignScopeState>(DEFAULT_SCOPE_STATE);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [audiences, setAudiences] = React.useState<AudienceOption[]>([]);
  const [audiencesLoaded, setAudiencesLoaded] = React.useState(false);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [showTextErrors, setShowTextErrors] = React.useState(false);
  const [showDateError, setShowDateError] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [imageError, setImageError] = React.useState("");
  const [form, setForm] = React.useState({
    audience: "",
    text: "",
    startAt: "",
    imagePreview: "",
    imageName: "",
    imageMimeType: "",
  });

  const loadCampaigns = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [active, archived] = await Promise.all<[
        TelegramCampaign[],
        TelegramCampaign[]
      ]>([
        fetchJson<TelegramCampaign[]>("/api/portal/communications/telegram?scope=ACTIVE"),
        fetchJson<TelegramCampaign[]>("/api/portal/communications/telegram?scope=ARCHIVED"),
      ]);
      setCampaigns({ ACTIVE: active, ARCHIVED: archived });
    } catch (err: any) {
      setError(err?.message || "Не удалось загрузить рассылки");
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
          id: item.id,
          label: item.name as string,
          isSystem: Boolean(item.isSystem),
          systemKey: item.systemKey ?? null,
          customerCount: item.customerCount ?? null,
        }));
      setAudiences(mapped);
      setAudiencesLoaded(true);
      if (!form.audience) {
        const allOption = mapped.find((a) => a.systemKey === "all-customers" || a.isSystem);
        if (allOption) {
          setForm((prev) => ({ ...prev, audience: allOption.id }));
        } else if (mapped.length) {
          setForm((prev) => ({ ...prev, audience: mapped[0].id }));
        }
      }
    } catch (err) {
      setAudiencesLoaded(true);
    }
  }, [audiencesLoaded, form.audience]);

  React.useEffect(() => {
    loadCampaigns().catch(() => {});
  }, [loadCampaigns]);

  const remaining = Math.max(0, MAX_SYMBOLS - form.text.length);

  const textError = React.useMemo(() => {
    if (!form.text.trim()) return "Введите текст сообщения";
    if (form.text.length > MAX_SYMBOLS)
      return `Превышен лимит в ${MAX_SYMBOLS} символов`;
    return "";
  }, [form.text]);

  const dateError = React.useMemo(() => {
    if (!form.startAt) return "Укажите дату и время";
    const date = new Date(form.startAt);
    if (Number.isNaN(date.getTime())) return "Некорректная дата";
    if (date.getTime() < Date.now()) return "Дата не может быть в прошлом";
    return "";
  }, [form.startAt]);

  const canSchedule = !textError && !dateError && !imageError && !saving;
  const canSendNow = !textError && !imageError && !saving;

  function openModal() {
    setIsModalOpen(true);
    setShowTextErrors(false);
    setShowDateError(false);
    setImageError("");
    loadAudiences().catch(() => {});
  }

  function closeModal() {
    setIsModalOpen(false);
    setShowTextErrors(false);
    setShowDateError(false);
    setImageError("");
    setSaving(false);
    setForm((prev) => ({
      ...prev,
      text: "",
      startAt: "",
      imagePreview: "",
      imageName: "",
      imageMimeType: "",
    }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageError("Поддерживаются только изображения");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setImageError("Файл больше 10 МБ");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      setForm((prev) => ({
        ...prev,
        imagePreview: value,
        imageName: file.name,
        imageMimeType: file.type,
      }));
      setImageError("");
    };
    reader.onerror = () => {
      setImageError("Не удалось прочитать файл");
    };
    reader.readAsDataURL(file);
  }

  async function submitCampaign(immediate: boolean) {
    if (immediate) {
      setShowTextErrors(true);
      setShowDateError(false);
      if (textError || imageError) return;
    } else {
      setShowTextErrors(true);
      setShowDateError(true);
      if (!canSchedule) return;
    }

    setSaving(true);
    try {
      const selectedAudience = audiences.find((a) => a.id === form.audience);
      const scheduledAtIso = form.startAt ? new Date(form.startAt).toISOString() : null;
      await fetchJson("/api/portal/communications/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audienceId: form.audience || null,
          audienceName: selectedAudience?.label ?? null,
          text: form.text.trim(),
          scheduledAt: immediate ? null : scheduledAtIso,
          media: form.imagePreview
            ? {
                imageBase64: form.imagePreview,
                fileName: form.imageName || undefined,
                mimeType: form.imageMimeType || undefined,
              }
            : null,
        }),
      });
      closeModal();
      await loadCampaigns();
    } catch (err: any) {
      setSaving(false);
      setImageError(err?.message || "Не удалось сохранить рассылку");
    }
  }

  const currentList = campaigns[tab];
  const totalRecords = currentList.length;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Telegram-рассылки</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={openModal}
          style={{ padding: "10px 18px", borderRadius: 10 }}
        >
          Создать Telegram-рассылку
        </button>
      </div>

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
          <div style={{ fontSize: 18, fontWeight: 600 }}>Нет активных Telegram-рассылок</div>
          <div style={{ fontSize: 14, opacity: 0.75 }}>Создайте первую кампанию, чтобы рассказать о новостях подписчикам.</div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openModal}
            style={{ padding: "10px 18px", borderRadius: 10 }}
          >
            Создать Telegram-рассылку
          </button>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 840 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 13, opacity: 0.7 }}>
                <th style={{ padding: "12px 8px" }}>Дата начала отправки</th>
                <th style={{ padding: "12px 8px" }}>Изображение</th>
                <th style={{ padding: "12px 8px" }}>Текст</th>
                <th style={{ padding: "12px 8px" }}>Аудитория</th>
                <th style={{ padding: "12px 8px" }}>Статус</th>
                <th style={{ padding: "12px 8px" }}>Всего</th>
                <th style={{ padding: "12px 8px" }}>Успешно</th>
                <th style={{ padding: "12px 8px" }}>Ошибок</th>
                <th style={{ padding: "12px 8px", width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {currentList.map((campaign) => (
                <tr key={campaign.id} style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
                  <td style={{ padding: "12px 8px", whiteSpace: "nowrap" }}>{formatDateTime(campaign.scheduledAt)}</td>
                  <td style={{ padding: "12px 8px" }}>
                    {campaign.imageAssetId ? (
                      <img
                        src={`/api/portal/communications/assets/${campaign.imageAssetId}`}
                        alt={campaign.imageMeta?.fileName || "Превью"}
                        style={{ width: 80, height: 54, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(148,163,184,0.3)" }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 80,
                          height: 54,
                          borderRadius: 8,
                          border: "1px dashed rgba(148,163,184,0.35)",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 12,
                          opacity: 0.6,
                        }}
                      >
                        —
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "12px 8px", maxWidth: 320 }}>{campaign.text}</td>
                  <td style={{ padding: "12px 8px" }}>{campaign.audienceName || "Все клиенты"}</td>
                  <td style={{ padding: "12px 8px" }}>{campaign.status}</td>
                  <td style={{ padding: "12px 8px" }}>{campaign.totalRecipients?.toLocaleString("ru-RU") ?? "—"}</td>
                  <td style={{ padding: "12px 8px", color: "#34d399" }}>{campaign.sent?.toLocaleString("ru-RU") ?? "—"}</td>
                  <td style={{ padding: "12px 8px", color: "#f87171" }}>{campaign.failed?.toLocaleString("ru-RU") ?? "—"}</td>
                  <td style={{ padding: "12px 8px" }}>
                    <ActionMenu
                      actions={
                        tab === "ACTIVE"
                          ? ["Просмотр", "Отменить отправку", "В архив", "Дублировать"]
                          : ["Просмотр", "Дублировать"]
                      }
                    />
                  </td>
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
            padding: 16,
            background: "rgba(15,23,42,0.72)",
            zIndex: 90,
          }}
        >
          <div
            style={{
              width: "min(640px, 100%)",
              background: "#0f172a",
              borderRadius: 20,
              padding: 28,
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
                top: 18,
                right: 18,
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "none",
                background: "rgba(248,113,113,0.12)",
                color: "#f87171",
                fontSize: 18,
              }}
            >
              ×
            </button>
            <h2 style={{ margin: 0, fontSize: 20 }}>Создать Telegram-рассылку</h2>
            <div style={{ display: "grid", gap: 16 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Аудитория</span>
                <select
                  value={form.audience}
                  onChange={(event) => setForm((prev) => ({ ...prev, audience: event.target.value }))}
                  onFocus={() => loadAudiences().catch(() => {})}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(15,23,42,0.6)",
                    color: "#e2e8f0",
                  }}
                >
                  {audiences.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 12, opacity: 0.65 }}>
                  Рассылку получат клиенты выбранной аудитории, у которых есть связь с Telegram-ботом.
                </span>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Дата начала отправки (локальное время)</span>
                <input
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(event) => setForm((prev) => ({ ...prev, startAt: event.target.value }))}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: showDateError && dateError
                      ? "1px solid rgba(248,113,113,0.55)"
                      : "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(15,23,42,0.6)",
                    color: "#e2e8f0",
                  }}
                />
                <span style={{ color: "#f87171", fontSize: 12, visibility: showDateError && dateError ? "visible" : "hidden" }}>
                  {dateError || " "}
                </span>
              </label>

              <label style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, opacity: 0.75 }}>Текст</span>
                  <span style={{ fontSize: 12, opacity: 0.65 }}>Осталось символов: {remaining}</span>
                </div>
                <textarea
                  value={form.text}
                  onChange={(event) => setForm((prev) => ({ ...prev, text: event.target.value }))}
                  rows={5}
                  style={{
                    padding: "12px",
                    borderRadius: 12,
                    border: showTextErrors && textError
                      ? "1px solid rgba(248,113,113,0.55)"
                      : "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(15,23,42,0.6)",
                    color: "#e2e8f0",
                    resize: "vertical",
                  }}
                />
                <span style={{ color: "#f87171", fontSize: 12, visibility: showTextErrors && textError ? "visible" : "hidden" }}>
                  {textError || " "}
                </span>
              </label>

              <div style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Добавьте изображение (необязательно)</span>
                <div
                  style={{
                    border: form.imagePreview
                      ? "1px solid rgba(148,163,184,0.35)"
                      : "1px dashed rgba(148,163,184,0.35)",
                    borderRadius: 16,
                    padding: 16,
                    display: "grid",
                    justifyItems: "center",
                    gap: 12,
                    background: "rgba(15,23,42,0.5)",
                  }}
                >
                  {form.imagePreview ? (
                    <img
                      src={form.imagePreview}
                      alt={form.imageName || "Выбранное изображение"}
                      style={{ width: "100%", maxWidth: 360, objectFit: "contain", borderRadius: 12 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 240,
                        height: 160,
                        borderRadius: 12,
                        border: "1px dashed rgba(148,163,184,0.35)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 13,
                        opacity: 0.6,
                      }}
                    >
                      Изображение не выбрано
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        padding: "10px 18px",
                        borderRadius: 10,
                        background: "#38bdf8",
                        border: "none",
                        color: "#0f172a",
                        fontWeight: 600,
                      }}
                    >
                      Выбрать
                    </button>
                    {form.imagePreview && (
                      <button
                        type="button"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            imagePreview: "",
                            imageName: "",
                            imageMimeType: "",
                          }));
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        style={{
                          padding: "10px 18px",
                          borderRadius: 10,
                          background: "rgba(148,163,184,0.15)",
                          border: "1px solid rgba(148,163,184,0.35)",
                          color: "#e2e8f0",
                        }}
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleImageChange}
                  />
                  <span style={{ color: "#f87171", fontSize: 12, visibility: imageError ? "visible" : "hidden" }}>
                    {imageError || " "}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
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
                  background: canSendNow ? "#22c55e" : "rgba(34,197,94,0.25)",
                  border: "none",
                  color: canSendNow ? "#052e16" : "rgba(15,23,42,0.6)",
                  fontWeight: 600,
                  cursor: canSendNow ? "pointer" : "not-allowed",
                }}
              >
                {saving ? "Отправка…" : "Запустить сейчас"}
              </button>
              <button
                type="button"
                onClick={() => submitCampaign(false)}
                disabled={!canSchedule}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  background: canSchedule ? "#38bdf8" : "rgba(56,189,248,0.3)",
                  border: "none",
                  color: canSchedule ? "#0f172a" : "rgba(15,23,42,0.6)",
                  fontWeight: 600,
                  cursor: canSchedule ? "pointer" : "not-allowed",
                }}
              >
                {saving ? "Сохранение…" : "Запланировать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
