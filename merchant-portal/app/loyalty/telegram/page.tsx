"use client";

import React from "react";

type TabKey = "ACTIVE" | "ARCHIVED";

type TelegramCampaign = {
  id: string;
  audience: string;
  text: string;
  startAt: string;
  status: string;
  total: number;
  success: number;
  failed: number;
  imagePreview?: string;
  imageName?: string;
};

const audienceOptions = [
  { value: "all", label: "Всем клиентам" },
  { value: "loyal", label: "Лояльные 60+ дней" },
  { value: "new", label: "Новые клиенты 30 дней" },
  { value: "sleep", label: "Заснувшие" },
  { value: "vip", label: "VIP" },
];

const archivedSeed: TelegramCampaign[] = [
  {
    id: "tg-001",
    audience: "all",
    text: "Новая подборка десертов в Telegram-магазине — загляните!",
    startAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 28).toISOString(),
    status: "Отправлена",
    total: 1840,
    success: 1768,
    failed: 72,
  },
  {
    id: "tg-002",
    audience: "loyal",
    text: "Лояльным гостям — бесплатный капучино в эту пятницу",
    startAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    status: "Отправлена",
    total: 940,
    success: 915,
    failed: 25,
  },
  {
    id: "tg-003",
    audience: "sleep",
    text: "Скучаете по аромату свежеобжаренных зёрен? Возвращайтесь за подарком",
    startAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40).toISOString(),
    status: "Завершена",
    total: 420,
    success: 398,
    failed: 22,
  },
];

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getAudienceLabel(value: string) {
  return audienceOptions.find((option) => option.value === value)?.label ?? value;
}

const tabs: { id: TabKey; label: string }[] = [
  { id: "ACTIVE", label: "Активные" },
  { id: "ARCHIVED", label: "Архивные" },
];

const MAX_SYMBOLS = 512;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const timezoneHint = "Москва, GMT+3";

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

export default function TelegramPage() {
  const [tab, setTab] = React.useState<TabKey>("ACTIVE");
  const [activeCampaigns, setActiveCampaigns] = React.useState<TelegramCampaign[]>([]);
  const [archivedCampaigns] = React.useState<TelegramCampaign[]>(archivedSeed);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [imageError, setImageError] = React.useState("");
  const [form, setForm] = React.useState({
    audience: "all",
    text: "",
    startAt: "",
    imagePreview: "",
    imageName: "",
  });

  const remaining = Math.max(0, MAX_SYMBOLS - form.text.length);

  const textError = React.useMemo(() => {
    if (!form.text.trim()) return "Введите текст сообщения";
    if (form.text.length > MAX_SYMBOLS) return "Превышен лимит символов";
    return "";
  }, [form.text]);

  const dateError = React.useMemo(() => {
    if (!form.startAt) return "Укажите дату и время";
    if (new Date(form.startAt).getTime() < Date.now()) return "Дата не может быть в прошлом";
    return "";
  }, [form.startAt]);

  const canSave = !textError && !dateError && !imageError;

  function openModal() {
    setIsModalOpen(true);
    setSubmitAttempted(false);
  }

  function closeModal() {
    setIsModalOpen(false);
    setSubmitAttempted(false);
    setImageError("");
    setForm({ audience: "all", text: "", startAt: "", imagePreview: "", imageName: "" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setImageError("Поддерживаются только JPEG и PNG");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setImageError("Файл больше 5 МБ");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      setForm((prev) => ({ ...prev, imagePreview: value, imageName: file.name }));
      setImageError("");
    };
    reader.readAsDataURL(file);
  }

  function handleSave() {
    setSubmitAttempted(true);
    if (!canSave) return;

    setActiveCampaigns((prev) => [
      ...prev,
      {
        id: `tg-${Date.now()}`,
        audience: form.audience,
        text: form.text.trim(),
        startAt: form.startAt,
        status: "Запланирована",
        total: 0,
        success: 0,
        failed: 0,
        imagePreview: form.imagePreview || undefined,
        imageName: form.imageName || undefined,
      },
    ]);

    closeModal();
  }

  const currentList = tab === "ACTIVE" ? activeCampaigns : archivedCampaigns;
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
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: "1px solid transparent",
                background: tab === item.id ? "#38bdf8" : "rgba(148,163,184,0.1)",
                color: tab === item.id ? "#0f172a" : "#e2e8f0",
                fontWeight: tab === item.id ? 600 : 400,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Всего: {totalRecords} записей</div>
      </div>

      {tab === "ACTIVE" && activeCampaigns.length === 0 ? (
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
                <th style={{ padding: "12px 8px" }}>Всего отправлено</th>
                <th style={{ padding: "12px 8px" }}>Успешно</th>
                <th style={{ padding: "12px 8px" }}>Ошибок</th>
                <th style={{ padding: "12px 8px", width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {currentList.map((campaign) => (
                <tr key={campaign.id} style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
                  <td style={{ padding: "12px 8px", whiteSpace: "nowrap" }}>{formatDateTime(campaign.startAt)}</td>
                  <td style={{ padding: "12px 8px" }}>
                    {campaign.imagePreview ? (
                      <img
                        src={campaign.imagePreview}
                        alt={campaign.imageName || "Превью"}
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
                  <td style={{ padding: "12px 8px" }}>{campaign.text}</td>
                  <td style={{ padding: "12px 8px" }}>{getAudienceLabel(campaign.audience)}</td>
                  <td style={{ padding: "12px 8px" }}>{campaign.status}</td>
                  <td style={{ padding: "12px 8px" }}>{campaign.total.toLocaleString("ru-RU")}</td>
                  <td style={{ padding: "12px 8px", color: "#34d399" }}>{campaign.success.toLocaleString("ru-RU")}</td>
                  <td style={{ padding: "12px 8px", color: "#f87171" }}>{campaign.failed.toLocaleString("ru-RU")}</td>
                  <td style={{ padding: "12px 8px" }}>
                    <ActionMenu
                      actions={
                        tab === "ACTIVE"
                          ? ["Просмотр", "Отменить отправку", "В архив", "Дублировать"]
                          : ["Просмотр", "Дублировать", "Удалить"]
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
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(15,23,42,0.6)",
                    color: "#e2e8f0",
                  }}
                >
                  {audienceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 12, opacity: 0.65 }}>
                  Рассылку получат только те участники аудитории, которые ранее взаимодействовали с Telegram-ботом
                </span>
              </label>

              <div
                style={{
                  padding: "12px",
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.2)",
                  background: "rgba(30,41,59,0.6)",
                  fontSize: 13,
                  color: "#e2e8f0",
                }}
              >
                Общее количество Telegram-пользователей в системе: <strong>2 480</strong>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Дата начала отправки ({timezoneHint})</span>
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
                <span style={{ color: "#f87171", fontSize: 12, visibility: submitAttempted && dateError ? "visible" : "hidden" }}>
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
                    border: `1px solid ${submitAttempted && textError ? "rgba(248,113,113,0.55)" : "rgba(148,163,184,0.35)"}`,
                    background: "rgba(15,23,42,0.6)",
                    color: "#e2e8f0",
                    resize: "vertical",
                  }}
                />
                <span style={{ color: "#f87171", fontSize: 12, visibility: submitAttempted && textError ? "visible" : "hidden" }}>
                  {textError || " "}
                </span>
              </label>

              <div style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Загрузите изображение (необязательно)</span>
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
                      style={{ width: "100%", maxWidth: 360, aspectRatio: "3 / 2", objectFit: "cover", borderRadius: 12 }}
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
                      1200×800
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
                          setForm((prev) => ({ ...prev, imagePreview: "", imageName: "" }));
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
                    accept="image/jpeg,image/png"
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
                onClick={handleSave}
                disabled={!canSave}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  background: canSave ? "#38bdf8" : "rgba(56,189,248,0.3)",
                  border: "none",
                  color: canSave ? "#0f172a" : "rgba(15,23,42,0.6)",
                  fontWeight: 600,
                  cursor: canSave ? "pointer" : "not-allowed",
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
