"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Coins,
  Gift,
  MessageSquare,
  Save,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import { normalizeErrorMessage } from "lib/portal-errors";
import { useActionGuard, useLatestRequest } from "lib/async-guards";
import { readPortalApiCache } from "lib/cache";

export default function RegistrationBonusPage() {
  const fallbackSettings = React.useMemo(
    () => ({
      isEnabled: true,
      pointsAmount: 500,
      burningEnabled: true,
      burningDays: 30,
      delayEnabled: false,
      delayHours: 1,
      pushEnabled: true,
      pushText: "Добро пожаловать в клуб! Вам начислено %bonus% приветственных баллов.",
    }),
    [],
  );
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const { start: startLoad, isLatest } = useLatestRequest();
  const runAction = useActionGuard();

  const [settings, setSettings] = React.useState(fallbackSettings);

  React.useEffect(() => {
    const cached = readPortalApiCache<Record<string, unknown>>("/api/portal/loyalty/registration-bonus");
    if (!cached || typeof cached !== "object") return;
    setSettings((prev) => ({
      ...prev,
      isEnabled: Boolean(cached.enabled),
      pointsAmount: Number(cached.points ?? prev.pointsAmount) || 0,
      burningEnabled: Boolean(cached.burnEnabled),
      burningDays: Math.max(1, Math.floor(Number(cached.burnTtlDays ?? prev.burningDays) || 0)),
      delayEnabled: Boolean(cached.delayEnabled),
      delayHours: Math.max(1, Math.floor(Number(cached.delayHours ?? prev.delayHours) || 0)),
      pushEnabled: Object.prototype.hasOwnProperty.call(cached, "pushEnabled")
        ? Boolean((cached as any).pushEnabled)
        : prev.pushEnabled,
      pushText: typeof cached.text === "string" ? cached.text : prev.pushText,
    }));
  }, []);

  const load = React.useCallback(async (options?: { keepSuccess?: boolean }) => {
    const requestId = startLoad();
    setLoading(true);
    setError(null);
    if (!options?.keepSuccess) setSuccess(null);
    try {
      const res = await fetch("/api/portal/loyalty/registration-bonus", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Не удалось загрузить настройки");
      if (!isLatest(requestId)) return;
      setSettings((prev) => ({
        ...prev,
        isEnabled: Boolean(json?.enabled),
        pointsAmount: Number(json?.points ?? prev.pointsAmount) || 0,
        burningEnabled: Boolean(json?.burnEnabled),
        burningDays: Math.max(1, Math.floor(Number(json?.burnTtlDays ?? prev.burningDays) || 0)),
        delayEnabled: Boolean(json?.delayEnabled),
        delayHours: Math.max(1, Math.floor(Number(json?.delayHours ?? prev.delayHours) || 0)),
        pushEnabled: Object.prototype.hasOwnProperty.call(json, "pushEnabled")
          ? Boolean((json as any).pushEnabled)
          : prev.pushEnabled,
        pushText: typeof json?.text === "string" ? json.text : prev.pushText,
      }));
    } catch (e: any) {
      if (!isLatest(requestId)) return;
      setError(normalizeErrorMessage(e, "Не удалось загрузить настройки"));
    } finally {
      if (isLatest(requestId)) setLoading(false);
    }
  }, [isLatest, startLoad]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleSave = React.useCallback(async () => {
    setError(null);
    setSuccess(null);

    const pointsAmount = Math.max(0, Math.floor(Number(settings.pointsAmount) || 0));
    const burningDays = Math.max(1, Math.floor(Number(settings.burningDays) || 0));
    const delayHours = Math.max(1, Math.floor(Number(settings.delayHours) || 0));
    const pushText = String(settings.pushText || "").trim();

    if (settings.isEnabled && pointsAmount <= 0) {
      setError("Укажите количество баллов за регистрацию");
      return;
    }

    if (settings.burningEnabled && burningDays <= 0) {
      setError("Срок сгорания должен быть положительным числом дней");
      return;
    }

    if (settings.delayEnabled && delayHours <= 0) {
      setError("Задержка начисления должна быть положительным числом часов");
      return;
    }

    if (settings.pushEnabled && !pushText) {
      setError("Введите текст Push-уведомления");
      return;
    }

    await runAction(async () => {
      setSaving(true);
      try {
        const res = await fetch("/api/portal/loyalty/registration-bonus", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: settings.isEnabled,
            points: pointsAmount,
            burnEnabled: settings.burningEnabled,
            burnTtlDays: settings.burningEnabled ? burningDays : 0,
            delayEnabled: settings.delayEnabled,
            delayHours: settings.delayEnabled ? delayHours : 0,
            pushEnabled: settings.pushEnabled,
            text: pushText,
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
    });
  }, [load, runAction, settings]);

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
            <h2 className="text-2xl font-bold text-gray-900 leading-tight">Баллы за регистрацию</h2>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <span className="font-medium">Механики</span>
              <span>/</span>
              <span>Приветственный бонус</span>
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
          className={`rounded-xl border transition-colors ${settings.isEnabled ? "bg-teal-50 border-teal-200" : "bg-white border-gray-200"}`}
        >
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-start space-x-4">
              <div
                className={`p-3 rounded-lg ${settings.isEnabled ? "bg-white text-teal-600 shadow-sm" : "bg-gray-100 text-gray-400"}`}
              >
                <UserPlus size={20} strokeWidth={2.5} />
              </div>
              <div>
                <h3 className={`font-bold text-base ${settings.isEnabled ? "text-teal-900" : "text-gray-700"}`}>
                  {settings.isEnabled ? "Бонус за регистрацию активен" : "Сценарий отключен"}
                </h3>
                <p className={`text-sm ${settings.isEnabled ? "text-teal-800" : "text-gray-500"}`}>
                  {settings.isEnabled
                    ? "Новые клиенты автоматически получают приветственные баллы при регистрации."
                    : "Включите, чтобы мотивировать новых клиентов на первую покупку."}
                </p>
              </div>
            </div>

            {/* Standard Toggle Switch */}
            <button
              type="button"
              onClick={() => setSettings({ ...settings, isEnabled: !settings.isEnabled })}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.isEnabled ? "bg-teal-500" : "bg-gray-200"}`}
              disabled={loading || saving}
            >
              <span className="sr-only">Toggle Registration Points</span>
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
            {/* Reward Card */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center space-x-3 mb-6">
                <div className="bg-yellow-50 p-2 rounded-lg text-yellow-600">
                  <Coins size={18} />
                </div>
                <h3 className="text-base font-bold text-gray-900">Начисление</h3>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                  Количество баллов
                </label>
                <div className="flex items-center space-x-3">
                  <div className="relative w-32">
                    <input
                      type="number"
                      min="0"
                      value={settings.pointsAmount}
                      onChange={(e) => setSettings({ ...settings, pointsAmount: Number(e.target.value) })}
                      aria-label="Количество баллов"
                      className="w-full bg-gray-50 border-transparent focus:bg-white focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/20 rounded-lg px-3 py-2 text-center text-lg font-bold text-gray-900 transition-all outline-none"
                    />
                  </div>
                  <span className="text-sm text-gray-600 font-medium">приветственных бонусов</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Начисляются единоразово сразу после успешной регистрации в системе.
                </p>
              </div>
            </div>

            {/* Message Card */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                    <MessageSquare size={18} />
                  </div>
                  <h3 className="text-base font-bold text-gray-900">Уведомление</h3>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.pushEnabled}
                    onChange={(e) => setSettings({ ...settings, pushEnabled: e.target.checked })}
                    className="sr-only peer"
                    disabled={loading || saving}
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className={`space-y-5 ${settings.pushEnabled ? "" : "opacity-50 pointer-events-none"}`}>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                    Текст Push-уведомления
                  </label>
                  <textarea
                    rows={3}
                    maxLength={150}
                    value={settings.pushText}
                    onChange={(e) => setSettings({ ...settings, pushText: e.target.value })}
                    aria-label="Текст Push-уведомления"
                    className="w-full bg-gray-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg p-3 text-sm text-gray-900 resize-none transition-all outline-none"
                    placeholder="Текст приветствия..."
                  />
                  <div className="flex justify-between items-center mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 font-medium">Вставить:</span>
                      <button
                        onClick={() =>
                          setSettings({ ...settings, pushText: settings.pushText + " %username%" })
                        }
                        className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded transition-colors"
                      >
                        Имя клиента
                      </button>
                      <button
                        onClick={() => setSettings({ ...settings, pushText: settings.pushText + " %bonus%" })}
                        className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded transition-colors"
                      >
                        Сумма бонуса
                      </button>
                    </div>
                    <span
                      className={`text-xs ${settings.pushText.length > 140 ? "text-red-500 font-bold" : "text-gray-400"}`}
                    >
                      {settings.pushText.length}/150
                    </span>
                  </div>
                </div>

                {/* Phone Preview */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 text-center">
                    Предпросмотр
                  </div>
                  <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 max-w-sm mx-auto flex items-start gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-lg flex items-center justify-center text-white text-sm shadow-sm flex-shrink-0">
                      <Gift size={16} fill="currentColor" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <span className="font-bold text-gray-900 text-xs">Loyalty App</span>
                        <span className="text-[9px] text-gray-400">Только что</span>
                      </div>
                      <p className="text-xs text-gray-600 leading-snug break-words">
                        {settings.pushText || "Текст уведомления..."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Options (5/12) */}
          <div className="xl:col-span-5 space-y-6">
            {/* Expiration Settings */}
            <div
              className={`bg-white rounded-xl border shadow-sm transition-all duration-200 ${settings.burningEnabled ? "border-orange-200 ring-1 ring-orange-100" : "border-gray-100"}`}
            >
              <div className="p-4 border-b border-gray-100/50 flex items-center justify-between bg-gray-50/30 rounded-t-xl">
                <div className="flex items-center space-x-2">
                  <div
                    className={`p-1.5 rounded-md transition-colors ${settings.burningEnabled ? "bg-orange-100 text-orange-600" : "bg-gray-100 text-gray-400"}`}
                  >
                    <Calendar size={16} />
                  </div>
                  <h3 className={`font-bold text-sm ${settings.burningEnabled ? "text-gray-900" : "text-gray-500"}`}>
                    Срок действия
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, burningEnabled: !settings.burningEnabled })}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.burningEnabled ? "bg-orange-500" : "bg-gray-200"}`}
                  disabled={loading || saving}
                >
                  <span className="sr-only">Toggle Burning</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.burningEnabled ? "translate-x-4" : "translate-x-0"}`}
                  />
                </button>
              </div>

              <div className={`p-5 ${settings.burningEnabled ? "" : "opacity-50 pointer-events-none"}`}>
                <p className="text-xs text-gray-600 mb-3">
                  Сгорают ли приветственные баллы, если клиент их не использует?
                </p>
                <div className="flex items-center space-x-3">
                  <div className="relative w-24">
                    <input
                      type="number"
                      min="1"
                      value={settings.burningDays}
                      onChange={(e) => setSettings({ ...settings, burningDays: Number(e.target.value) })}
                      aria-label="Срок действия"
                      className="w-full bg-white border border-orange-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-md px-2 py-1.5 text-center font-bold text-gray-900 text-sm outline-none"
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700">дней</span>
                </div>
              </div>
            </div>

            {/* Delay Settings */}
            <div
              className={`bg-white rounded-xl border shadow-sm transition-all duration-200 ${settings.delayEnabled ? "border-purple-200 ring-1 ring-purple-100" : "border-gray-100"}`}
            >
              <div className="p-4 border-b border-gray-100/50 flex items-center justify-between bg-gray-50/30 rounded-t-xl">
                <div className="flex items-center space-x-2">
                  <div
                    className={`p-1.5 rounded-md transition-colors ${settings.delayEnabled ? "bg-purple-100 text-purple-600" : "bg-gray-100 text-gray-400"}`}
                  >
                    <Clock size={16} />
                  </div>
                  <h3 className={`font-bold text-sm ${settings.delayEnabled ? "text-gray-900" : "text-gray-500"}`}>
                    Отложенное начисление
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, delayEnabled: !settings.delayEnabled })}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.delayEnabled ? "bg-purple-500" : "bg-gray-200"}`}
                  disabled={loading || saving}
                >
                  <span className="sr-only">Toggle Delay</span>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.delayEnabled ? "translate-x-4" : "translate-x-0"}`}
                  />
                </button>
              </div>

              <div className={`p-5 ${settings.delayEnabled ? "" : "opacity-50 pointer-events-none"}`}>
                <p className="text-xs text-gray-600 mb-3">
                  Начислить баллы не сразу, а через некоторое время после регистрации.
                </p>
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-gray-700">Через</span>
                  <div className="relative w-24">
                    <input
                      type="number"
                      min="1"
                      value={settings.delayHours}
                      onChange={(e) => setSettings({ ...settings, delayHours: Number(e.target.value) })}
                      aria-label="Отложенное начисление"
                      className="w-full bg-white border border-purple-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 rounded-md px-2 py-1.5 text-center font-bold text-gray-900 text-sm outline-none"
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700">часов</span>
                </div>
              </div>
            </div>

            {/* Info Tip */}
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start space-x-3">
              <div className="text-blue-500 mt-0.5">
                <ShieldAlert size={16} />
              </div>
              <div className="text-xs text-blue-900/80 leading-relaxed">
                <span className="font-bold text-blue-900 block mb-1">Защита от фрода</span>
                Включение задержки начисления помогает бороться с массовыми регистрациями ботов.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
