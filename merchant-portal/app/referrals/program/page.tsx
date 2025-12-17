"use client";

import React from "react";
import {
  AlertCircle,
  ArrowLeft,
  Coins,
  Gift,
  Info,
  Layers,
  MessageSquare,
  Percent,
  Save,
  Share2,
  Smartphone,
  Users,
} from "lucide-react";
import {
  DEFAULT_REFERRAL_PROGRAM_FORM,
  buildReferralProgramPayload,
  mapReferralProgramApiToForm,
  validateReferralProgramForm,
  type ReferralProgramFormState,
  type ReferralProgramSettingsApi,
} from "./referral-program-model";

type RegistrationBonusState = { loaded: boolean; enabled: boolean; points: number };

export default function ReferralProgramSettingsPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [settings, setSettings] = React.useState<ReferralProgramFormState>(DEFAULT_REFERRAL_PROGRAM_FORM);
  const [registrationBonus, setRegistrationBonus] = React.useState<RegistrationBonusState>({
    loaded: false,
    enabled: false,
    points: 0,
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [refRes, regRes] = await Promise.all([
        fetch("/api/portal/referrals/program", { cache: "no-store" }),
        fetch("/api/portal/loyalty/registration-bonus", { cache: "no-store" }),
      ]);

      const refJson = (await refRes.json().catch(() => ({}))) as ReferralProgramSettingsApi;
      if (!refRes.ok) throw new Error((refJson as any)?.message || "Не удалось загрузить настройки");
      setSettings(mapReferralProgramApiToForm(refJson));

      const regJson = (await regRes.json().catch(() => ({}))) as any;
      if (!regRes.ok) {
        setRegistrationBonus({ loaded: true, enabled: false, points: 0 });
      } else {
        const points = Math.max(0, Math.floor(Number(regJson?.points ?? 0) || 0));
        const enabled = Boolean(regJson?.enabled) && points > 0;
        setRegistrationBonus({ loaded: true, enabled, points });
      }
    } catch (e: any) {
      alert(String(e?.message || e || "Не удалось загрузить настройки"));
      setRegistrationBonus({ loaded: true, enabled: false, points: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleSave = React.useCallback(async () => {
    if (loading || saving) return;
    const validationError = validateReferralProgramForm(settings);
    if (validationError) {
      alert(validationError);
      return;
    }

    setSaving(true);
    try {
      const payload = buildReferralProgramPayload(settings);
      const res = await fetch("/api/portal/referrals/program", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as ReferralProgramSettingsApi;
      if (!res.ok) throw new Error((json as any)?.message || "Не удалось сохранить настройки");
      alert("Настройки реферальной программы сохранены!");
      setSettings(mapReferralProgramApiToForm(json, settings));
    } catch (e: any) {
      alert(String(e?.message || e || "Не удалось сохранить настройки"));
    } finally {
      setSaving(false);
    }
  }, [loading, saving, settings]);

  const updateLevelValue = React.useCallback((index: number, value: number) => {
    setSettings((prev) => {
      const nextLevels = [...prev.levels] as ReferralProgramFormState["levels"];
      nextLevels[index] = { ...nextLevels[index], value };
      return { ...prev, levels: nextLevels };
    });
  }, []);

  const insertPlaceholder = React.useCallback((field: "inviteCtaText" | "shareMessageText", placeholder: string) => {
    setSettings((prev) => {
      const maxLen = field === "inviteCtaText" ? 200 : 300;
      return {
        ...prev,
        [field]: (prev[field] + " " + placeholder).slice(0, maxLen),
      };
    });
  }, []);

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            type="button"
            onClick={() => {
              window.location.href = "/loyalty/mechanics";
            }}
            className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 text-gray-600 transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 leading-tight">Реферальная программа</h2>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <span className="font-medium">Механики</span>
              <span>/</span>
              <span>Пригласи друга</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={loading || saving}
          className="flex items-center space-x-2 bg-black text-white px-5 py-2.5 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-sm hover:shadow-md text-sm"
        >
          <Save size={16} />
          <span>Сохранить</span>
        </button>
      </div>

      {/* Content */}
      <div className="space-y-6">
        {/* Hero Status Card */}
        <div
          className={`rounded-xl border transition-colors ${settings.isEnabled ? "bg-purple-50 border-purple-200" : "bg-white border-gray-200"}`}
        >
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-start space-x-4">
              <div
                className={`p-3 rounded-lg ${settings.isEnabled ? "bg-white text-purple-600 shadow-sm" : "bg-gray-100 text-gray-400"}`}
              >
                <Share2 size={20} strokeWidth={2.5} />
              </div>
              <div>
                <h3 className={`font-bold text-base ${settings.isEnabled ? "text-purple-900" : "text-gray-700"}`}>
                  {settings.isEnabled ? "Реферальная программа активна" : "Сценарий отключен"}
                </h3>
                <p className={`text-sm ${settings.isEnabled ? "text-purple-800" : "text-gray-500"}`}>
                  {settings.isEnabled
                    ? "Клиенты получают вознаграждение за приглашение друзей."
                    : "Включите, чтобы запустить виральный рост базы клиентов."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSettings({ ...settings, isEnabled: !settings.isEnabled })}
              disabled={loading || saving}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.isEnabled ? "bg-purple-500" : "bg-gray-200"}`}
            >
              <span className="sr-only">Toggle Referral</span>
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
          {/* LEFT COLUMN: Logic (7/12) */}
          <div className="xl:col-span-7 space-y-6">
            {/* Referrer Logic */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center space-x-3 mb-6 border-b border-gray-100 pb-4">
                <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                  <Users size={18} />
                </div>
                <h3 className="text-base font-bold text-gray-900">Награда приглашающему</h3>
              </div>

              <div className="space-y-6">
                {/* Trigger & Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                      За что поощрять?
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 has-[:checked]:border-purple-500 has-[:checked]:bg-purple-50 transition-all">
                        <input
                          type="radio"
                          name="trigger"
                          checked={settings.rewardTrigger === "first"}
                          onChange={() => setSettings({ ...settings, rewardTrigger: "first" })}
                          className="text-purple-600 focus:ring-purple-500"
                          disabled={loading || saving}
                        />
                        <span className="text-sm font-medium text-gray-900">За первую покупку друга</span>
                      </label>
                      <label className="flex items-center space-x-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 has-[:checked]:border-purple-500 has-[:checked]:bg-purple-50 transition-all">
                        <input
                          type="radio"
                          name="trigger"
                          checked={settings.rewardTrigger === "all"}
                          onChange={() => setSettings({ ...settings, rewardTrigger: "all" })}
                          className="text-purple-600 focus:ring-purple-500"
                          disabled={loading || saving}
                        />
                        <span className="text-sm font-medium text-gray-900">За все покупки друга</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                      Тип поощрения
                    </label>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, rewardType: "fixed" })}
                        disabled={loading || saving}
                        className={`flex-1 py-2 rounded-md text-sm font-medium flex items-center justify-center space-x-2 transition-all ${settings.rewardType === "fixed" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        <Coins size={14} />
                        <span>Баллы</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, rewardType: "percent" })}
                        disabled={loading || saving}
                        className={`flex-1 py-2 rounded-md text-sm font-medium flex items-center justify-center space-x-2 transition-all ${settings.rewardType === "percent" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        <Percent size={14} />
                        <span>Процент от чека</span>
                      </button>
                    </div>

                    <div className="mt-4">
                      <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
                        Мин. сумма заказа
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          value={settings.minOrderAmount}
                          onChange={(e) => setSettings({ ...settings, minOrderAmount: Number(e.target.value) })}
                          className="w-full border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                          disabled={loading || saving}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₽</span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">0 = при любой сумме.</p>
                    </div>
                  </div>
                </div>

                <hr className="border-gray-100" />

                {/* Levels */}
                <div>
                  <div className="space-y-3">
                    {settings.isMultiLevel ? (
                      // Multi Level Inputs
                      settings.levels.map((lvl, index) => (
                        <div
                          key={lvl.level}
                          className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100 animate-fade-in"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                              {lvl.level}
                            </div>
                            <span className="text-sm text-gray-700 font-medium">
                              {lvl.level === 1 ? "Прямое приглашение" : lvl.level === 2 ? "Друг друга" : "3-й уровень"}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              min="0"
                              value={lvl.value}
                              onChange={(e) => updateLevelValue(index, Number(e.target.value))}
                              className="w-20 border border-gray-300 rounded-md px-2 py-1 text-right text-sm font-bold text-gray-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                              disabled={loading || saving}
                            />
                            <span className="text-xs text-gray-500 font-medium w-4">
                              {settings.rewardType === "fixed" ? "Б" : "%"}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      // Single Level Input
                      <div className="flex items-center justify-between bg-purple-50 p-4 rounded-lg border border-purple-100">
                        <span className="text-sm font-medium text-purple-900">Размер вознаграждения</span>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            min="0"
                            value={settings.levels[0].value}
                            onChange={(e) => updateLevelValue(0, Number(e.target.value))}
                            className="w-24 border-transparent focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 rounded-lg px-3 py-2 text-right font-bold text-gray-900 bg-white shadow-sm outline-none"
                            disabled={loading || saving}
                          />
                          <span className="text-sm font-bold text-purple-700 w-4">
                            {settings.rewardType === "fixed" ? "Б" : "%"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center space-x-2">
                      <Layers size={18} className="text-purple-500" />
                      <span className="font-bold text-gray-900 text-sm">Многоуровневая система</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.isMultiLevel}
                        onChange={(e) => setSettings({ ...settings, isMultiLevel: e.target.checked })}
                        className="sr-only peer"
                        disabled={loading || saving}
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Referee Logic */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center space-x-3 mb-6 border-b border-gray-100 pb-4">
                <div className="bg-green-50 p-2 rounded-lg text-green-600">
                  <Gift size={18} />
                </div>
                <h3 className="text-base font-bold text-gray-900">Награда другу (приглашенному)</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                    Приветственные баллы
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={settings.friendReward}
                      onChange={(e) => setSettings({ ...settings, friendReward: Number(e.target.value) })}
                      className="w-full border border-gray-300 rounded-lg pl-3 pr-12 py-2 text-lg font-bold text-gray-900 focus:ring-2 focus:ring-green-500 focus:outline-none"
                      disabled={loading || saving}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">pts</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Начисляются сразу после регистрации по реферальной ссылке.</p>
                </div>

                <div className="flex flex-col justify-center">
                  <label className="flex items-start space-x-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center h-5">
                      <input
                        type="checkbox"
                        checked={settings.stackWithRegistration}
                        onChange={(e) => setSettings({ ...settings, stackWithRegistration: e.target.checked })}
                        className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                        disabled={loading || saving}
                      />
                    </div>
                    <div>
                      <span className="font-medium text-gray-900 text-sm block">Суммировать с регистрацией</span>
                      <p className="text-xs text-gray-500 mt-1 leading-snug">
                        {!registrationBonus.loaded ? null : registrationBonus.enabled ? (
                          <>
                            Если включено: <strong>{registrationBonus.points}</strong> (за рег.) +{" "}
                            <strong>{settings.friendReward}</strong> (реф.) ={" "}
                            <strong>{registrationBonus.points + settings.friendReward}</strong> баллов.
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-orange-700">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-100 border border-orange-200">
                              <AlertCircle size={14} className="text-orange-600" />
                            </span>
                            <span>У вас отключены баллы за регистрацию</span>
                          </span>
                        )}
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Messaging (5/12) */}
          <div className="xl:col-span-5 space-y-6">
            {/* In-App Message */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                  <Smartphone size={18} />
                </div>
                <h3 className="text-base font-bold text-gray-900">Экран «Пригласить друга»</h3>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Текст в приложении</label>
                <textarea
                  rows={4}
                  maxLength={200}
                  value={settings.inviteCtaText}
                  onChange={(e) => setSettings({ ...settings, inviteCtaText: e.target.value })}
                  className="w-full bg-gray-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg p-3 text-sm text-gray-900 resize-none transition-all outline-none"
                  disabled={loading || saving}
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => insertPlaceholder("inviteCtaText", "{businessname}")}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded border border-gray-200"
                    disabled={loading || saving}
                  >
                    Название компании
                  </button>
                  <button
                    type="button"
                    onClick={() => insertPlaceholder("inviteCtaText", "{bonusamount}")}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded border border-gray-200"
                    disabled={loading || saving}
                  >
                    Бонус приглашающему
                  </button>
                  <button
                    type="button"
                    onClick={() => insertPlaceholder("inviteCtaText", "{code}")}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded border border-gray-200"
                    disabled={loading || saving}
                  >
                    Код
                  </button>
                  <button
                    type="button"
                    onClick={() => insertPlaceholder("inviteCtaText", "{link}")}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded border border-gray-200"
                    disabled={loading || saving}
                  >
                    Ссылка
                  </button>
                </div>
              </div>
            </div>

            {/* Sharing Message */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-teal-50 p-2 rounded-lg text-teal-600">
                  <MessageSquare size={18} />
                </div>
                <h3 className="text-base font-bold text-gray-900">Сообщение другу</h3>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Текст для отправки</label>
                <textarea
                  rows={4}
                  maxLength={300}
                  value={settings.shareMessageText}
                  onChange={(e) => setSettings({ ...settings, shareMessageText: e.target.value })}
                  className="w-full bg-gray-50 border-transparent focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 rounded-lg p-3 text-sm text-gray-900 resize-none transition-all outline-none"
                  disabled={loading || saving}
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => insertPlaceholder("shareMessageText", "{businessname}")}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded border border-gray-200"
                    disabled={loading || saving}
                  >
                    Название компании
                  </button>
                  <button
                    type="button"
                    onClick={() => insertPlaceholder("shareMessageText", "{bonusamount}")}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded border border-gray-200"
                    disabled={loading || saving}
                  >
                    Награда другу
                  </button>
                  <button
                    type="button"
                    onClick={() => insertPlaceholder("shareMessageText", "{link}")}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded border border-gray-200"
                    disabled={loading || saving}
                  >
                    Ссылка
                  </button>
                  <button
                    type="button"
                    onClick={() => insertPlaceholder("shareMessageText", "{code}")}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-[10px] font-medium text-gray-600 rounded border border-gray-200"
                    disabled={loading || saving}
                  >
                    Код
                  </button>
                </div>
              </div>

              <div className="mt-4 bg-teal-50 p-3 rounded-lg flex items-start space-x-2 text-xs text-teal-800">
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                <p>
                  Это сообщение будет автоматически подставлено в мессенджер, когда клиент нажмет кнопку «Отправить
                  сообщение».
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
