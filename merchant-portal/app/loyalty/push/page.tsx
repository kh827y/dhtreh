"use client";

import React from "react";

type TabKey = "ACTIVE" | "ARCHIVED";

type PushCampaign = {
  id: string;
  text: string;
  audience: string;
  startAt: string;
  status: string;
};

const audienceOptions = [
  { value: "all", label: "Всем клиентам" },
  { value: "loyal", label: "Лояльные клиенты" },
  { value: "new", label: "Новые клиенты" },
  { value: "sleep", label: "Заснувшие клиенты" },
];

const archivedSeed: PushCampaign[] = [
  {
    id: "p-001",
    text: "Черная пятница: двойные баллы при покупках в приложении",
    audience: "all",
    startAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    status: "Завершена",
  },
  {
    id: "p-002",
    text: "Напоминание: бонусные напитки в утренние часы",
    audience: "loyal",
    startAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    status: "Отправлена",
  },
  {
    id: "p-003",
    text: "Вернитесь за любимым десертом — подарок при следующем визите",
    audience: "sleep",
    startAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    status: "Отменена",
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
            minWidth: 160,
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

export default function PushPage() {
  const [tab, setTab] = React.useState<TabKey>("ACTIVE");
  const [activeCampaigns, setActiveCampaigns] = React.useState<PushCampaign[]>([]);
  const [archivedCampaigns] = React.useState<PushCampaign[]>(archivedSeed);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [form, setForm] = React.useState({
    text: "",
    audience: "all",
    startAt: "",
  });
  const timezoneLabel = React.useMemo(() => {
    const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
    return timeZone?.replace(/_/g, " ") ?? "локальному времени";
  }, []);

  const textError = React.useMemo(() => {
    if (!form.text.trim()) return "Укажите текст уведомления";
    if (form.text.length > 300) return "Текст не должен превышать 300 символов";
    return "";
  }, [form.text]);

  const dateError = React.useMemo(() => {
    if (!form.startAt) return "Укажите дату и время";
    if (new Date(form.startAt).getTime() < Date.now()) return "Дата не может быть в прошлом";
    return "";
  }, [form.startAt]);

  const canCreate = !textError && !dateError;

  function openModal() {
    setIsModalOpen(true);
    setSubmitAttempted(false);
  }

  function closeModal() {
    setIsModalOpen(false);
    setForm({ text: "", audience: "all", startAt: "" });
    setSubmitAttempted(false);
  }

  function handleCreate() {
    setSubmitAttempted(true);
    if (!canCreate) return;

    setActiveCampaigns((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        text: form.text.trim(),
        audience: form.audience,
        startAt: form.startAt,
        status: "Запланирована",
      },
    ]);

    closeModal();
  }

  const currentList = tab === "ACTIVE" ? activeCampaigns : archivedCampaigns;
  const totalRecords = currentList.length;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <nav aria-label="Хлебные крошки" style={{ display: "flex", gap: 6, fontSize: 13, opacity: 0.75 }}>
        <a href="/" style={{ color: "#38bdf8" }}>
          Главная
        </a>
        <span>/</span>
        <span style={{ color: "#e2e8f0" }}>PUSH-рассылки</span>
      </nav>

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, margin: 0 }}>PUSH-рассылки</h1>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={openModal}
          style={{ padding: "10px 18px", borderRadius: 10 }}
        >
          Создать рассылку
        </button>
      </header>

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
          <div style={{ fontSize: 18, fontWeight: 600 }}>Ещё нет активных PUSH-рассылок</div>
          <div style={{ fontSize: 14, opacity: 0.75 }}>Создайте первую, чтобы напомнить клиентам о ваших предложениях.</div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openModal}
            style={{ padding: "10px 18px", borderRadius: 10 }}
          >
            Создать рассылку
          </button>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 13, opacity: 0.7 }}>
                <th style={{ padding: "12px 8px" }}>Дата начала отправки</th>
                <th style={{ padding: "12px 8px" }}>Текст уведомления</th>
                <th style={{ padding: "12px 8px" }}>Аудитория</th>
                <th style={{ padding: "12px 8px" }}>Статус</th>
                <th style={{ padding: "12px 8px", width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {currentList.map((campaign) => (
                <tr key={campaign.id} style={{ borderTop: "1px solid rgba(148,163,184,0.15)" }}>
                  <td style={{ padding: "12px 8px", whiteSpace: "nowrap" }}>{formatDateTime(campaign.startAt)}</td>
                  <td style={{ padding: "12px 8px" }}>{campaign.text}</td>
                  <td style={{ padding: "12px 8px" }}>{getAudienceLabel(campaign.audience)}</td>
                  <td style={{ padding: "12px 8px" }}>{campaign.status}</td>
                  <td style={{ padding: "12px 8px" }}>
                    <ActionMenu actions={tab === "ACTIVE" ? ["Просмотр", "Поставить на паузу", "Перенести в архив"] : ["Просмотр", "Дублировать", "Удалить"]} />
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
            background: "rgba(15,23,42,0.72)",
            zIndex: 80,
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
                background: "rgba(248,113,113,0.12)",
                color: "#f87171",
                fontSize: 18,
              }}
            >
              ×
            </button>
            <h2 style={{ margin: 0, fontSize: 20 }}>Создать PUSH-рассылку</h2>
            <div style={{ display: "grid", gap: 16 }}>
              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Текст</span>
                <textarea
                  value={form.text}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, text: event.target.value.slice(0, 300) }))
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
                  <span style={{ color: "#f87171", visibility: submitAttempted && textError ? "visible" : "hidden" }}>
                    {textError || " "}
                  </span>
                  <span style={{ opacity: 0.7 }}>{form.text.length}/300</span>
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
                  {audienceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, opacity: 0.75 }}>Дата начала отправки</span>
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
                  <span style={{ color: "#f87171", visibility: submitAttempted && dateError ? "visible" : "hidden" }}>
                    {dateError || " "}
                  </span>
                  <span style={{ opacity: 0.7 }}>время по {timezoneLabel}</span>
                </div>
              </label>
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
                onClick={handleCreate}
                disabled={!canCreate}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  background: canCreate ? "#38bdf8" : "rgba(56,189,248,0.3)",
                  border: "none",
                  color: canCreate ? "#0f172a" : "rgba(15,23,42,0.6)",
                  fontWeight: 600,
                  cursor: canCreate ? "pointer" : "not-allowed",
                }}
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
