"use client";
import React from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardBody, Button, Skeleton } from "@loyalty/ui";
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

export default function EditOutletPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const router = useRouter();

  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<TabKey>("BASIC");
  const [toast, setToast] = React.useState("");

  const [works, setWorks] = React.useState(true);
  const [hidden, setHidden] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [manualMarker, setManualMarker] = React.useState(false);
  const [adminEmails, setAdminEmails] = React.useState("");
  const [basicError, setBasicError] = React.useState("");

  const [timezone, setTimezone] = React.useState(TIMEZONES[3]);
  const [showSchedule, setShowSchedule] = React.useState(false);
  const [mode, setMode] = React.useState<"24/7" | "custom">("custom");
  const [schedule, setSchedule] = React.useState<DaySchedule[]>(createDefaultSchedule);
  const [scheduleMessage, setScheduleMessage] = React.useState("");

  const [externalId, setExternalId] = React.useState("");
  const [integrationsMessage, setIntegrationsMessage] = React.useState("");
  const [reviewLinks, setReviewLinks] = React.useState<{ yandex: string; twogis: string; google: string }>({
    yandex: "",
    twogis: "",
    google: "",
  });

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

  const updateReviewLink = React.useCallback((key: 'yandex' | 'twogis' | 'google', value: string) => {
    setReviewLinks((prev) => ({ ...prev, [key]: value }));
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/outlets/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setWorks(Boolean(data?.works ?? (String(data?.status || '').toUpperCase() === 'ACTIVE')));
      setHidden(Boolean(data?.hidden));
      setName(String(data?.name || ''));
      setDescription(String(data?.description || ''));
      setPhone(String(data?.phone || ''));
      setAddress(String(data?.address || ''));
      setAdminEmails(Array.isArray(data?.adminEmails) ? data.adminEmails.join(', ') : '');
      setTimezone(String(data?.timezone || TIMEZONES[3]));
      setManualMarker(Boolean(data?.manualLocation));
      setExternalId(String(data?.externalId || ''));
      const reviewsShareLinks = data?.reviewsShareLinks && typeof data.reviewsShareLinks === 'object'
        ? data.reviewsShareLinks as Record<string, unknown>
        : {};
      setReviewLinks({
        yandex: typeof reviewsShareLinks.yandex === 'string' ? reviewsShareLinks.yandex : '',
        twogis: typeof reviewsShareLinks.twogis === 'string' ? reviewsShareLinks.twogis : '',
        google: typeof reviewsShareLinks.google === 'string' ? reviewsShareLinks.google : '',
      });
      const scheduleEnabled = Boolean(data?.scheduleEnabled);
      setShowSchedule(scheduleEnabled);
      const modeStr = String(data?.scheduleMode || 'CUSTOM');
      setMode(modeStr === '24_7' ? '24/7' : 'custom');
      const days: Array<{ day: number; enabled: boolean; opensAt?: string | null; closesAt?: string | null }> = Array.isArray(data?.schedule) ? data.schedule : [];
      const numToId: Record<number, string> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
      const next = createDefaultSchedule().map((d) => {
        const num = ({ mon:1,tue:2,wed:3,thu:4,fri:5,sat:6,sun:0 } as Record<string, number>)[d.id] ?? 1;
        const src = days.find((x) => Number(x.day) === num);
        return src ? { ...d, enabled: !!src.enabled, from: src.opensAt || d.from, to: src.closesAt || d.to } : d;
      });
      setSchedule(next);
    } catch (e: any) {
      setToast(String(e?.message || e || 'Не удалось загрузить точку'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    if (id) load();
  }, [id, load]);

  const handleSaveBasic = () => {
    if (!name.trim()) {
      setBasicError("Заполните название торговой точки");
      return false;
    }
    if (!address.trim()) {
      setBasicError("Укажите адрес точки");
      return false;
    }
    setBasicError("");
    return true;
  };

  const handleSaveSchedule = () => {
    if (showSchedule && mode === "custom") {
      const hasEnabledDay = schedule.some((day) => day.enabled);
      if (!hasEnabledDay) {
        setScheduleMessage("Включите хотя бы один рабочий день");
        return false;
      }
    }
    setScheduleMessage("");
    return true;
  };

  const handleSaveIntegrations = () => {
    if (!externalId.trim()) {
      setIntegrationsMessage("Укажите внешний идентификатор");
      return false;
    }
    setIntegrationsMessage("");
    return true;
  };

  const submitSave = async () => {
    const okBasic = handleSaveBasic();
    if (!okBasic) return;
    const okSchedule = handleSaveSchedule();
    if (!okSchedule) return;
    const okIntegr = handleSaveIntegrations();
    if (!okIntegr) return;

    const adminList = adminEmails
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const dayIndex: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const payload: any = {
      works,
      hidden,
      name: name.trim(),
      description: description.trim() || null,
      phone: phone.trim() || null,
      address: address.trim(),
      adminEmails: adminList,
      timezone,
      externalId: externalId.trim(),
    };
    if (showSchedule) {
      payload.schedule = {
        mode: mode === '24/7' ? '24_7' : 'CUSTOM',
        days: schedule.map((d) => ({
          day: String(dayIndex[d.id] ?? 0),
          enabled: !!d.enabled,
          opensAt: d.enabled ? d.from : null,
          closesAt: d.enabled ? d.to : null,
        })),
      };
    }

    payload.reviewsShareLinks = {
      yandex: reviewLinks.yandex.trim() || null,
      twogis: reviewLinks.twogis.trim() || null,
      google: reviewLinks.google.trim() || null,
    };

    try {
      const res = await fetch(`/api/portal/outlets/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg: any = text;
        try {
          const json = JSON.parse(text);
          msg = json?.message || json?.error || text;
        } catch {}
        const msgStr = String(msg || 'Не удалось сохранить торговую точку');
        if (msgStr.toLowerCase().includes('externalid')) {
          const friendly = 'Точка с таким внешним ID уже существует. Укажите уникальный внешний ID.';
          setIntegrationsMessage(friendly);
          setTab('INTEGRATIONS');
          setToast(friendly);
          return;
        }
        setToast(msgStr);
        return;
      }
      setToast('Изменения сохранены. Возврат к списку...');
      window.setTimeout(() => router.push('/outlets'), 600);
    } catch (e: any) {
      setToast(String(e?.message || e || 'Ошибка при сохранении'));
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0 }}>Редактировать торговую точку</h1>
          <div style={{ opacity: 0.75, fontSize: 14 }}>Измените информацию по вкладкам и сохраните.</div>
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

      {loading ? (
        <Card>
          <CardBody>
            <Skeleton height={240} />
          </CardBody>
        </Card>
      ) : (
        <>
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
                    placeholder="Название точки"
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

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <Button variant="ghost" onClick={() => router.push("/outlets")}>Отменить</Button>
                  <Button variant="primary" onClick={submitSave}>Сохранить</Button>
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
                  <Button variant="ghost" onClick={() => router.push("/outlets")}>Отменить</Button>
                  <Button variant="primary" onClick={submitSave}>Сохранить</Button>
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

                <div className="glass" style={{ padding: 16, borderRadius: 12, display: "grid", gap: 12 }}>
                  <div style={{ fontWeight: 600 }}>Ссылки на карточки отзывов</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Эти ссылки используются в мини-аппе, чтобы предлагать гостям поделиться отзывом после высокой оценки.
                  </div>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>Яндекс.Карты</span>
                    <input
                      value={reviewLinks.yandex}
                      onChange={(event) => updateReviewLink('yandex', event.target.value)}
                      placeholder="https://yandex.ru/maps/..."
                      style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>2ГИС</span>
                    <input
                      value={reviewLinks.twogis}
                      onChange={(event) => updateReviewLink('twogis', event.target.value)}
                      placeholder="https://2gis.ru/..."
                      style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>Google</span>
                    <input
                      value={reviewLinks.google}
                      onChange={(event) => updateReviewLink('google', event.target.value)}
                      placeholder="https://maps.google.com/..."
                      style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                    />
                  </label>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <Button variant="ghost" onClick={() => router.push("/outlets")}>Отменить</Button>
                  <Button variant="primary" onClick={submitSave}>Сохранить</Button>
                </div>
                {integrationsMessage && <div style={{ color: integrationsMessage.includes("сохранены") ? "#4ade80" : "#f87171" }}>{integrationsMessage}</div>}
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
