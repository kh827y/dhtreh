"use client";

import React from "react";
import Link from "next/link";
import {
  Trophy,
  Ban,
  Store,
  Users,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

// Типы для статуса настройки
type SetupStatus = {
  hasLoyaltySettings: boolean;
  hasOutlets: boolean;
  hasStaff: boolean;
  hasMechanics: boolean;
  outletsCount?: number;
  staffCount?: number;
};

// MasterSettings 1:1 как в new design/components/MasterSettings.tsx
export default function Page() {
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<SetupStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loadStatus = async () => {
      try {
        const res = await fetch("/api/portal/setup-status", { cache: "no-store" });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setError(text || `Не удалось загрузить статус настройки (HTTP ${res.status})`);
          setStatus(null);
          return;
        }
        const data = await res.json();
        setStatus(data);
        setError(null);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg || "Не удалось загрузить статус настройки");
        setStatus(null);
      } finally {
        setLoading(false);
      }
    };
    loadStatus();
  }, []);

  // Расчёт прогресса
  const totalSteps = 4;
  const completedSteps = status
    ? [status.hasLoyaltySettings, status.hasOutlets, status.hasStaff, status.hasMechanics].filter(Boolean).length
    : 0;
  const progress = (completedSteps / totalSteps) * 100;

  // Ошибка загрузки
  if (!loading && error) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto animate-fade-in">
        <div className="bg-white p-6 rounded-xl border border-red-200 shadow-sm">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-lg">
              <AlertTriangle size={24} />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 text-lg">Ошибка загрузки</h3>
              <p className="text-sm text-gray-500 mt-1 whitespace-pre-wrap break-words">{error}</p>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => location.reload()}
              className="flex items-center justify-center space-x-2 bg-gray-900 hover:bg-gray-800 text-white py-2.5 px-4 rounded-lg font-medium transition-colors"
            >
              <RefreshCw size={16} />
              <span>Обновить страницу</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Скелетон загрузки
  if (loading) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto space-y-8 animate-fade-in">
        <div>
          <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-96 bg-gray-100 rounded mt-2 animate-pulse" />
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="h-4 w-40 bg-gray-200 rounded animate-pulse mb-3" />
          <div className="h-3 w-full bg-gray-100 rounded-full animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm animate-pulse">
              <div className="flex items-start space-x-3 mb-4">
                <div className="w-12 h-12 bg-gray-200 rounded-lg" />
                <div className="flex-1">
                  <div className="h-5 w-32 bg-gray-200 rounded" />
                  <div className="h-3 w-48 bg-gray-100 rounded mt-2" />
                </div>
              </div>
              <div className="h-10 w-full bg-gray-100 rounded-lg mt-4" />
              <div className="h-10 w-full bg-gray-200 rounded-lg mt-4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Основные настройки</h2>
        <p className="text-gray-500 mt-1">
          Первичная конфигурация системы лояльности. Выполните эти шаги для запуска.
        </p>
      </div>

      {/* Progress Bar */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-bold text-gray-900">Прогресс настройки</span>
          <span className="text-sm font-medium text-purple-600">{progress.toFixed(0)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className="bg-purple-600 h-3 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Выполнено {completedSteps} из {totalSteps} шагов для базового запуска.
        </p>
      </div>

      {/* Cards Grid */}
      <div className="master-grid">
        {/* Step 1: Levels */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-yellow-50 text-yellow-600 rounded-lg">
                <Trophy size={24} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Уровни клиентов</h3>
                <p className="text-sm text-gray-500 leading-snug mt-1">
                  Создание статусов клиентов для разделения правил начисления и списания бонусов.
                </p>
              </div>
            </div>
            {status?.hasLoyaltySettings ? (
              <CheckCircle2 className="text-green-500 flex-shrink-0" size={24} />
            ) : (
              <AlertCircle className="text-amber-500 flex-shrink-0" size={24} />
            )}
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between text-sm p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Текущая конфигурация:</span>
              <span className="font-medium text-gray-900">
                {status?.hasLoyaltySettings ? "Настроено" : "Не настроено"}
              </span>
            </div>
          </div>

          <Link
            href="/loyalty/mechanics/levels"
            className="w-full flex items-center justify-center space-x-2 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 hover:border-purple-200 hover:text-purple-700 transition-colors"
          >
            <span>Настроить уровни</span>
            <ChevronRight size={16} />
          </Link>
        </div>

        {/* Step 2: Bonus Settings */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-red-50 text-red-600 rounded-lg">
                <Ban size={24} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Настройки бонусов</h3>
                <p className="text-sm text-gray-500 leading-snug mt-1">
                  Настройка времени жизни бонусов, отложенных начислений и правил начисления при списании.
                </p>
              </div>
            </div>
            {status?.hasMechanics ? (
              <CheckCircle2 className="text-green-500 flex-shrink-0" size={24} />
            ) : (
              <AlertCircle className="text-amber-500 flex-shrink-0" size={24} />
            )}
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between text-sm p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Срок жизни баллов:</span>
              <span className="font-medium text-gray-900">Не ограничен</span>
            </div>
          </div>

          <Link
            href="/loyalty/mechanics/redeem-limits"
            className="w-full flex items-center justify-center space-x-2 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 hover:border-purple-200 hover:text-purple-700 transition-colors"
          >
            <span>Настроить бонусы</span>
            <ChevronRight size={16} />
          </Link>
        </div>

        {/* Step 3: Outlets */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                <Store size={24} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Торговые точки</h3>
                <p className="text-sm text-gray-500 leading-snug mt-1">
                  Добавление филиалов и кассовых устройств.
                </p>
              </div>
            </div>
            {status?.hasOutlets ? (
              <CheckCircle2 className="text-green-500 flex-shrink-0" size={24} />
            ) : (
              <AlertCircle className="text-amber-500 flex-shrink-0" size={24} />
            )}
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between text-sm p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Активных точек:</span>
              <span className="font-medium text-gray-900">{status?.outletsCount ?? 0}</span>
            </div>
          </div>

          <Link
            href="/settings/outlets"
            className="w-full flex items-center justify-center space-x-2 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 hover:border-purple-200 hover:text-purple-700 transition-colors"
          >
            <span>Управление точками</span>
            <ChevronRight size={16} />
          </Link>
        </div>

        {/* Step 4: Staff */}
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <Users size={24} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Сотрудники</h3>
                <p className="text-sm text-gray-500 leading-snug mt-1">
                  Персонал и доступ к панели кассира.
                </p>
              </div>
            </div>
            {status?.hasStaff ? (
              <CheckCircle2 className="text-green-500 flex-shrink-0" size={24} />
            ) : (
              <AlertCircle className="text-amber-500 flex-shrink-0" size={24} />
            )}
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between text-sm p-3 bg-gray-50 rounded-lg">
              <span className="text-gray-600">Всего сотрудников:</span>
              <span className="font-medium text-gray-900">{status?.staffCount ?? 0}</span>
            </div>
          </div>

          <Link
            href="/settings/staff"
            className="w-full flex items-center justify-center space-x-2 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 hover:border-purple-200 hover:text-purple-700 transition-colors"
          >
            <span>Управление персоналом</span>
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
