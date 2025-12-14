"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";
import Toggle from "../../../components/Toggle";

type TabKey = "BASIC" | "INTEGRATIONS";

const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,63}$/;

export default function CreateOutletPage() {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabKey>("BASIC");
  const [toast, setToast] = React.useState("");

  const [works, setWorks] = React.useState(true);
  const [name, setName] = React.useState("Тили-Тесто, Московской 56");
  const [reviewLinks, setReviewLinks] = React.useState<{ yandex: string; twogis: string; google: string }>({
    yandex: "",
    twogis: "",
    google: "",
  });
  const [basicError, setBasicError] = React.useState("");

  const [devices, setDevices] = React.useState<Array<{ code: string }>>([]);
  const [deviceErrors, setDeviceErrors] = React.useState<Record<string, string>>({});
  const [integrationsMessage, setIntegrationsMessage] = React.useState("");

  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const addDeviceRow = () => {
    if (devices.length >= 50) {
      setIntegrationsMessage("Можно добавить не более 50 устройств");
      return;
    }
    setDevices((prev) => [...prev, { code: "" }]);
  };

  const updateDeviceCode = (index: number, code: string) => {
    setDevices((prev) => prev.map((item, idx) => (idx === index ? { ...item, code } : item)));
    setDeviceErrors((prev) => {
      const next = { ...prev };
      delete next[`d${index}`];
      return next;
    });
  };

  const removeDevice = (index: number) => {
    setDevices((prev) => prev.filter((_, idx) => idx !== index));
    setDeviceErrors({});
  };

  const handleSaveBasic = () => {
    if (!name.trim()) {
      setBasicError("Заполните название торговой точки");
      return false;
    }
    setBasicError("");
    return true;
  };

  const validateDevices = (): Array<{ code: string }> | null => {
    if (devices.length > 50) {
      setIntegrationsMessage("Можно добавить не более 50 устройств");
      return null;
    }
    const errors: Record<string, string> = {};
    const normalized = devices.map((item) => ({ code: item.code.trim() }));
    const seen = new Set<string>();
    normalized.forEach((device, index) => {
      const key = `d${index}`;
      if (!device.code) {
        errors[key] = "Введите идентификатор устройства";
        return;
      }
      if (!DEVICE_ID_PATTERN.test(device.code)) {
        errors[key] = "Допустимы латинские буквы, цифры, точки, дефисы и подчёркивания (2–64 символа)";
        return;
      }
      const normalizedKey = device.code.toLowerCase();
      if (seen.has(normalizedKey)) {
        errors[key] = "Идентификатор должен быть уникальным";
        return;
      }
      seen.add(normalizedKey);
    });
    setDeviceErrors(errors);
    if (Object.keys(errors).length > 0) {
      setIntegrationsMessage("Исправьте идентификаторы устройств");
      return null;
    }
    setDeviceErrors({});
    setIntegrationsMessage("");
    return normalized.filter((device) => device.code.length > 0);
  };

  const submitCreate = async () => {
    const okBasic = handleSaveBasic();
    if (!okBasic) return;
    const normalizedDevices = validateDevices();
    if (normalizedDevices === null) {
      setTab("INTEGRATIONS");
      return;
    }

    // Build payload
    const payload: any = {
      works,
      name: name.trim(),
      reviewsShareLinks: {
        yandex: reviewLinks.yandex.trim() || null,
        twogis: reviewLinks.twogis.trim() || null,
        google: reviewLinks.google.trim() || null,
      },
    };
    if (normalizedDevices.length) {
      payload.devices = normalizedDevices;
    }

    try {
      const res = await fetch('/api/portal/outlets', {
        method: 'POST',
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
        const msgStr = String(msg || 'Не удалось создать торговую точку');
        const lower = msgStr.toLowerCase();
        if (lower.includes('устрой') || lower.includes('device')) {
          setIntegrationsMessage(msgStr);
          setTab('INTEGRATIONS');
          setToast(msgStr);
          return;
        }
        setToast(msgStr);
        return;
      }
      setToast('Точка создана. Возврат к списку...');
      window.setTimeout(() => router.push('/outlets'), 600);
    } catch (e: any) {
      setToast(String(e?.message || e || 'Ошибка при создании'));
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0 }}>Добавить торговую точку</h1>
          <div style={{ opacity: 0.75, fontSize: 14 }}>Заполните информацию по вкладкам, затем создайте точку.</div>
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
            <button type="button" className={`btn ${tab === "INTEGRATIONS" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("INTEGRATIONS")}>
              Интеграции
            </button>
          </div>
        </CardBody>
      </Card>

      {tab === "BASIC" && (
        <Card>
          <CardHeader title="Основное" subtitle="Статус, название и ссылки на карточки отзывов" />
          <CardBody style={{ display: "grid", gap: 16 }}>
            <Toggle checked={works} onChange={setWorks} label="Работает" />

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Название *</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Например, Тили-Тесто, Московской 56"
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
                  onChange={(event) => setReviewLinks((prev) => ({ ...prev, yandex: event.target.value }))}
                  placeholder="https://yandex.ru/maps/..."
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>2ГИС</span>
                <input
                  value={reviewLinks.twogis}
                  onChange={(event) => setReviewLinks((prev) => ({ ...prev, twogis: event.target.value }))}
                  placeholder="https://2gis.ru/..."
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Google</span>
                <input
                  value={reviewLinks.google}
                  onChange={(event) => setReviewLinks((prev) => ({ ...prev, google: event.target.value }))}
                  placeholder="https://maps.google.com/..."
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                />
              </label>
            </div>

            {basicError && <div style={{ color: "#f87171", fontSize: 13 }}>{basicError}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="ghost" onClick={() => router.push("/outlets")}>Отменить</Button>
              <Button variant="primary" onClick={submitCreate}>Создать точку</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === "INTEGRATIONS" && (
        <Card>
          <CardHeader title="Устройства" />
          <CardBody style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gap: 12 }}>
              {devices.map((device, index) => {
                const key = `d${index}`;
                const error = deviceErrors[key];
                return (
                  <div key={key} className="glass" style={{ padding: 12, borderRadius: 12, display: "grid", gap: 10 }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 12, opacity: 0.7 }}>Укажите произвольный идентификатор устройства (допустимы латиница, цифры, точки, дефисы и подчёркивания)</span>
                      <input
                        value={device.code}
                        onChange={(event) => updateDeviceCode(index, event.target.value)}
                        placeholder="POS-1"
                        maxLength={64}
                        style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
                      />
                    </label>
                    {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <Button variant="ghost" onClick={() => removeDevice(index)}>Удалить</Button>
                    </div>
                  </div>
                );
              })}
              {devices.length < 50 && (
                <Button variant="ghost" onClick={addDeviceRow}>
                  Добавить устройство
                </Button>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <Button variant="ghost" onClick={() => router.push("/outlets")}>Отменить</Button>
              <Button variant="primary" onClick={submitCreate}>Создать точку</Button>
            </div>
            {integrationsMessage && <div style={{ color: "#f87171" }}>{integrationsMessage}</div>}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
