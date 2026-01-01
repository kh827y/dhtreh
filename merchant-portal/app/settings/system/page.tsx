"use client";

import React from "react";
import { Globe, Building2, Clock, Save, QrCode } from "lucide-react";
import {
  useTimezone,
  useTimezoneUpdater,
} from "../../../components/TimezoneProvider";
import { readApiError, readErrorMessage } from "lib/portal-errors";

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

export default function SettingsSystemPage() {
  const timezone = useTimezone();
  const setTimezone = useTimezoneUpdater();
  const [companyName, setCompanyName] = React.useState("");
  const [savedCompanyName, setSavedCompanyName] = React.useState("");
  const [supportTelegram, setSupportTelegram] = React.useState("");
  const [savedSupportTelegram, setSavedSupportTelegram] = React.useState("");
  const [timezoneCode, setTimezoneCode] = React.useState(timezone.code);
  const [qrMode, setQrMode] = React.useState<"short" | "jwt">("short");
  const [savedQrMode, setSavedQrMode] = React.useState<"short" | "jwt">("short");
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
        const settingsRes = await fetch("/api/portal/settings/qr", {
          cache: "no-store",
        });
        if (!settingsRes.ok) {
          throw new Error(await readErrorMessage(settingsRes, "Не удалось загрузить системные настройки"));
        }
        const settingsData = (await settingsRes.json().catch(() => ({}))) as any;
        if (cancelled) return;
        const requireJwtForQuote = Boolean(settingsData?.requireJwtForQuote);
        const mode = requireJwtForQuote ? "jwt" : "short";
        setQrMode(mode);
        setSavedQrMode(mode);
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
    const shouldUpdateQrMode = qrMode !== savedQrMode;

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

    if (shouldUpdateQrMode) {
      tasks.push(
        (async () => {
          const res = await fetch("/api/portal/settings/qr", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requireJwtForQuote: qrMode === "jwt" }),
          });
          if (!res.ok) {
            throw new Error(await readErrorMessage(res, "Не удалось сохранить настройки QR"));
          }
          const data = (await res.json().catch(() => ({}))) as any;
          const nextMode = data?.requireJwtForQuote ? "jwt" : "short";
          setQrMode(nextMode);
          setSavedQrMode(nextMode);
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
    qrMode,
    savedQrMode,
    setTimezone,
  ]);

  return (
    <div className="p-8 max-w-[1000px] mx-auto space-y-8 ">
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
              Аккаунт поддержки в телеграм для приложения (username или @username).
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Тип QR-кода в приложении
            </label>
            <div className="grid gap-3">
              <label
                className={`flex gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                  qrMode === "short"
                    ? "border-purple-300 bg-purple-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="qrMode"
                  value="short"
                  checked={qrMode === "short"}
                  onChange={() => setQrMode("short")}
                  className="mt-1"
                />
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <QrCode size={16} className="text-purple-600" />
                    <span>Цифровой код (упрощённый режим)</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Последовательность из девяти цифр, присваивается клиенту и периодически меняется.
                    Касса может использовать её для операций с баллами — удобно, потому что короткий код
                    можно вручную ввести для поиска клиента.
                  </p>
                </div>
              </label>

              <label
                className={`flex gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                  qrMode === "jwt"
                    ? "border-purple-300 bg-purple-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="qrMode"
                  value="jwt"
                  checked={qrMode === "jwt"}
                  onChange={() => setQrMode("jwt")}
                  className="mt-1"
                />
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <QrCode size={16} className="text-purple-600" />
                    <span>Защищённый токен</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Требует расшифровки на сервере для операций и тоже периодически обновляется, создаёт
                    дополнительную защиту от мошенничества. Более безопасный способ, но поиск клиента
                    возможен только сканированием QR — код слишком длинный, вручную его ввести не получится.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
