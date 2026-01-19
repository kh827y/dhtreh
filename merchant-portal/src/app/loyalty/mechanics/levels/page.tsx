"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Edit,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { TierMembersModal } from "../../../../components/TierMembersModal";
import { createPortal } from "react-dom";
import { normalizeErrorMessage } from "lib/portal-errors";

type TierRow = {
  id: string;
  name: string;
  description: string | null;
  thresholdAmount: number;
  minPaymentAmount: number | null;
  earnRatePercent: number;
  redeemRatePercent: number | null;
  isInitial: boolean;
  isHidden: boolean;
  customersCount: number;
};

type LevelFormState = {
  name: string;
  description: string;
  thresholdAmount: string;
  minPaymentAmount: string;
  earnRatePercent: string;
  redeemRatePercent: string;
  isInitial: boolean;
  isHidden: boolean;
};

type NormalizedForm =
  | { error: string; payload?: undefined }
  | {
      error?: undefined;
      payload: {
        name: string;
        description: string | null;
        thresholdAmount: number;
        minPaymentAmount: number | null;
        earnRatePercent: number;
        redeemRatePercent: number | null;
        isInitial: boolean;
        isHidden: boolean;
      };
    };

const EMPTY_FORM: LevelFormState = {
  name: "",
  description: "",
  thresholdAmount: "0",
  minPaymentAmount: "0",
  earnRatePercent: "3",
  redeemRatePercent: "50",
  isInitial: false,
  isHidden: false,
};

function parseDecimal(value: string): number | null {
  if (!value.trim()) return null;
  const num = Number(value.replace(",", "."));
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

function readableError(error: unknown, fallback: string): string {
  return normalizeErrorMessage(error, fallback);
}

function formatCurrency(value: number | null): string {
  if (value == null) return "0 ₽";
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function formatPercent(value: number | null): string {
  if (value == null) return "—";
  if (Number.isInteger(value)) return `${value}%`;
  return `${value.toFixed(1)}%`;
}

function normalizeForm(
  state: LevelFormState,
  existingLevels: TierRow[],
  editingId: string | null,
): NormalizedForm {
  const name = state.name.trim();
  if (!name) return { error: "Укажите название уровня" };
  const normalizedName = name.toLowerCase();
  const duplicate = existingLevels.some(
    (level) =>
      level.id !== editingId &&
      level.name.trim().toLowerCase() === normalizedName,
  );
  if (duplicate) {
    return { error: "Уровень с таким названием уже существует" };
  }

  const earnRatePercent = parseDecimal(state.earnRatePercent);
  if (earnRatePercent == null)
    return { error: "Некорректное значение для % начисления" };

  const redeemRatePercent = parseDecimal(state.redeemRatePercent);
  if (redeemRatePercent != null && redeemRatePercent > 100) {
    return { error: "% списания не может превышать 100" };
  }

  const thresholdAmount = parseDecimal(state.thresholdAmount);
  if (thresholdAmount == null)
    return { error: "Укажите порог входа в уровень" };

  const minPaymentAmount = parseDecimal(state.minPaymentAmount);
  if (minPaymentAmount != null && minPaymentAmount < 0) {
    return { error: "Минимальная сумма не может быть отрицательной" };
  }

  if (state.isHidden && existingLevels.length <= 1) {
    return {
      error: "Нельзя сделать единственный уровень скрытым",
    };
  }

  if (state.isHidden && state.isInitial) {
    return { error: "Стартовый уровень не может быть скрытым" };
  }

  return {
    payload: {
      name,
      description: state.description.trim() || null,
      thresholdAmount,
      minPaymentAmount,
      earnRatePercent,
      redeemRatePercent,
      isInitial: state.isInitial,
      isHidden: state.isHidden,
    },
  };
}

export default function LevelsPage() {
  let router: ReturnType<typeof useRouter> | null = null;
  try {
    router = useRouter();
  } catch {
    router = null;
  }
  const safeRouter =
    router ??
    ({
      push: () => {},
      replace: () => {},
      refresh: () => {},
    } as const);

  const [levels, setLevels] = React.useState<TierRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [periodDays, setPeriodDays] = React.useState(365);
  const [periodInput, setPeriodInput] = React.useState("365");
  const [periodError, setPeriodError] = React.useState<string | null>(null);
  const [periodSaving, setPeriodSaving] = React.useState(false);

  const [formState, setFormState] = React.useState<LevelFormState>(EMPTY_FORM);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const [membersTier, setMembersTier] = React.useState<TierRow | null>(null);

  const inputIds = React.useMemo(
    () => ({
      name: "level-name",
      description: "level-description",
      accrual: "level-accrual",
      redeem: "level-redeem",
      threshold: "level-threshold",
      minPayment: "level-min-payment",
    }),
    [],
  );

  const mapTier = React.useCallback((row: any): TierRow => {
    return {
      id: String(row?.id ?? ""),
      name: String(row?.name ?? ""),
      description: row?.description ?? null,
      thresholdAmount: Number(row?.thresholdAmount ?? 0) || 0,
      minPaymentAmount:
        row?.minPaymentAmount != null ? Number(row.minPaymentAmount) : null,
      earnRatePercent: Number(row?.earnRateBps ?? 0) / 100,
      redeemRatePercent:
        row?.redeemRateBps != null ? Number(row.redeemRateBps) / 100 : null,
      isInitial: Boolean(row?.isInitial),
      isHidden: Boolean(row?.isHidden),
      customersCount: Number(row?.customersCount ?? 0) || 0,
    };
  }, []);

  const loadLevels = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setPeriodError(null);
    try {
      const res = await fetch("/api/portal/loyalty/tiers", { cache: "no-store" });
      if (!res.ok)
        throw new Error(
          (await res.text().catch(() => "")) ||
            `Не удалось загрузить уровни (HTTP ${res.status})`,
        );
      const payload = await res.json();
      const source = Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload)
          ? payload
          : [];
      const mapped = source
        .map(mapTier)
        .sort((a: TierRow, b: TierRow) => a.thresholdAmount - b.thresholdAmount);
      setLevels(mapped);

      try {
        const settingsRes = await fetch("/api/portal/loyalty/levels", {
          cache: "no-store",
        });
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          const nextPeriod = Number(settings?.periodDays);
          if (Number.isFinite(nextPeriod) && nextPeriod > 0) {
            const normalized = Math.floor(nextPeriod);
            setPeriodDays(normalized);
            setPeriodInput(String(normalized));
          }
        }
      } catch {}
    } catch (e) {
      setLevels([]);
      setError(readableError(e, "Не удалось загрузить уровни"));
    } finally {
      setLoading(false);
    }
  }, [mapTier]);

  const savePeriodDays = React.useCallback(async () => {
    if (periodSaving) return;
    const raw = Number(periodInput);
    if (!Number.isFinite(raw) || raw <= 0) {
      setPeriodError("Период расчета уровня должен быть положительным");
      return;
    }
    const nextPeriod = Math.floor(raw);
    setPeriodSaving(true);
    setPeriodError(null);
    try {
      const res = await fetch("/api/portal/loyalty/levels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodDays: nextPeriod }),
      });
      if (!res.ok)
        throw new Error(
          (await res.text().catch(() => "")) || "Не удалось сохранить период",
        );
      const payload = await res.json().catch(() => null);
      const applied = Number(payload?.periodDays);
      const normalized = Number.isFinite(applied) && applied > 0 ? Math.floor(applied) : nextPeriod;
      setPeriodDays(normalized);
      setPeriodInput(String(normalized));
    } catch (e) {
      setPeriodError(readableError(e, "Не удалось сохранить период"));
    } finally {
      setPeriodSaving(false);
    }
  }, [periodInput, periodSaving]);

  React.useEffect(() => {
    void loadLevels();
  }, [loadLevels]);

  const startCreate = React.useCallback(() => {
    setEditingId(null);
    setFormState(EMPTY_FORM);
    setFormError(null);
    setIsModalOpen(true);
  }, []);

  const startEdit = React.useCallback((level: TierRow) => {
    setEditingId(level.id);
    setFormState({
      name: level.name,
      description: level.description ?? "",
      thresholdAmount: String(level.thresholdAmount),
      minPaymentAmount:
        level.minPaymentAmount != null ? String(level.minPaymentAmount) : "",
      earnRatePercent:
        Number.isInteger(level.earnRatePercent) && level.earnRatePercent % 1 === 0
          ? String(level.earnRatePercent)
          : level.earnRatePercent.toFixed(1).replace(/\.0$/, ""),
      redeemRatePercent:
        level.redeemRatePercent != null
          ? level.redeemRatePercent.toFixed(1).replace(/\.0$/, "")
          : "",
      isInitial: level.isInitial,
      isHidden: level.isHidden,
    });
    setFormError(null);
    setIsModalOpen(true);
  }, []);

  const handleSave = React.useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (saving) return;

      const validation = normalizeForm(formState, levels, editingId);
      if (validation.error) {
        setFormError(validation.error);
        return;
      }
      const payload = validation.payload;
      if (!payload) return;
      const editingLevel = editingId
        ? levels.find((lvl) => lvl.id === editingId)
        : null;
      if (editingLevel?.isInitial && !payload.isInitial) {
        const anotherInitial = levels.some(
          (lvl) => lvl.isInitial && lvl.id !== editingId,
        );
        if (!anotherInitial) {
          setFormError(
            "Назначьте другой уровень стартовым прежде чем снимать этот статус.",
          );
          return;
        }
      }
      setSaving(true);
      setFormError(null);

      try {
        const endpoint = editingId
          ? `/api/portal/loyalty/tiers/${encodeURIComponent(editingId)}`
          : "/api/portal/loyalty/tiers";
        const method = editingId ? "PUT" : "POST";
        const res = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok)
          throw new Error(
            (await res.text().catch(() => "")) || "Не удалось сохранить уровень",
          );
        const saved = mapTier(await res.json());
        setLevels((prev) => {
          const without = prev.filter((lvl) => lvl.id !== saved.id);
          const withSaved = [...without, saved];
          const normalized = saved.isInitial
            ? withSaved.map((lvl) =>
                lvl.id === saved.id ? saved : { ...lvl, isInitial: false },
              )
            : withSaved;
          return normalized.sort(
            (a, b) => a.thresholdAmount - b.thresholdAmount,
          );
        });
        setIsModalOpen(false);
      } catch (e) {
        setFormError(readableError(e, "Не удалось сохранить уровень"));
      } finally {
        setSaving(false);
      }
    },
    [editingId, formState, levels, mapTier, saving],
  );

  const handleDelete = React.useCallback(
    async (level: TierRow) => {
      if (deletingId || saving) return;
      if (levels.length <= 1) {
        setError("Нельзя удалить единственный уровень");
        return;
      }
      if (level.customersCount > 0) {
        setError(
          `Нельзя удалить уровень, пока в нём ${level.customersCount.toLocaleString(
            "ru-RU",
          )} клиент(ов)`,
        );
        return;
      }
      if (level.isInitial) {
        setError("Нельзя удалить стартовый уровень. Назначьте другой стартовым.");
        return;
      }
      if (!window.confirm(`Удалить уровень «${level.name}»?`)) return;

      setDeletingId(level.id);
      setError(null);
      try {
        const res = await fetch(
          `/api/portal/loyalty/tiers/${encodeURIComponent(level.id)}`,
          { method: "DELETE" },
        );
        if (!res.ok)
          throw new Error(
            (await res.text().catch(() => "")) || "Не удалось удалить уровень",
          );
        setLevels((prev) =>
          prev
            .filter((lvl) => lvl.id !== level.id)
            .sort((a, b) => a.thresholdAmount - b.thresholdAmount),
        );
      } catch (e) {
        setError(readableError(e, "Не удалось удалить уровень"));
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, levels.length, saving],
  );

  const rows = levels;
  const showEmpty = !loading && !rows.length;

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-6 ">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            type="button"
            onClick={() => safeRouter.push("/loyalty/mechanics")}
            className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
            aria-label="Назад к механикам"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Уровни клиентов</h2>
            <p className="text-sm text-gray-500">Настройка статусов и привилегий.</p>
            <p className="text-sm text-gray-500">
              Уровень считается по покупкам за последние {periodDays} дней.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-600">
              <span>Период расчёта уровня:</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  className="w-24 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-200"
                  value={periodInput}
                  onChange={(event) => setPeriodInput(event.target.value)}
                  disabled={loading || periodSaving}
                />
                <span>дней</span>
                <button
                  type="button"
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  onClick={() => void savePeriodDays()}
                  disabled={loading || periodSaving}
                >
                  {periodSaving ? "Сохраняю..." : "Сохранить"}
                </button>
              </div>
            </div>
            {periodError ? (
              <p className="mt-2 text-xs text-red-600">{periodError}</p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors shadow-sm disabled:opacity-60"
          disabled={loading}
        >
          <Plus size={18} />
          <span>Добавить уровень</span>
        </button>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm flex items-start space-x-3">
          <div className="font-semibold">Ошибка</div>
          <div className="flex-1 whitespace-pre-wrap break-words">{error}</div>
          <button
            type="button"
            className="text-red-700 underline underline-offset-2"
            onClick={() => {
              setError(null);
              void loadLevels();
            }}
          >
            Повторить
          </button>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-semibold">Название</th>
                <th className="px-6 py-4 font-semibold text-right">Порог входа</th>
                <th className="px-6 py-4 font-semibold text-center">Начисление</th>
                <th className="px-6 py-4 font-semibold text-center">Списание</th>
                <th className="px-6 py-4 font-semibold text-center">Свойства</th>
                <th className="px-6 py-4 font-semibold text-right">Участников</th>
                <th className="px-6 py-4 font-semibold text-right w-32">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="h-4 bg-gray-100 rounded w-32 mb-2" />
                      <div className="h-3 bg-gray-100 rounded w-48" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="h-4 bg-gray-100 rounded w-16 ml-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="h-5 bg-gray-100 rounded w-16 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="h-5 bg-gray-100 rounded w-16 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="h-4 bg-gray-100 rounded w-20 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="h-4 bg-gray-100 rounded w-12 ml-auto" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="h-4 bg-gray-100 rounded w-16 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : showEmpty ? (
                <tr>
                  <td className="px-6 py-6 text-gray-500" colSpan={7}>
                    Уровней пока нет
                  </td>
                </tr>
              ) : (
                rows.map((lvl) => {
                  const deleteDisabled =
                    deletingId === lvl.id ||
                    lvl.customersCount > 0 ||
                    levels.length <= 1 ||
                    lvl.isInitial;
                  const deleteTitle =
                    levels.length <= 1
                      ? "Нельзя удалить единственный уровень"
                      : lvl.isInitial
                        ? "Нельзя удалить стартовый уровень"
                        : lvl.customersCount > 0
                          ? "Нельзя удалить уровень с клиентами"
                          : undefined;
                  return (
                    <tr key={lvl.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 text-base truncate max-w-xs">
                          {lvl.name}
                        </div>
                        <div className="text-xs text-gray-500 truncate max-w-xs">
                          {lvl.description || "Описание не задано"}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-medium">
                          {formatCurrency(lvl.thresholdAmount)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded font-bold text-xs">
                          {formatPercent(lvl.earnRatePercent)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="bg-red-50 text-red-700 px-2 py-1 rounded font-bold text-xs">
                          {formatPercent(lvl.redeemRatePercent)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          {lvl.isInitial ? (
                            <span
                              className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100 font-medium"
                              title="Стартовая группа"
                            >
                              Старт
                            </span>
                          ) : null}
                          {lvl.isHidden ? (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-200 flex items-center">
                              <EyeOff size={10} className="mr-1" /> Скрыт
                            </span>
                          ) : (
                            !lvl.isInitial && (
                              <span className="text-xs text-gray-400">—</span>
                            )
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setMembersTier(lvl)}
                          className="text-gray-600 hover:text-purple-600 font-medium flex items-center justify-end w-full group/btn"
                        >
                          <Users
                            size={14}
                            className="mr-1.5 text-gray-400 group-hover/btn:text-purple-600"
                          />
                          {lvl.customersCount.toLocaleString("ru-RU")}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => startEdit(lvl)}
                            className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title="Редактировать"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(lvl)}
                            disabled={deleteDisabled}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                            title={deleteTitle}
                          >
                            {deletingId === lvl.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen
        ? createPortal(
            <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl sticky top-0 z-10">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">
                      {editingId ? "Редактирование уровня" : "Новый уровень"}
                    </h3>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
                    aria-label="Закрыть"
                  >
                    <X size={24} />
                  </button>
                </div>

                <form className="p-6 space-y-6" onSubmit={handleSave}>
                  {formError ? (
                    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                      {formError}
                    </div>
                  ) : null}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[#374151] mb-1" htmlFor={inputIds.name}>
                        Название уровня <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id={inputIds.name}
                        value={formState.name}
                        onChange={(e) =>
                          setFormState((prev) => ({ ...prev, name: e.target.value }))
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        placeholder="Например: Platinum"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#374151] mb-1" htmlFor={inputIds.description}>
                        Описание
                      </label>
                      <textarea
                        rows={2}
                        id={inputIds.description}
                        value={formState.description}
                        onChange={(e) =>
                          setFormState((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }))
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none"
                        placeholder="Условия получения и привилегии"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-1" htmlFor={inputIds.accrual}>
                        % Начисления
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          id={inputIds.accrual}
                          value={formState.earnRatePercent}
                          onChange={(e) =>
                            setFormState((prev) => ({
                              ...prev,
                              earnRatePercent: e.target.value,
                            }))
                          }
                          className="w-full bg-white border border-gray-300 rounded-lg pl-3 pr-8 py-2 font-bold text-green-700 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                          %
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Кэшбэк баллами</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-1" htmlFor={inputIds.redeem}>
                        % Списания
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          id={inputIds.redeem}
                          value={formState.redeemRatePercent}
                          onChange={(e) =>
                            setFormState((prev) => ({
                              ...prev,
                              redeemRatePercent: e.target.value,
                            }))
                          }
                          className="w-full bg-white border border-gray-300 rounded-lg pl-3 pr-8 py-2 font-bold text-red-700 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                          %
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">От суммы чека</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={inputIds.threshold}>
                        Порог перехода
                      </label>
                      <input
                        type="number"
                        min="0"
                        id={inputIds.threshold}
                        value={formState.thresholdAmount}
                        onChange={(e) =>
                          setFormState((prev) => ({
                            ...prev,
                            thresholdAmount: e.target.value,
                          }))
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Сумма покупок для получения уровня
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={inputIds.minPayment}>
                        Мин. сумма чека
                      </label>
                      <input
                        type="number"
                        min="0"
                        id={inputIds.minPayment}
                        value={formState.minPaymentAmount}
                        onChange={(e) =>
                          setFormState((prev) => ({
                            ...prev,
                            minPaymentAmount: e.target.value,
                          }))
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Для начисления/списания баллов
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2 border-t border-gray-100">
                    <label className="flex items-start space-x-3 cursor-pointer p-3 hover:bg-gray-50 rounded-lg transition-colors">
                      <div className="flex items-center h-5">
                        <input
                          type="checkbox"
                          checked={formState.isInitial}
                          onChange={(e) =>
                            setFormState((prev) => ({
                              ...prev,
                              isInitial: e.target.checked,
                              isHidden: e.target.checked ? false : prev.isHidden,
                            }))
                          }
                          className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <span className="font-medium text-gray-900 text-sm">
                          Стартовая группа
                        </span>
                        <p className="text-xs text-gray-500">
                          Автоматически присваивается при регистрации. Может быть только одна.
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex items-start space-x-3 cursor-pointer p-3 hover:bg-gray-50 rounded-lg transition-colors ${
                        formState.isInitial ? "opacity-50 pointer-events-none" : ""
                      }`}
                    >
                      <div className="flex items-center h-5">
                        <input
                          type="checkbox"
                          checked={formState.isHidden}
                          onChange={(e) =>
                            setFormState((prev) => ({
                              ...prev,
                              isHidden: e.target.checked,
                            }))
                          }
                          disabled={formState.isInitial}
                          className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <span className="font-medium text-gray-900 text-sm flex items-center">
                          <EyeOff size={14} className="mr-1.5" /> Скрытая группа
                        </span>
                        <p className="text-xs text-gray-500">
                          Видна только участникам. Не отображается в прогрессе. Переход вручную или по
                          промокоду.
                        </p>
                      </div>
                    </label>
                  </div>

                  <div className="-mx-6 -mb-6 p-4 bg-gray-50 rounded-b-xl flex justify-end space-x-3 border-t border-gray-100 sticky bottom-0 z-10">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium disabled:opacity-60 flex items-center space-x-2 cursor-pointer"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                      <span>{saving ? "Сохраняем…" : "Сохранить"}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {membersTier
        ? createPortal(
            <TierMembersModal
              tier={
                membersTier
                  ? {
                      id: membersTier.id,
                      name: membersTier.name,
                      customersCount: membersTier.customersCount,
                    }
                  : null
              }
              open={Boolean(membersTier)}
              onClose={() => setMembersTier(null)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
