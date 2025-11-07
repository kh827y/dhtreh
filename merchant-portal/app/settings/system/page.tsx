"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";
import { useTimezone, useTimezoneOptions, useTimezoneUpdater } from "../../../components/TimezoneProvider";

const WAIT_LABEL_TIMEOUT = 2500;

export default function SystemSettingsPage() {
  const timezone = useTimezone();
  const options = useTimezoneOptions();
  const setTimezone = useTimezoneUpdater();
  const [value, setValue] = React.useState(timezone.code);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setValue(timezone.code);
  }, [timezone.code]);

  const applySelection = React.useCallback(async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/portal/settings/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || "Не удалось сохранить настройки");
      }
      if (json?.timezone) {
        setTimezone(json.timezone);
      }
      setMessage("Сохранено");
      setTimeout(() => setMessage(null), WAIT_LABEL_TIMEOUT);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setSaving(false);
    }
  }, [value, setTimezone]);

  const selected = options.find((item) => item.code === value) || timezone;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header>
        <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Системные настройки</div>
        <div style={{ fontSize: 14, opacity: 0.8, maxWidth: 720 }}>
          Здесь задаётся единый часовой пояс для портала, аналитики и журналов. Все даты и вычисления выполняются относительно выбранного региона России.
        </div>
      </header>

      <Card>
        <CardHeader
          title="Часовой пояс мерчанта"
          subtitle="Используется для аналитики, журналов операций, расписаний и уведомлений"
        />
        <CardBody>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, opacity: 0.8 }}>Регион России (относительно МСК)</span>
              <select
                value={value}
                onChange={(event) => setValue(event.target.value)}
                disabled={saving}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.35)",
                  background: "rgba(15,23,42,0.6)",
                  color: "#e2e8f0",
                  fontSize: 14,
                }}
              >
                {options.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.85 }}>
              <div>
                <strong>Город/регион:</strong> {selected.city} ({selected.description})
              </div>
              <div>
                <strong>Смещение относительно Москвы:</strong> МСК{selected.mskOffset >= 0 ? `+${selected.mskOffset}` : selected.mskOffset}
              </div>
              <div>
                <strong>UTC:</strong> UTC{selected.utcOffsetMinutes / 60 >= 0 ? "+" : ""}
                {selected.utcOffsetMinutes / 60}
              </div>
              <div>
                <strong>IANA:</strong> {selected.iana}
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Button variant="primary" disabled={saving || value === timezone.code} onClick={applySelection}>
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
              {message ? <span style={{ color: "#34d399", fontSize: 13 }}>{message}</span> : null}
              {error ? <span style={{ color: "#f87171", fontSize: 13 }}>{error}</span> : null}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
