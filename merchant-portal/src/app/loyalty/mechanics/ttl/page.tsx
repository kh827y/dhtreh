"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Hourglass,
  MessageSquare,
  Flame,
  Clock,
  Bell,
  Info,
  CalendarDays,
} from "lucide-react";
import { normalizeErrorMessage } from "lib/portal-errors";

const MAX_DAYS_BEFORE = 90;
const MAX_TEXT_LENGTH = 150;

export default function BurnReminderPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [settings, setSettings] = useState({
    isEnabled: true,
    daysBefore: 3,
    pushText: "Уважаемый %username%, у вас сгорает %amount% баллов %burn_date%. Успейте потратить!",
  });
  const [forecastCount, setForecastCount] = useState<number | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  const load = React.useCallback(async (options?: { keepSuccess?: boolean }) => {
    setLoading(true);
    setError(null);
    if (!options?.keepSuccess) setSuccess(null);
    try {
      const res = await fetch("/api/portal/loyalty/ttl", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Не удалось загрузить настройки");
      setSettings((prev) => ({
        ...prev,
        isEnabled: Boolean(json?.enabled),
        daysBefore: Math.min(
          MAX_DAYS_BEFORE,
          Math.max(1, Math.floor(Number(json?.daysBefore ?? json?.days ?? prev.daysBefore) || 0)),
        ),
        pushText: typeof json?.text === "string" ? json.text : prev.pushText,
      }));
    } catch (e: any) {
      setError(normalizeErrorMessage(e, "Не удалось загрузить настройки"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadForecast = React.useCallback(async (daysBefore: number) => {
    const safeDays = Math.min(MAX_DAYS_BEFORE, Math.max(1, Math.floor(Number(daysBefore) || 0)));
    setForecastLoading(true);
    try {
      const res = await fetch(`/api/portal/loyalty/ttl/forecast?daysBefore=${safeDays}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Не удалось загрузить прогноз");
      const count = Number(json?.count ?? 0);
      setForecastCount(Number.isFinite(count) && count >= 0 ? count : 0);
    } catch {
      setForecastCount(null);
    } finally {
      setForecastLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      void loadForecast(settings.daysBefore);
    }, 300);
    return () => clearTimeout(timer);
  }, [loadForecast, settings.daysBefore]);

  const handleSave = React.useCallback(async () => {
    if (saving) return;
    setError(null);
    setSuccess(null);

    const rawDaysBefore = Math.floor(Number(settings.daysBefore) || 0);
    const daysBefore = Math.min(MAX_DAYS_BEFORE, Math.max(1, rawDaysBefore));
    const text = String(settings.pushText || "").trim();

    if (settings.isEnabled) {
      if (!text) {
        setError("Введите текст уведомления");
        return;
      }
      if (rawDaysBefore <= 0) {
        setError("Количество дней должно быть положительным");
        return;
      }
      if (rawDaysBefore > MAX_DAYS_BEFORE) {
        setError(`Количество дней не может превышать ${MAX_DAYS_BEFORE}`);
        return;
      }
      if (text.length > MAX_TEXT_LENGTH) {
        setError(`Текст уведомления не должен превышать ${MAX_TEXT_LENGTH} символов`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/portal/loyalty/ttl", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: settings.isEnabled,
          daysBefore,
          text,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Не удалось сохранить настройки");
      setSuccess("Настройки сохранены");
      await load({ keepSuccess: true });
    } catch (e: any) {
      setError(normalizeErrorMessage(e, "Не удалось сохранить настройки"));
    } finally {
      setSaving(false);
    }
  }, [load, saving, settings.daysBefore, settings.isEnabled, settings.pushText]);

  const insertPlaceholder = (placeholder: string) => {
    setSettings((prev) => ({
      ...prev,
      pushText: prev.pushText + " " + placeholder,
    }));
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 ">
      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm flex items-start space-x-3">
          <div className="font-semibold">Ошибка</div>
          <div className="flex-1 whitespace-pre-wrap break-words">{error}</div>
          <button type="button" className="text-red-700 underline underline-offset-2" onClick={() => void load()}>
            Повторить
          </button>
        </div>
      ) : null}

      {success ? (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-4 text-sm flex items-start space-x-3">
          <div className="font-semibold">Готово</div>
          <div className="flex-1 whitespace-pre-wrap break-words">{success}</div>
        </div>
      ) : null}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/loyalty/mechanics"
            className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 text-gray-600 transition-all"
            aria-label="Назад к механикам"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 leading-tight">Напоминание о сгорании</h2>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <span className="font-medium">Механики</span>
              <span>/</span>
              <span>Сгорание баллов</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center space-x-2 bg-black text-white px-5 py-2.5 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-sm hover:shadow-md text-sm disabled:opacity-60"
        >
          <Save size={16} />
          <span>{saving ? "Сохраняем…" : "Сохранить"}</span>
        </button>
      </div>

      {/* Content */}
      <div className="space-y-6">
        {/* Hero Status Card */}
        <div
          className={`rounded-xl border transition-colors ${settings.isEnabled ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}
        >
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-start space-x-4">
              <div
                className={`p-3 rounded-lg ${settings.isEnabled ? "bg-white text-amber-600 shadow-sm" : "bg-gray-100 text-gray-400"}`}
              >
                <Hourglass size={20} strokeWidth={2.5} />
              </div>
              <div>
                <h3 className={`font-bold text-base ${settings.isEnabled ? "text-amber-900" : "text-gray-700"}`}>
                  {settings.isEnabled ? "Напоминание активно" : "Сценарий отключен"}
                </h3>
                <p className={`text-sm ${settings.isEnabled ? "text-amber-800" : "text-gray-500"}`}>
                  {settings.isEnabled
                    ? "Клиенты получат уведомление, когда срок действия их баллов будет подходить к концу."
                    : "Включите, чтобы мотивировать клиентов тратить баллы до их сгорания."}
                </p>
              </div>
            </div>

            {/* Standard Toggle Switch */}
            <button
              type="button"
              onClick={() => setSettings({ ...settings, isEnabled: !settings.isEnabled })}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.isEnabled ? "bg-amber-500" : "bg-gray-200"}`}
              disabled={loading || saving}
            >
              <span className="sr-only">Toggle Expiration Reminder</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.isEnabled ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>
        </div>

        <div
          className={`grid grid-cols-1 xl:grid-cols-12 gap-6 transition-opacity duration-200 ${settings.isEnabled ? "opacity-100" : "opacity-60 pointer-events-none"}`}
        >
          {/* LEFT COLUMN: Logic & Message (7/12) */}
          <div className="xl:col-span-7 space-y-6">
            {/* Trigger Card */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center space-x-3 mb-6">
                <div className="bg-purple-50 p-2 rounded-lg text-purple-600">
                  <Clock size={18} />
                </div>
                <h3 className="text-base font-bold text-gray-900">Время отправки</h3>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                  За сколько дней отправлять
                </label>
                <div className="flex items-center space-x-3">
                  <div className="relative w-24">
                    <input
                      type="number"
                      min="1"
                      max={MAX_DAYS_BEFORE}
                      value={settings.daysBefore}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          daysBefore: Math.min(MAX_DAYS_BEFORE, Math.max(1, Number(e.target.value))),
                        })
                      }
                      aria-label="За сколько дней отправлять"
                      className="w-full bg-gray-50 border-transparent focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 rounded-lg px-3 py-2 text-center text-lg font-bold text-gray-900 transition-all outline-none"
                    />
                  </div>
                  <span className="text-sm text-gray-600 font-medium">дней до сгорания</span>
                </div>
                <p className="text-xs text-gray-400 mt-2 flex items-center">
                  <Flame size={12} className="mr-1.5 text-orange-500" />
                  Уведомление придёт только тем клиентам, у которых есть баллы с истекающим сроком.
                </p>
              </div>
            </div>

            {/* Message Card */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center space-x-3 mb-6">
                <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                  <MessageSquare size={18} />
                </div>
                <h3 className="text-base font-bold text-gray-900">Уведомление</h3>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                    Текст Push-уведомления
                  </label>
                  <textarea
                    rows={3}
                    maxLength={MAX_TEXT_LENGTH}
                    value={settings.pushText}
                    onChange={(e) => setSettings({ ...settings, pushText: e.target.value })}
                    aria-label="Текст Push-уведомления"
                    className="w-full bg-gray-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg p-3 text-sm text-gray-900 resize-none transition-all outline-none"
                    placeholder="Напишите напоминание..."
                  />
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-3 gap-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => insertPlaceholder("%username%")}
                        className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded transition-colors border border-gray-200"
                      >
                        Имя клиента
                      </button>
                      <button
                        onClick={() => insertPlaceholder("%amount%")}
                        className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded transition-colors border border-gray-200"
                      >
                        Кол-во баллов
                      </button>
                      <button
                        onClick={() => insertPlaceholder("%burn_date%")}
                        className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded transition-colors border border-gray-200"
                      >
                        Дата сгорания
                      </button>
                    </div>
                    <span
                      className={`text-xs ${
                        settings.pushText.length > MAX_TEXT_LENGTH - 10 ? "text-red-500 font-bold" : "text-gray-400"
                      } ml-auto`}
                    >
                      {settings.pushText.length}/{MAX_TEXT_LENGTH}
                    </span>
                  </div>
                </div>

                {/* Phone Preview */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 text-center">
                    Предпросмотр
                  </div>
                  <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 max-w-sm mx-auto flex items-start gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center text-white text-sm shadow-sm flex-shrink-0">
                      <Flame size={16} fill="currentColor" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <span className="font-bold text-gray-900 text-xs">Loyalty App</span>
                        <span className="text-[9px] text-gray-400">Только что</span>
                      </div>
                      <p className="text-xs text-gray-600 leading-snug break-words">
                        {settings.pushText
                          .replace("%username%", "Александр")
                          .replace("%amount%", "500")
                          .replace("%burn_date%", "25.12") || "Текст уведомления..."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Info (5/12) */}
          <div className="xl:col-span-5 space-y-6">
            <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 flex items-start space-x-4">
              <div className="text-blue-500 mt-1">
                <Info size={24} />
              </div>
              <div>
                <h4 className="font-bold text-blue-900 mb-1">Зачем это нужно?</h4>
                <p className="text-sm text-blue-800/80 leading-relaxed mb-3">
                  Напоминание о сгорании баллов — один из самых эффективных способов вернуть клиента. Страх потери
                  накопленного (FOMO) мотивирует совершить покупку.
                </p>
                <div className="text-xs font-semibold text-blue-700 bg-white/50 px-3 py-2 rounded-lg inline-block">
                  💡 Рекомендуем ставить 3-7 дней до сгорания.
                </div>
              </div>
            </div>

            {/* Stats Placeholder */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center space-x-2 mb-4">
                <Bell size={20} className="text-gray-400" />
                <h3 className="font-bold text-gray-900">Прогноз охвата</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">
                    Клиентов с напоминанием (в ближ. {settings.daysBefore} дн.)
                  </span>
                  <span className="font-bold text-gray-900">
                    {forecastLoading ? "..." : forecastCount ?? "—"}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Прогноз рассчитывается по реальным баллам со сроком сгорания.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center space-x-2 mb-4">
                <CalendarDays size={20} className="text-gray-400" />
                <h3 className="font-bold text-gray-900">Расписание проверки</h3>
              </div>
              <p className="text-sm text-gray-600">
                Система проверяет баллы несколько раз в день и отправляет уведомления по мере приближения срока.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
