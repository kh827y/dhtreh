"use client";

import React from "react";
import { Globe, Building2, Clock, Save, QrCode } from "lucide-react";
import {
  useTimezone,
  useTimezoneOptions,
  useTimezoneUpdater,
} from "../../../components/TimezoneProvider";
import { readApiError, readErrorMessage } from "lib/portal-errors";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");
const MAX_LOGO_SIZE = 512 * 1024;
const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

function resolveLogoUrl(value: string | null) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (!API_BASE) return value;
  return value.startsWith("/") ? `${API_BASE}${value}` : `${API_BASE}/${value}`;
}

export default function SettingsSystemPage() {
  const timezone = useTimezone();
  const timezoneOptions = useTimezoneOptions();
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
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [logoUploading, setLogoUploading] = React.useState(false);
  const [logoError, setLogoError] = React.useState<string>("");
  const logoInputRef = React.useRef<HTMLInputElement | null>(null);
  const resolvedTimezones = React.useMemo(() => {
    const list = timezoneOptions.length ? timezoneOptions : [timezone];
    const hasCurrent = list.some((item) => item.code === timezone.code);
    if (hasCurrent) return list;
    return [timezone, ...list];
  }, [timezone, timezoneOptions]);
  const resolvedLogoUrl = React.useMemo(() => resolveLogoUrl(logoUrl), [logoUrl]);

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

        const logoRes = await fetch("/api/portal/settings/logo", {
          cache: "no-store",
        });
        if (logoRes.ok) {
          const logoData = (await logoRes.json().catch(() => ({}))) as any;
          if (cancelled) return;
          const nextLogo =
            typeof logoData?.miniappLogoUrl === "string" ? logoData.miniappLogoUrl : "";
          setLogoUrl(nextLogo || null);
        }
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

  const handleLogoChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setLogoError("");
      if (!ALLOWED_LOGO_TYPES.has(file.type)) {
        setLogoError("Поддерживаются PNG, JPG, SVG или WEBP");
        event.target.value = "";
        return;
      }
      if (file.size > MAX_LOGO_SIZE) {
        setLogoError("Размер файла не должен превышать 512KB");
        event.target.value = "";
        return;
      }
      setLogoUploading(true);
      try {
        const body = new FormData();
        body.append("file", file, file.name);
        const res = await fetch("/api/portal/settings/logo", {
          method: "POST",
          body,
        });
        if (!res.ok) {
          throw new Error(await readErrorMessage(res, "Не удалось загрузить логотип"));
        }
        const data = (await res.json().catch(() => ({}))) as any;
        const nextLogo =
          typeof data?.miniappLogoUrl === "string" ? data.miniappLogoUrl : "";
        setLogoUrl(nextLogo || null);
      } catch (e: any) {
        setLogoError(readApiError(String(e?.message || e || "")) || "Не удалось загрузить логотип");
      } finally {
        setLogoUploading(false);
        event.target.value = "";
      }
    },
    [],
  );

  const handleLogoDelete = React.useCallback(async () => {
    if (logoUploading) return;
    setLogoError("");
    setLogoUploading(true);
    try {
      const res = await fetch("/api/portal/settings/logo", {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "Не удалось удалить логотип"));
      }
      setLogoUrl(null);
    } catch (e: any) {
      setLogoError(readApiError(String(e?.message || e || "")) || "Не удалось удалить логотип");
    } finally {
      setLogoUploading(false);
    }
  }, [logoUploading]);

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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Логотип мини‑аппы</label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden">
                {resolvedLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolvedLogoUrl}
                    alt="logo"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-gray-400">Нет логотипа</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoUploading}
                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
                  >
                    {logoUploading ? "Загружаем…" : "Загрузить логотип"}
                  </button>
                  {resolvedLogoUrl ? (
                    <button
                      type="button"
                      onClick={handleLogoDelete}
                      disabled={logoUploading}
                      className="px-4 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
                    >
                      Удалить
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-gray-500">PNG/JPG/SVG/WEBP, до 512KB.</p>
              </div>
            </div>
            {logoError ? (
              <p className="text-xs text-red-600 mt-2">{logoError}</p>
            ) : null}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleLogoChange}
              className="hidden"
            />
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
                {resolvedTimezones.map((tz) => (
                  <option key={tz.code} value={tz.code}>
                    {tz.label || tz.city || tz.code}
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
