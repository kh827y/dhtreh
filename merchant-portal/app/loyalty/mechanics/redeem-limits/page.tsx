"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Ban, CheckCircle2, Clock, Flame, Info, Save, ShieldCheck, Coins } from "lucide-react";

export default function RedeemLimitsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [limitations, setLimitations] = React.useState({
    isExpirationEnabled: false,
    expirationDays: 180,
    allowAccrualOnRedemption: false,
    activationDelay: 0,
  });

  const load = React.useCallback(async (options?: { keepSuccess?: boolean }) => {
    setLoading(true);
    setError(null);
    if (!options?.keepSuccess) setSuccess(null);
    try {
      const res = await fetch("/api/portal/loyalty/redeem-limits", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Не удалось загрузить настройки");

      setLimitations({
        isExpirationEnabled: Boolean(json?.ttlEnabled),
        expirationDays: Number(json?.ttlDays ?? 180) || 180,
        allowAccrualOnRedemption: Boolean(json?.allowSameReceipt),
        activationDelay: Math.max(0, Math.floor(Number(json?.delayDays ?? 0) || 0)),
      });
    } catch (e: any) {
      setError(String(e?.message || e || "Не удалось загрузить настройки"));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleSave = React.useCallback(async () => {
    if (saving) return;
    setError(null);
    setSuccess(null);

    const expirationDays = Math.max(1, Math.floor(Number(limitations.expirationDays) || 0));
    const activationDelay = Math.max(0, Math.floor(Number(limitations.activationDelay) || 0));

    if (limitations.isExpirationEnabled && expirationDays <= 0) {
      setError("Укажите количество дней для сгорания");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/portal/loyalty/redeem-limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ttlEnabled: limitations.isExpirationEnabled,
          ttlDays: limitations.isExpirationEnabled ? expirationDays : 0,
          allowSameReceipt: limitations.allowAccrualOnRedemption,
          delayEnabled: activationDelay > 0,
          delayDays: activationDelay,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Не удалось сохранить настройки");
      setSuccess("Настройки сохранены");
      await load({ keepSuccess: true });
    } catch (e: any) {
      setError(String(e?.message || e || "Не удалось сохранить настройки"));
    } finally {
      setSaving(false);
    }
  }, [limitations, load, saving]);

  return (
    <div className="p-8 max-w-[1400px] mx-auto animate-fade-in">
      <div className="space-y-6">
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
              className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
              aria-label="Назад к механикам"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Настройки бонусов</h2>
              <p className="text-sm text-gray-500">Правила сгорания, активации и списания баллов.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center space-x-2 bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-60"
            disabled={saving || loading}
          >
            <Save size={18} />
            <span>{saving ? "Сохраняем…" : "Сохранить"}</span>
          </button>
        </div>

        <div className={loading ? "opacity-60 pointer-events-none" : ""}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Expiration Settings */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col h-full">
              <div className="flex items-center space-x-3 mb-6">
                <div
                  className={`p-2.5 rounded-lg ${limitations.isExpirationEnabled ? "bg-orange-100 text-orange-600" : "bg-gray-100 text-gray-500"}`}
                >
                  <Flame size={24} />
                </div>
                <h3 className="font-bold text-gray-900 text-lg">Сгорание баллов</h3>
              </div>

              <div className="space-y-4 flex-1">
                <p className="text-sm text-gray-600 min-h-[40px]">
                  Настройте срок жизни баллов, полученных за покупки. Если баллы не использовать вовремя, они сгорят.
                </p>

                <div className="space-y-3 pt-2">
                  <label className="flex items-center space-x-3 cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors has-[:checked]:bg-blue-50 has-[:checked]:border-blue-200">
                    <input
                      type="radio"
                      name="expiration"
                      checked={!limitations.isExpirationEnabled}
                      onChange={() => setLimitations({ ...limitations, isExpirationEnabled: false })}
                      className="text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <div className="flex items-center space-x-2">
                      <ShieldCheck size={16} className="text-green-600" />
                      <span className="font-medium text-gray-900 text-sm">Баллы не сгорают</span>
                    </div>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors has-[:checked]:bg-orange-50 has-[:checked]:border-orange-200">
                    <input
                      type="radio"
                      name="expiration"
                      checked={limitations.isExpirationEnabled}
                      onChange={() => setLimitations({ ...limitations, isExpirationEnabled: true })}
                      className="text-orange-600 focus:ring-orange-500 h-4 w-4"
                    />
                    <span className="font-medium text-gray-900 text-sm">Сгорают через время</span>
                  </label>
                </div>

                {limitations.isExpirationEnabled && (
                  <div className="animate-fade-in pl-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                      Количество дней
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        value={limitations.expirationDays}
                        onChange={(e) =>
                          setLimitations({ ...limitations, expirationDays: Number(e.target.value) })
                        }
                        aria-label="Количество дней"
                        className="w-full border border-gray-300 rounded-lg pl-3 pr-12 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                        дней
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Simultaneous Accrual & Redemption */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col h-full">
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-2.5 rounded-lg bg-purple-100 text-purple-600">
                  <Coins size={24} />
                </div>
                <h3 className="font-bold text-gray-900 text-lg">Смешанная оплата</h3>
              </div>

              <div className="space-y-4 flex-1">
                <div className="flex items-start justify-between">
                  <p className="text-sm text-gray-600 flex-1 pr-4">
                    Разрешить списывать и начислять баллы одновременно в одном чеке?
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setLimitations({
                        ...limitations,
                        allowAccrualOnRedemption: !limitations.allowAccrualOnRedemption,
                      })
                    }
                    aria-label="Разрешить смешанную оплату"
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${limitations.allowAccrualOnRedemption ? "bg-purple-600" : "bg-gray-300"}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${limitations.allowAccrualOnRedemption ? "translate-x-6" : "translate-x-1"}`}
                    />
                  </button>
                </div>

                <div
                  className={`p-3 rounded-lg text-sm border ${limitations.allowAccrualOnRedemption ? "bg-purple-50 border-purple-100 text-purple-900" : "bg-gray-50 border-gray-200 text-gray-600"}`}
                >
                  {limitations.allowAccrualOnRedemption ? (
                    <div className="flex items-start space-x-2">
                      <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
                      <div className="space-y-1">
                        <p className="font-medium">Опция включена</p>
                        <p className="text-xs opacity-90">
                          После списания баллов клиенту начисляются новые баллы на{" "}
                          <strong>оплаченную деньгами часть чека</strong>.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start space-x-2">
                      <Ban size={16} className="mt-0.5 flex-shrink-0" />
                      <span>
                        Если клиент списывает баллы, начисление за этот чек{" "}
                        <strong>не производится</strong>.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Activation Delay */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col h-full">
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-2.5 rounded-lg bg-blue-100 text-blue-600">
                  <Clock size={24} />
                </div>
                <h3 className="font-bold text-gray-900 text-lg">Задержка активации</h3>
              </div>

              <div className="space-y-4 flex-1">
                <p className="text-sm text-gray-600 min-h-[40px]">
                  Баллы за покупку становятся доступными для списания через указанное время.
                </p>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                    Дней до активации
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={limitations.activationDelay}
                      onChange={(e) =>
                        setLimitations({ ...limitations, activationDelay: Number(e.target.value) })
                      }
                      aria-label="Дней до активации"
                      className="w-full border border-gray-300 rounded-lg pl-3 pr-12 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                      дней
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                  <Info size={14} className="flex-shrink-0" />
                  <span>0 = баллы доступны сразу после покупки.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
