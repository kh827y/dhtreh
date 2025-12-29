"use client";

import React from "react";
import { Globe, Building2, Clock, Save } from "lucide-react";
import {
  useTimezone,
  useTimezoneUpdater,
} from "../../../components/TimezoneProvider";

const timezones = [
  { value: "MSK-1", label: "(MSK-1) Калининград" },
  { value: "MSK+0", label: "(MSK) Москва, Санкт-Петербург" },
  { value: "MSK+1", label: "(MSK+1) Самара" },
  { value: "MSK+2", label: "(MSK+2) Екатеринбург" },
  { value: "MSK+3", label: "(MSK+3) Омск" },
  { value: "MSK+4", label: "(MSK+4) Красноярск" },
  { value: "MSK+5", label: "(MSK+5) Иркутск" },
  { value: "MSK+6", label: "(MSK+6) Якутск" },
  { value: "MSK+7", label: "(MSK+7) Владивосток" },
  { value: "MSK+8", label: "(MSK+8) Магадан" },
  { value: "MSK+9", label: "(MSK+9) Камчатка" },
];

function readApiError(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === "string") return payload.trim() || null;
  if (typeof payload === "object" && payload) {
    const anyPayload = payload as any;
    if (typeof anyPayload.message === "string") return anyPayload.message;
    if (
      Array.isArray(anyPayload.message) &&
      typeof anyPayload.message[0] === "string"
    ) {
      return anyPayload.message[0];
    }
    if (typeof anyPayload.error === "string") return anyPayload.error;
  }
  return null;
}

async function readErrorMessage(res: Response, fallback: string) {
  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return readApiError(json || text) || fallback;
}

export default function SettingsSystemPage() {
  const timezone = useTimezone();
  const setTimezone = useTimezoneUpdater();
  const [companyName, setCompanyName] = React.useState("");
  const [savedCompanyName, setSavedCompanyName] = React.useState("");
  const [supportTelegram, setSupportTelegram] = React.useState("");
  const [savedSupportTelegram, setSavedSupportTelegram] = React.useState("");
  const [timezoneCode, setTimezoneCode] = React.useState(timezone.code);
  const [saving, setSaving] = React.useState(false);
  const [success, setSuccess] = React.useState<string>("");

  React.useEffect(() => {
    setTimezoneCode(timezone.code);
  }, [timezone.code]);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/portal/settings/name", {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(await readErrorMessage(res, "Не удалось загрузить название"));
        }
        const data = (await res.json().catch(() => ({}))) as any;
        if (cancelled) return;
        const name = String(data?.name || "");
        setCompanyName(name);
        setSavedCompanyName(name);
        const supportRes = await fetch("/api/portal/settings/support", {
          cache: "no-store",
        });
        if (!supportRes.ok) {
          throw new Error(await readErrorMessage(supportRes, "Не удалось загрузить поддержку"));
        }
        const supportData = (await supportRes.json().catch(() => ({}))) as any;
        if (cancelled) return;
        const supportValue = String(supportData?.supportTelegram || "");
        setSupportTelegram(supportValue);
        setSavedSupportTelegram(supportValue);
      } catch (e: any) {
        if (cancelled) return;
        alert(readApiError(String(e?.message || e || "")) || "Не удалось загрузить название компании");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = React.useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setSuccess("");

    const trimmedName = companyName.trim();
    const shouldUpdateName = trimmedName !== savedCompanyName;
    const trimmedSupport = supportTelegram.trim();
    const shouldUpdateSupport = trimmedSupport !== savedSupportTelegram;
    const shouldUpdateTimezone = timezoneCode !== timezone.code;

    const tasks: Array<Promise<void>> = [];

    if (shouldUpdateName) {
      if (!trimmedName) {
        alert("Введите название");
        setSaving(false);
        return;
      }
      tasks.push(
        (async () => {
          const res = await fetch("/api/portal/settings/name", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmedName }),
          });
          if (!res.ok) {
            throw new Error(await readErrorMessage(res, "Не удалось сохранить название"));
          }
          const data = (await res.json().catch(() => ({}))) as any;
          const updatedName = String(data?.name || trimmedName);
          setCompanyName(updatedName);
          setSavedCompanyName(updatedName);
        })(),
      );
    }

    if (shouldUpdateTimezone) {
      tasks.push(
        (async () => {
          const res = await fetch("/api/portal/settings/timezone", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: timezoneCode }),
          });
          if (!res.ok) {
            throw new Error(await readErrorMessage(res, "Не удалось сохранить часовой пояс"));
          }
          const data = (await res.json().catch(() => ({}))) as any;
          if (data?.timezone) {
            setTimezone(data.timezone);
            setTimezoneCode(String(data.timezone.code || timezoneCode));
          }
        })(),
      );
    }

    if (shouldUpdateSupport) {
      tasks.push(
        (async () => {
          const res = await fetch("/api/portal/settings/support", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ supportTelegram: trimmedSupport || null }),
          });
          if (!res.ok) {
            throw new Error(await readErrorMessage(res, "Не удалось сохранить поддержку"));
          }
          const data = (await res.json().catch(() => ({}))) as any;
          const nextSupport = String(data?.supportTelegram || "");
          setSupportTelegram(nextSupport);
          setSavedSupportTelegram(nextSupport);
        })(),
      );
    }

    try {
      const results = await Promise.allSettled(tasks);
      const errors = results.filter((r) => r.status === "rejected") as Array<PromiseRejectedResult>;
      if (errors.length > 0) {
        const message = errors
          .map((err) => String((err.reason as any)?.message || err.reason || ""))
          .filter(Boolean)
          .join("\n");
        alert(readApiError(message) || "Не удалось сохранить системные настройки");
        return;
      }
      setSuccess("Системные настройки сохранены!");
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    companyName,
    savedCompanyName,
    supportTelegram,
    savedSupportTelegram,
    timezoneCode,
    timezone.code,
    setTimezone,
  ]);

  return (
    <div className="p-8 max-w-[1000px] mx-auto space-y-8 animate-fade-in">
      {success ? (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-4 text-sm flex items-start space-x-3">
          <div className="font-semibold">Готово</div>
          <div className="flex-1 whitespace-pre-wrap break-words">{success}</div>
        </div>
      ) : null}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Системные настройки</h2>
          <p className="text-gray-500 mt-1">Базовые параметры вашего проекта.</p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          aria-busy={saving}
          className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm"
        >
          <Save size={18} />
          <span>Сохранить</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center space-x-2 text-gray-900 font-bold text-lg">
            <Globe size={20} className="text-purple-600" />
            <h3>Общие параметры</h3>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Company Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Название компании</label>
            <div className="relative">
              <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                placeholder="Введите название"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Это название будет отображаться клиентам в приложении и уведомлениях.
            </p>
          </div>

          {/* Support Telegram */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Telegram поддержки</label>
            <div className="relative">
              <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={supportTelegram}
                onChange={(e) => setSupportTelegram(e.target.value)}
                className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                placeholder="@support"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Ссылка на чат поддержки для мини‑аппы (username или @username).
            </p>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Часовой пояс</label>
            <div className="relative">
              <Clock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={timezoneCode}
                onChange={(e) => setTimezoneCode(e.target.value)}
                className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 bg-white appearance-none focus:ring-2 focus:ring-purple-500 focus:outline-none cursor-pointer"
              >
                {timezones.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Используется для корректного отображения времени транзакций и планирования рассылок.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
