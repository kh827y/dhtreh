"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";
import Toggle from "../../../components/Toggle";

type TabKey = "BASIC" | "SCHEDULE" | "INTEGRATIONS";

type DaySchedule = {
  id: string;
  label: string;
  enabled: boolean;
  from: string;
  to: string;
};

const TIMEZONES = [
  "UTC+03:00 Москва",
  "UTC+04:00 Самара",
  "UTC+05:00 Екатеринбург",
  "UTC+07:00 Новосибирск",
];

const createDefaultSchedule = (): DaySchedule[] => [
  { id: "mon", label: "Пн", enabled: true, from: "10:00", to: "22:00" },
  { id: "tue", label: "Вт", enabled: true, from: "10:00", to: "22:00" },
  { id: "wed", label: "Ср", enabled: true, from: "10:00", to: "22:00" },
  { id: "thu", label: "Чт", enabled: true, from: "10:00", to: "22:00" },
  { id: "fri", label: "Пт", enabled: true, from: "10:00", to: "23:00" },
  { id: "sat", label: "Сб", enabled: true, from: "11:00", to: "23:00" },
  { id: "sun", label: "Вс", enabled: false, from: "11:00", to: "21:00" },
];

export default function CreateOutletPage() {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabKey>("BASIC");
  const [toast, setToast] = React.useState("");

  const [works, setWorks] = React.useState(true);
  const [hidden, setHidden] = React.useState(false);
  const [name, setName] = React.useState("Тили-Тесто, Московской 56");
  const [description, setDescription] = React.useState("Вход со стороны двора, рядом парковка");
  const [phone, setPhone] = React.useState("+7 (913) 000-00-00");
  const [address, setAddress] = React.useState("Новосибирск, ул. Московская, 56");
  const [manualMarker, setManualMarker] = React.useState(false);
  const [adminEmails, setAdminEmails] = React.useState("manager@example.com");
  const [basicError, setBasicError] = React.useState("");

  const [timezone, setTimezone] = React.useState(TIMEZONES[3]);
  const [showSchedule, setShowSchedule] = React.useState(true);
  const [mode, setMode] = React.useState<"24/7" | "custom">("custom");
  const [schedule, setSchedule] = React.useState<DaySchedule[]>(createDefaultSchedule);
  const [scheduleMessage, setScheduleMessage] = React.useState("");

  const [externalId, setExternalId] = React.useState("BR-0001");
  const [integrationsMessage, setIntegrationsMessage] = React.useState("");

  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const switchMode = (value: "24/7" | "custom") => {
    setMode(value);
    if (value === "24/7") {
      setSchedule((prev) => prev.map((day) => ({ ...day, enabled: true, from: "00:00", to: "23:59" })));
    } else {
      setSchedule(createDefaultSchedule());
    }
  };

  const updateDay = (id: string, patch: Partial<DaySchedule>) => {
    setSchedule((prev) => prev.map((day) => (day.id === id ? { ...day, ...patch } : day)));
  };

  const toggleDay = (id: string, enabled: boolean) => {
    setSchedule((prev) => prev.map((day) => (day.id === id ? { ...day, enabled } : day)));
  };

  const handleSaveBasic = () => {
    if (!name.trim()) {
      setBasicError("Заполните название торговой точки");
      return;
    }
    if (!address.trim()) {
      setBasicError("Укажите адрес точки");
      return;
    }
    setBasicError("");
    setToast("Основные данные сохранены (демо).");
  };

  const handleSaveSchedule = () => {
    if (mode === "custom") {
      const hasEnabledDay = schedule.some((day) => day.enabled);
      if (!hasEnabledDay) {
        setScheduleMessage("Включите хотя бы один рабочий день");
        return;
      }
    }
    setScheduleMessage("Расписание сохранено (демо).");
    setTimeout(() => setScheduleMessage(""), 3200);
  };

  const handleSaveIntegrations = () => {
    if (!externalId.trim()) {
      setIntegrationsMessage("Укажите внешний идентификатор");
      return;
    }
    setIntegrationsMessage("Интеграции сохранены (демо).");
    setTimeout(() => setIntegrationsMessage(""), 3200);
  };

  const submitCreate = () => {
    handleSaveBasic();
    if (!name.trim() || !address.trim()) return;
    setToast("Точка создана (демо). Возврат к списку...");
    window.setTimeout(() => router.push("/outlets"), 600);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0 }}>Добавить торговую точку</h1>
          <div style={{ opacity: 0.75, fontSize: 14 }}>Заполните информацию по вкладкам, затем создайте точку.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="ghost" onClick={() => router.push("/outlets")}>
            Отменить
          </Button>
          <Button variant="primary" onClick={submitCreate}>
            Создать точку
          </Button>
        </div>
      </div>

      {toast && (
        <div className="glass" style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(37,211,102,0.25)" }}>
          {toast}
        </div>
      )}

      <Card>
        <CardBody>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className={`btn ${tab === "BASIC" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("BASIC")}>
              Основное
            </button>
            <button type="button" className={`btn ${tab === "SCHEDULE" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("SCHEDULE")}>
              Режим работы
            </button>
            <button type="button" className={`btn ${tab === "INTEGRATIONS" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("INTEGRATIONS") }>
              Интеграции
            </button>
          </div>
        </CardBody>
      </Card>

      {tab === "BASIC" && (
        <Card>
          <CardHeader title="Основное" subtitle="Название, контакты и адрес" />
          <CardBody style={{ display: "grid", gap: 16 }}>
            <Toggle checked={works} onChange={setWorks} label="Работает" />
            <Toggle checked={hidden} onChange={setHidden} label="Скрыть торговую точку от клиентов" />

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Название *</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Например, Тили-Тесто, Московской 56"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Описание</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Как добраться, особенности парковки и входа"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit", resize: "vertical" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Контактный телефон</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+7 (999) 000-00-00"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
              />
            </label>

            <div style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Адрес *</span>
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Начните вводить адрес и выберите подсказку"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="secondary" onClick={() => setManualMarker((prev) => !prev)}>
                  {manualMarker ? "Маркер установлен" : "Поставить маркер вручную"}
                </Button>
                {manualMarker && <span style={{ fontSize: 12, opacity: 0.7 }}>Перетащите маркер на карте (демо)</span>}
              </div>
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Почта администратора</span>
              <input
                value={adminEmails}
                onChange={(event) => setAdminEmails(event.target.value)}
                placeholder="email@example.com, second@example.com"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
              />
              <span style={{ fontSize: 12, opacity: 0.6 }}>Можно указать несколько адресов через запятую — уведомления не увидят клиенты.</span>
            </label>

            {basicError && <div style={{ color: "#f87171", fontSize: 13 }}>{basicError}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="primary" onClick={handleSaveBasic}>
                Сохранить
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === "SCHEDULE" && (
        <Card>
          <CardHeader title="Режим работы" subtitle="Часовой пояс и график" />
          <CardBody style={{ display: "grid", gap: 16 }}>
            <label style={{ display: "grid", gap: 6, maxWidth: 320 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Часовой пояс</span>
              <select
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
              >
                {TIMEZONES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <Toggle checked={showSchedule} onChange={setShowSchedule} label="Отображать расписание" />

            {showSchedule && (
              <div className="glass" style={{ padding: 16, borderRadius: 12, display: "grid", gap: 12 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className={`btn ${mode === "24/7" ? "btn-primary" : "btn-ghost"}`} onClick={() => switchMode("24/7")}>
                    Работает круглосуточно
                  </button>
                  <button type="button" className={`btn ${mode === "custom" ? "btn-primary" : "btn-ghost"}`} onClick={() => switchMode("custom")}>
                    Задать расписание по дням
                  </button>
                </div>

                {mode === "custom" && (
                  <div style={{ display: "grid", gap: 10 }}>
                    {schedule.map((day) => (
                      <div key={day.id} className="glass" style={{ padding: 12, borderRadius: 12, display: "grid", gap: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 600 }}>{day.label}</div>
                          <Toggle checked={day.enabled} onChange={(value) => toggleDay(day.id, value)} label={day.enabled ? "Рабочий" : "Выходной"} />
                        </div>
                        {day.enabled && (
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            <label style={{ display: "grid", gap: 4 }}>
                              <span style={{ fontSize: 12, opacity: 0.7 }}>С</span>
                              <input
                                type="time"
                                value={day.from}
                                onChange={(event) => updateDay(day.id, { from: event.target.value })}
                                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                              />
                            </label>
                            <label style={{ display: "grid", gap: 4 }}>
                              <span style={{ fontSize: 12, opacity: 0.7 }}>По</span>
                              <input
                                type="time"
                                value={day.to}
                                onChange={(event) => updateDay(day.id, { to: event.target.value })}
                                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="primary" onClick={handleSaveSchedule}>
                Сохранить
              </Button>
            </div>
            {scheduleMessage && <div style={{ color: scheduleMessage.includes("сохранено") ? "#4ade80" : "#f87171" }}>{scheduleMessage}</div>}
          </CardBody>
        </Card>
      )}

      {tab === "INTEGRATIONS" && (
        <Card>
          <CardHeader title="Интеграции" subtitle="Внешний идентификатор для POS/кассы" />
          <CardBody style={{ display: "grid", gap: 16 }}>
            <label style={{ display: "grid", gap: 6, maxWidth: 320 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Внешний ID / BranchID / IDBranch *</span>
              <input
                value={externalId}
                onChange={(event) => setExternalId(event.target.value)}
                placeholder="Например, BRANCH-001"
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
              />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="primary" onClick={handleSaveIntegrations}>
                Сохранить
              </Button>
            </div>
            {integrationsMessage && <div style={{ color: integrationsMessage.includes("сохранены") ? "#4ade80" : "#f87171" }}>{integrationsMessage}</div>}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
