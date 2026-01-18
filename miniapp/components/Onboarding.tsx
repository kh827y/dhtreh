"use client";

import React, { useEffect, useRef, useState } from "react";
import { Phone, Check, User as UserIcon, Calendar, Gift, AlertCircle } from "lucide-react";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");

function resolveLogoUrl(value: string | null | undefined) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (!API_BASE) return value;
  return value.startsWith("/") ? `${API_BASE}${value}` : `${API_BASE}/${value}`;
}

export type OnboardingForm = {
  name: string;
  gender: "male" | "female" | "";
  birthDate: string;
  inviteCode: string;
};

interface OnboardingProps {
  form: OnboardingForm;
  consent: boolean;
  logoUrl?: string | null;
  onToggleConsent: () => void;
  onFieldChange: (field: keyof OnboardingForm, value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error?: string | null;
}

const Onboarding: React.FC<OnboardingProps> = ({
  form,
  consent,
  logoUrl,
  onToggleConsent,
  onFieldChange,
  onSubmit,
  loading,
  error,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const resolvedLogoUrl = resolveLogoUrl(logoUrl);
  const [birthInput, setBirthInput] = useState(() => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(form.birthDate);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : form.birthDate;
  });

  useEffect(() => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(form.birthDate);
    if (match) {
      setBirthInput(`${match[3]}.${match[2]}.${match[1]}`);
      return;
    }
    if (!form.birthDate && birthInput) return;
    setBirthInput(form.birthDate);
  }, [form.birthDate, birthInput]);

  const inputTextClass = "text-lg";

  const handleBirthInput = (value: string) => {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (isoMatch) {
      const formatted = `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
      setBirthInput(formatted);
      onFieldChange("birthDate", `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`);
      return;
    }
    const digits = value.replace(/\D+/g, "").slice(0, 8);
    let formatted = digits;
    if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}.${digits.slice(2)}`;
    }
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
    }
    setBirthInput(formatted);
    if (digits.length === 8) {
      const day = digits.slice(0, 2);
      const month = digits.slice(2, 4);
      const year = digits.slice(4, 8);
      onFieldChange("birthDate", `${year}-${month}-${day}`);
    } else {
      onFieldChange("birthDate", "");
    }
  };

  const scrollToField = (element: HTMLElement | null) => {
    if (!element) return;
    const run = () => {
      const container = scrollRef.current;
      if (!container) {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const offsetTop = elementRect.top - containerRect.top;
      const target = Math.max(0, container.scrollTop + offsetTop - container.clientHeight * 0.35);
      if (typeof container.scrollTo === "function") {
        container.scrollTo({ top: target, behavior: "smooth" });
      } else {
        container.scrollTop = target;
      }
    };
    requestAnimationFrame(run);
    setTimeout(run, 120);
  };

  return (
    <div className="tg-viewport bg-ios-bg flex flex-col relative pb-safe overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pt-12 pb-40">
        <div className="mb-8 text-center animate-in slide-in-from-bottom-4 fade-in duration-500">
          <div
            className={`w-20 h-20 rounded-3xl mx-auto flex items-center justify-center mb-6 ${
              resolvedLogoUrl ? "" : "bg-blue-600 shadow-blue-200 shadow-xl rotate-3"
            }`}
          >
            {resolvedLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolvedLogoUrl}
                alt="logo"
                className="w-full h-full object-contain"
              />
            ) : (
              <Gift className="text-white w-10 h-10" />
            )}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Добро пожаловать</h1>
          <p className="text-gray-500 leading-relaxed">Заполните анкету, чтобы продолжить.</p>
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            className="mt-2 inline-flex items-center justify-center rounded-full border border-gray-200 bg-white/80 px-3 py-1 text-[11px] font-semibold text-gray-600 shadow-sm hover:bg-white transition-colors"
          >
            Зачем нам нужны эти данные? 👉
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 rounded-2xl flex items-center space-x-3 text-red-600 animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={20} />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        <div className="bg-white rounded-3xl p-1 shadow-card space-y-1 animate-in slide-in-from-bottom-8 fade-in duration-500 delay-100">
          <div className="relative px-4 py-3 border-b border-gray-100">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Имя</label>
            <div className="flex items-center space-x-3">
              <UserIcon size={20} className="text-gray-300" />
              <input
                type="text"
                value={form.name}
                onFocus={(e) => scrollToField(e.currentTarget)}
                onChange={(e) => onFieldChange("name", e.target.value)}
                placeholder="Как к вам обращаться?"
                className={`w-full font-medium text-gray-900 placeholder-gray-300 outline-none ${inputTextClass}`}
              />
            </div>
          </div>

          <div className="relative px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Пол</label>
            <div className="bg-gray-100 p-1 rounded-lg flex space-x-1">
              <button
                type="button"
                onClick={() => onFieldChange("gender", "male")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  form.gender === "male" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Мужской
              </button>
              <button
                type="button"
                onClick={() => onFieldChange("gender", "female")}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  form.gender === "female" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Женский
              </button>
            </div>
          </div>

          <div className="relative px-4 py-3 border-b border-gray-100">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Дата рождения</label>
            <div className="flex items-center space-x-3">
              <Calendar size={20} className="text-gray-300" />
              <input
                type="tel"
                inputMode="numeric"
                value={birthInput}
                onFocus={(e) => scrollToField(e.currentTarget)}
                onChange={(e) => handleBirthInput(e.target.value)}
                placeholder="ДД.ММ.ГГГГ"
                className={`w-full font-medium text-gray-900 bg-transparent outline-none ${inputTextClass}`}
              />
            </div>
          </div>

          <div className="relative px-4 py-3">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">
              Код приглашения (если есть)
            </label>
            <div className="flex items-center space-x-3">
              <Gift size={20} className="text-gray-300" />
              <input
                type="text"
                value={form.inviteCode}
                onFocus={(e) => scrollToField(e.currentTarget)}
                onChange={(e) => onFieldChange("inviteCode", e.target.value)}
                placeholder="REF-12345"
                className={`w-full font-medium text-gray-900 placeholder-gray-300 outline-none uppercase ${inputTextClass}`}
              />
            </div>
          </div>
        </div>
      </div>

      {showInfo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
            onClick={() => setShowInfo(false)}
          />
          <div className="relative z-10 w-[270px] bg-white/90 backdrop-blur-xl rounded-[14px] shadow-lg animate-in zoom-in-95 duration-200 overflow-hidden text-center">
            <div className="p-4 pt-5">
              <h3 className="text-[17px] font-semibold text-gray-900 mb-2">Зачем нам эти данные?</h3>
              <p className="text-[13px] text-gray-800 leading-snug font-medium">
                Мы собираем эти данные, чтобы подбирать акции и создавать бонусы лично для вас. Привязка телефона
                необходима для защиты от злоупотребления программой лояльности.
              </p>
            </div>
            <div className="border-t border-gray-300/60 backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                className="w-full py-3 text-[17px] text-[#007AFF] font-normal hover:bg-black/5 active:bg-black/10 transition-colors"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="fixed bottom-0 left-0 right-0 p-4 bg-ios-bg/80 backdrop-blur-xl border-t border-gray-200 z-20"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <div
          className="flex items-center justify-center space-x-2.5 mb-4 px-2 cursor-pointer active:opacity-70 transition-opacity"
          onClick={onToggleConsent}
        >
          <div
            className={`w-5 h-5 flex-shrink-0 rounded-[6px] border-[1.5px] flex items-center justify-center transition-all duration-200 ${
              consent ? "bg-blue-600 border-blue-600" : "bg-transparent border-gray-400/60"
            }`}
          >
            <Check
              size={14}
              className={`text-white transition-transform duration-200 ${consent ? "scale-100" : "scale-0"}`}
              strokeWidth={3}
            />
          </div>
          <p className="text-[11px] text-gray-500 leading-none whitespace-nowrap">
            Даю согласие на{" "}
            <a
              href="#"
              className="text-blue-600 font-medium hover:text-blue-700 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              обработку персональных данных
            </a>
          </p>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={loading || !consent}
          className={`w-full h-[56px] rounded-2xl font-bold text-[17px] active:scale-[0.98] transition-all flex items-center justify-center space-x-2 shadow-lg disabled:opacity-70 disabled:scale-100 ${
            consent ? "bg-[#0088cc] text-white shadow-blue-200" : "bg-gray-300 text-gray-500 shadow-none"
          }`}
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Привязка номера...</span>
            </>
          ) : (
            <>
              <Phone size={20} className={consent ? "fill-white/20" : "opacity-50"} />
              <span>Привязать телефон</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default Onboarding;
