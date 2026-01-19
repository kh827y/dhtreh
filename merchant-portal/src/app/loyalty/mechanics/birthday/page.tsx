"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Cake,
  Calendar,
  Clock,
  Gift,
  MessageSquare,
  Settings,
  Save,
  ShoppingBag,
} from "lucide-react";
import { normalizeErrorMessage } from "lib/portal-errors";

const DEFAULT_TEXT = "С днём рождения! Мы подготовили для вас подарок в любимой кофейне.";

type TabKey = "main" | "stats";

type BirthdaySettings = {
  enabled: boolean;
  daysBefore: number;
  onlyBuyers: boolean;
  text: string;
  giftEnabled: boolean;
  giftPoints: number;
  giftBurnEnabled: boolean;
  giftTtlDays: number;
};

function BirthdayPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get("tab") === "stats" ? "stats" : "main";
  const [tab, setTab] = React.useState<TabKey>(initialTab);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [settings, setSettings] = React.useState<BirthdaySettings>({
    enabled: false,
    daysBefore: 5,
    onlyBuyers: false,
    text: DEFAULT_TEXT,
    giftEnabled: false,
    giftPoints: 0,
    giftBurnEnabled: false,
    giftTtlDays: 7,
  });

  React.useEffect(() => {
    const next = searchParams.get("tab") === "stats" ? "stats" : "main";
    setTab(next);
  }, [searchParams]);

  const handleTabChange = React.useCallback(
    (next: TabKey) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === "stats") {
        params.set("tab", "stats");
      } else {
        params.delete("tab");
      }
      router.replace(`?${params.toString()}`, { scroll: false });
      setTab(next);
    },
    [router, searchParams],
  );

  const load = React.useCallback(async (options?: { keepSuccess?: boolean }) => {
    setLoading(true);
    setError(null);
    if (!options?.keepSuccess) setSuccess(null);
    try {
      const res = await fetch("/api/portal/loyalty/birthday", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Не удалось загрузить настройки");
      setSettings((prev) => ({
        ...prev,
        enabled: Boolean(json?.enabled),
        daysBefore: Math.max(0, Math.floor(Number(json?.daysBefore ?? prev.daysBefore) || 0)),
        onlyBuyers: Boolean(json?.onlyBuyers),
        text: typeof json?.text === "string" ? json.text : prev.text,
        giftEnabled: Boolean(json?.giftEnabled),
        giftPoints: Math.max(0, Math.floor(Number(json?.giftPoints ?? prev.giftPoints) || 0)),
        giftBurnEnabled: Boolean(json?.giftBurnEnabled),
        giftTtlDays: Math.max(1, Math.floor(Number(json?.giftTtlDays ?? prev.giftTtlDays) || 0)),
      }));
    } catch (e: any) {
      setError(normalizeErrorMessage(e, "Не удалось загрузить настройки"));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const controlsDisabled = loading || saving;
  const detailDisabled = !settings.enabled || controlsDisabled;

  const handleSave = React.useCallback(async () => {
    if (saving) return;
    setError(null);
    setSuccess(null);

    const daysBefore = Math.max(0, Math.floor(Number(settings.daysBefore) || 0));
    const textValue = String(settings.text || "").trim();
    const giftPoints = Math.max(0, Math.floor(Number(settings.giftPoints) || 0));
    const giftTtlDays = Math.max(1, Math.floor(Number(settings.giftTtlDays) || 0));

    if (settings.enabled && !textValue) {
      setError("Введите текст Push-уведомления");
      return;
    }

    if (settings.giftEnabled && giftPoints <= 0) {
      setError("Укажите количество подарочных баллов");
      return;
    }

    if (settings.giftEnabled && settings.giftBurnEnabled && giftTtlDays <= 0) {
      setError("Срок сгорания должен быть положительным числом дней");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/portal/loyalty/birthday", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: settings.enabled,
          daysBefore,
          onlyBuyers: settings.onlyBuyers,
          text: textValue,
          giftEnabled: settings.giftEnabled,
          giftPoints: settings.giftEnabled ? giftPoints : 0,
          giftBurnEnabled: settings.giftEnabled ? settings.giftBurnEnabled : false,
          giftTtlDays: settings.giftEnabled && settings.giftBurnEnabled ? giftTtlDays : 0,
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
  }, [load, saving, settings]);

  const appendPlaceholder = React.useCallback((token: string) => {
    setSettings((prev) => ({
      ...prev,
      text: `${prev.text}${prev.text && !prev.text.endsWith(" ") ? " " : ""}${token}`,
    }));
  }, []);

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8">
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
            <h2 className="text-2xl font-bold text-gray-900 leading-tight">День рождения</h2>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <span className="font-medium">Механики</span>
              <span>/</span>
              <span>Поздравления</span>
            </div>
          </div>
        </div>

        {tab === "main" && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center space-x-2 bg-black text-white px-5 py-2.5 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-sm hover:shadow-md text-sm disabled:opacity-60"
          >
            <Save size={16} />
            <span>{saving ? "Сохраняем…" : "Сохранить"}</span>
          </button>
        )}
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            type="button"
            onClick={() => handleTabChange("main")}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center ${
              tab === "main"
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Settings size={16} className="mr-2" />
            Настройки
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("stats")}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center ${
              tab === "stats"
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <BarChart3 size={16} className="mr-2" />
            Аналитика
          </button>
        </nav>
      </div>

      {tab === "stats" ? (
        <div className="flex flex-col items-center justify-center h-96 text-gray-400 bg-white rounded-2xl border border-gray-200 border-dashed">
          <div className="bg-gray-50 p-4 rounded-full mb-4">
            <BarChart3 size={32} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">Статистика в разработке</h3>
          <p className="text-sm text-center max-w-md text-gray-500 px-4">
            Данные о количестве поздравленных клиентов и конверсии подарков появятся здесь после запуска.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div
            className={`rounded-xl border ${
              settings.enabled ? "bg-pink-50 border-pink-200" : "bg-white border-gray-200"
            }`}
          >
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-start space-x-4">
                <div
                  className={`p-3 rounded-lg ${
                    settings.enabled ? "bg-white text-pink-600 shadow-sm" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  <Cake size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className={`font-bold text-base ${settings.enabled ? "text-pink-900" : "text-gray-700"}`}>
                    {settings.enabled ? "Поздравления активны" : "Сценарий отключен"}
                  </h3>
                  <p className={`text-sm ${settings.enabled ? "text-pink-800" : "text-gray-500"}`}>
                    {settings.enabled
                      ? "Система автоматически отправляет поздравления и начисляет подарки клиентам в их день рождения."
                      : "Включите, чтобы радовать клиентов персональными подарками и повышать лояльность."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.enabled ? "bg-pink-500" : "bg-gray-200"
                }`}
                disabled={controlsDisabled}
              >
                <span className="sr-only">Toggle Birthday Greeting</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          <div
            className={`grid grid-cols-1 xl:grid-cols-12 gap-6 transition-opacity duration-200 ${
              detailDisabled ? "opacity-60 pointer-events-none" : "opacity-100"
            }`}
          >
            <div className="xl:col-span-7 space-y-6">
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="bg-purple-50 p-2 rounded-lg text-purple-600">
                    <Clock size={18} />
                  </div>
                  <h3 className="text-base font-bold text-gray-900">Время отправки</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                      За сколько дней
                    </label>
                    <div className="flex items-center space-x-3">
                      <div className="relative w-24">
                        <input
                          type="number"
                          min={0}
                          value={settings.daysBefore}
                          onChange={(event) =>
                            setSettings((prev) => ({
                              ...prev,
                              daysBefore: Math.max(0, Number(event.target.value) || 0),
                            }))
                          }
                          className="w-full bg-gray-50 border-transparent focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 rounded-lg px-3 py-2 text-center text-lg font-bold text-gray-900 transition-all outline-none"
                          disabled={controlsDisabled}
                        />
                      </div>
                      <span className="text-sm text-gray-600 font-medium">до Дня Рождения</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-2 flex items-center">
                      <Calendar size={12} className="mr-1.5" />
                      {settings.daysBefore === 0 ? "Отправим прямо в праздник." : "Отправим заранее."}
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 self-start">
                    <div className="mr-4">
                      <span className="block font-bold text-gray-900 mb-1 text-sm">Только активным</span>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        Поздравлять только тех, кто совершил хотя бы одну покупку.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.onlyBuyers}
                        onChange={(event) =>
                          setSettings((prev) => ({
                            ...prev,
                            onlyBuyers: event.target.checked,
                          }))
                        }
                        className="sr-only peer"
                        disabled={controlsDisabled}
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                    <MessageSquare size={18} />
                  </div>
                  <h3 className="text-base font-bold text-gray-900">Поздравление</h3>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                      Текст Push-уведомления
                    </label>
                    <textarea
                      rows={3}
                      maxLength={150}
                      value={settings.text}
                      onChange={(event) => setSettings((prev) => ({ ...prev, text: event.target.value }))}
                      className="w-full bg-gray-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg p-3 text-sm text-gray-900 resize-none transition-all outline-none"
                      placeholder="С днём рождения!..."
                      disabled={controlsDisabled}
                    />
                    <div className="flex justify-between items-center mt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 font-medium">Вставить:</span>
                        <button
                          type="button"
                          onClick={() => appendPlaceholder("%username%")}
                          className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded transition-colors"
                          disabled={controlsDisabled}
                        >
                          Имя клиента
                        </button>
                        <button
                          type="button"
                          onClick={() => appendPlaceholder("%bonus%")}
                          className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded transition-colors"
                          disabled={controlsDisabled}
                        >
                          Размер бонуса
                        </button>
                      </div>
                      <span
                        className={`text-xs ${settings.text.length > 140 ? "text-red-500 font-bold" : "text-gray-400"}`}
                      >
                        {settings.text.length}/150
                      </span>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 text-center">
                      Предпросмотр
                    </div>
                    <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 max-w-sm mx-auto flex items-start gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-rose-500 rounded-lg flex items-center justify-center text-white text-sm shadow-sm flex-shrink-0">
                        <Gift size={16} fill="currentColor" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <span className="font-bold text-gray-900 text-xs">Loyalty App</span>
                          <span className="text-[9px] text-gray-400">Только что</span>
                        </div>
                        <p className="text-xs text-gray-600 leading-snug break-words">
                          {settings.text || "Текст уведомления..."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="xl:col-span-5 space-y-6">
              <div
                className={`bg-white rounded-xl border shadow-sm transition-all duration-200 ${
                  settings.giftEnabled ? "border-pink-200 ring-1 ring-pink-100" : "border-gray-100"
                }`}
              >
                <div className="p-4 border-b border-gray-100/50 flex items-center justify-between bg-gray-50/30 rounded-t-xl">
                  <div className="flex items-center space-x-2">
                    <div
                      className={`p-1.5 rounded-md transition-colors ${
                        settings.giftEnabled ? "bg-pink-100 text-pink-600" : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      <Gift size={16} />
                    </div>
                    <h3 className={`font-bold text-sm ${settings.giftEnabled ? "text-gray-900" : "text-gray-500"}`}>
                      Подарок имениннику
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setSettings((prev) => ({
                        ...prev,
                        giftEnabled: !prev.giftEnabled,
                        giftPoints: !prev.giftEnabled && prev.giftPoints <= 0 ? 300 : prev.giftPoints,
                        giftBurnEnabled: !prev.giftEnabled ? prev.giftBurnEnabled : false,
                      }))
                    }
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      settings.giftEnabled ? "bg-pink-500" : "bg-gray-200"
                    }`}
                    disabled={controlsDisabled}
                  >
                    <span className="sr-only">Toggle Gift</span>
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.giftEnabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div
                  className={`p-5 space-y-5 ${settings.giftEnabled ? "" : "opacity-50 pointer-events-none"}`}
                >
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">Начислить баллы</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        value={settings.giftPoints}
                        onChange={(event) =>
                          setSettings((prev) => ({
                            ...prev,
                            giftPoints: Math.max(0, Number(event.target.value) || 0),
                          }))
                        }
                        className="w-full bg-gray-50 border-transparent focus:bg-white focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 rounded-lg px-3 py-2 font-bold text-gray-900 transition-all outline-none"
                        disabled={controlsDisabled}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                        pts
                      </span>
                    </div>
                  </div>

                  <div className="bg-orange-50/50 rounded-lg p-3 border border-orange-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-orange-900">Сгорание подарка</span>
                      <button
                        type="button"
                        onClick={() =>
                          setSettings((prev) => ({
                            ...prev,
                            giftBurnEnabled: !prev.giftBurnEnabled,
                            giftTtlDays:
                              !prev.giftBurnEnabled && prev.giftTtlDays <= 0 ? 7 : prev.giftTtlDays,
                          }))
                        }
                        className={`relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          settings.giftBurnEnabled ? "bg-orange-500" : "bg-gray-200"
                        }`}
                        disabled={controlsDisabled}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            settings.giftBurnEnabled ? "translate-x-3" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {settings.giftBurnEnabled && (
                      <div className="flex items-center space-x-2">
                        <div className="relative w-20">
                          <input
                            type="number"
                            min={1}
                            value={settings.giftTtlDays}
                            onChange={(event) =>
                              setSettings((prev) => ({
                                ...prev,
                                giftTtlDays: Math.max(1, Number(event.target.value) || 0),
                              }))
                            }
                            className="w-full bg-white border border-orange-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-md px-2 py-1 text-center font-semibold text-gray-900 text-sm outline-none"
                            disabled={controlsDisabled}
                          />
                        </div>
                        <span className="text-xs text-orange-800">дней</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start space-x-3">
                <div className="text-blue-500 mt-0.5">
                  <ShoppingBag size={16} />
                </div>
                <div className="text-xs text-blue-900/80 leading-relaxed">
                  <span className="font-bold text-blue-900 block mb-1">Полезный совет</span>
                  Ограниченный срок действия подарка (7-14 дней) значительно повышает вероятность визита клиента в
                  праздничные дни.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BirthdayPage() {
  return (
    <React.Suspense fallback={<div>Загрузка…</div>}>
      <BirthdayPageInner />
    </React.Suspense>
  );
}
