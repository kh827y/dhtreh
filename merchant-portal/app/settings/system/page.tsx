"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Badge } from "@loyalty/ui";
import { useTimezone, useTimezoneOptions, useTimezoneUpdater } from "../../../components/TimezoneProvider";
import { 
  Settings, 
  Building2, 
  Clock, 
  Globe, 
  MapPin,
  Save,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

const WAIT_LABEL_TIMEOUT = 2500;

export default function SystemSettingsPage() {
  const timezone = useTimezone();
  const options = useTimezoneOptions();
  const setTimezone = useTimezoneUpdater();
  const [companyName, setCompanyName] = React.useState("");
  const [savedName, setSavedName] = React.useState("");
  const [initialName, setInitialName] = React.useState("");
  const [nameLoading, setNameLoading] = React.useState(true);
  const [nameSaving, setNameSaving] = React.useState(false);
  const [nameMessage, setNameMessage] = React.useState<string | null>(null);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [value, setValue] = React.useState(timezone.code);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadName = React.useCallback(async () => {
    setNameLoading(true);
    setNameError(null);
    try {
      const res = await fetch("/api/portal/settings/name");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || "Не удалось загрузить название");
      }
      const nextName = String(data?.name || "");
      const origin = String(data?.initialName || nextName);
      setCompanyName(nextName);
      setSavedName(nextName);
      setInitialName(origin);
    } catch (err: any) {
      setNameError(String(err?.message || err));
    } finally {
      setNameLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadName();
  }, [loadName]);

  React.useEffect(() => {
    setValue(timezone.code);
  }, [timezone.code]);

  const saveName = React.useCallback(async () => {
    const nextName = companyName.trim();
    if (!nextName || nextName === savedName) return;
    setNameSaving(true);
    setNameError(null);
    setNameMessage(null);
    try {
      const res = await fetch("/api/portal/settings/name", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || "Не удалось сохранить название");
      }
      const updatedName = String(data?.name || nextName);
      setCompanyName(updatedName);
      setSavedName(updatedName);
      setInitialName(String(data?.initialName || initialName || updatedName));
      setNameMessage("Сохранено");
      setTimeout(() => setNameMessage(null), WAIT_LABEL_TIMEOUT);
    } catch (err: any) {
      setNameError(String(err?.message || err));
    } finally {
      setNameSaving(false);
    }
  }, [companyName, savedName, initialName]);

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
    <div className="animate-in" style={{ display: "grid", gap: 28 }}>
      {/* Page Header */}
      <header style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: "var(--radius-lg)",
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.1))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--brand-primary-light)",
        }}>
          <Settings size={24} />
        </div>
        <div>
          <h1 style={{ 
            fontSize: 28, 
            fontWeight: 800, 
            margin: 0,
            letterSpacing: "-0.02em",
          }}>
            Системные настройки
          </h1>
          <p style={{ 
            fontSize: 14, 
            color: "var(--fg-muted)", 
            margin: "6px 0 0",
            maxWidth: 600,
          }}>
            Основные настройки портала: название компании и часовой пояс
          </p>
        </div>
      </header>

      {/* Company Name Card */}
      <Card hover className="animate-in" style={{ animationDelay: "0.1s" }}>
        <CardHeader
          title="Название компании"
          subtitle="Отображается клиентам в приложении, уведомлениях и отчётах"
          icon={<Building2 size={20} />}
        />
        <CardBody style={{ padding: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ 
                fontSize: 13, 
                fontWeight: 500, 
                color: "var(--fg-secondary)" 
              }}>
                Отображаемое название
              </label>
              <input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                disabled={nameSaving || nameLoading}
                maxLength={120}
                placeholder={savedName || companyName || "Введите название компании"}
                className="input"
                style={{
                  fontSize: 15,
                }}
              />
            </div>

            <div style={{ 
              display: "flex", 
              gap: 16, 
              alignItems: "center",
              paddingTop: 4,
            }}>
              <Button
                variant="primary"
                disabled={
                  nameSaving || nameLoading || !companyName.trim() || companyName.trim() === savedName
                }
                onClick={saveName}
                leftIcon={<Save size={16} />}
              >
                {nameSaving ? "Сохранение..." : "Сохранить"}
              </Button>
              
              {nameMessage && (
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 6, 
                  color: "var(--success-light)", 
                  fontSize: 13,
                  fontWeight: 500,
                }}>
                  <CheckCircle2 size={16} />
                  {nameMessage}
                </div>
              )}
              
              {nameError && (
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 6, 
                  color: "var(--danger-light)", 
                  fontSize: 13 
                }}>
                  <AlertCircle size={16} />
                  {nameError}
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Timezone Card */}
      <Card hover className="animate-in" style={{ animationDelay: "0.2s" }}>
        <CardHeader
          title="Часовой пояс"
          subtitle="Применяется к аналитике, операциям и уведомлениям"
          icon={<Clock size={20} />}
        />
        <CardBody style={{ padding: 24 }}>
          <div style={{ display: "grid", gap: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ 
                fontSize: 13, 
                fontWeight: 500, 
                color: "var(--fg-secondary)" 
              }}>
                Регион России
              </label>
              <select
                value={value}
                onChange={(event) => setValue(event.target.value)}
                disabled={saving}
                className="input"
                style={{
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                {options.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Timezone Info */}
            <div className="info-panel">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(99, 102, 241, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--brand-primary-light)",
                }}>
                  <MapPin size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>Город</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{selected.city}</div>
                </div>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(6, 182, 212, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--brand-accent-light)",
                }}>
                  <Clock size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>Смещение</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    МСК{selected.mskOffset >= 0 ? `+${selected.mskOffset}` : selected.mskOffset}
                  </div>
                </div>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(16, 185, 129, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--success-light)",
                }}>
                  <Globe size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>UTC</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    UTC{selected.utcOffsetMinutes / 60 >= 0 ? "+" : ""}{selected.utcOffsetMinutes / 60}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ 
              display: "flex", 
              gap: 16, 
              alignItems: "center",
            }}>
              <Button 
                variant="primary" 
                disabled={saving || value === timezone.code} 
                onClick={applySelection}
                leftIcon={<Save size={16} />}
              >
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
              
              {message && (
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 6, 
                  color: "var(--success-light)", 
                  fontSize: 13,
                  fontWeight: 500,
                }}>
                  <CheckCircle2 size={16} />
                  {message}
                </div>
              )}
              
              {error && (
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 6, 
                  color: "var(--danger-light)", 
                  fontSize: 13 
                }}>
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
