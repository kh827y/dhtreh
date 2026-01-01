"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Gift } from "lucide-react";
import { getFullName, type CustomerRecord } from "./data";
import { readApiError } from "lib/portal-errors";

type ComplimentaryModalProps = {
  customer: CustomerRecord;
  onClose: () => void;
  onSuccess: (message: string) => void;
};

type FormErrors = {
  points?: string;
  expiresIn?: string;
  comment?: string;
};

function formatPoints(value?: number | null): string {
  if (value == null || Number.isNaN(Number(value))) return "0";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value));
}

export const ComplimentaryModal: React.FC<ComplimentaryModalProps> = ({ customer, onClose, onSuccess }) => {
  const [form, setForm] = React.useState({ points: "", expiresIn: "0", comment: "" });
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("modal-blur-active");
    return () => document.body.classList.remove("modal-blur-active");
  }, []);

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    const pointsValue = Number(form.points);
    if (!form.points.trim()) {
      nextErrors.points = "Укажите количество баллов";
    } else if (Number.isNaN(pointsValue) || pointsValue <= 0) {
      nextErrors.points = "Баллы должны быть больше 0";
    }

    const expiresValue = Number(form.expiresIn);
    if (form.expiresIn === "") {
      nextErrors.expiresIn = "Укажите срок";
    } else if (Number.isNaN(expiresValue) || expiresValue < 0) {
      nextErrors.expiresIn = "Срок не может быть отрицательным";
    }

    if (form.comment.trim().length > 60) {
      nextErrors.comment = "Комментарий не должен превышать 60 символов";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError(null);
    if (!validate()) return;

    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        points: Number(form.points),
        expiresInDays: Number(form.expiresIn),
        comment: form.comment.trim() || undefined,
      };

      const res = await fetch(
        `/api/customers/${encodeURIComponent(customer.id)}/transactions/complimentary`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const text = await res.text();
      if (!res.ok) {
        throw new Error(readApiError(text) || text || res.statusText);
      }
      let data: any = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }
      }
      const pointsIssued = data?.pointsIssued ?? Number(form.points);
      const message =
        pointsIssued && Number.isFinite(pointsIssued)
          ? `Начислено ${formatPoints(pointsIssued)} баллов`
          : "Баллы начислены";
      onSuccess(message);
    } catch (error: any) {
      setApiError(readApiError(error?.message || error) || "Не удалось начислить баллы");
    } finally {
      setSubmitting(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md relative z-[101]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100 bg-gray-50 rounded-t-xl flex items-center space-x-2">
          <Gift className="text-pink-600" size={20} />
          <h3 className="text-lg font-bold text-gray-900">Подарить баллы</h3>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-sm text-gray-600 mb-2">
            Клиент: <span className="font-semibold text-gray-900">{getFullName(customer) || customer.phone || customer.login}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Сумма баллов</label>
            <input
              type="number"
              value={form.points}
              onChange={(e) => update("points", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-bold text-center text-pink-600 focus:ring-2 focus:ring-pink-500 focus:outline-none"
            />
            {errors.points && <span className="text-xs text-red-600 mt-1 block">{errors.points}</span>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Срок жизни (дней)</label>
            <div className="relative">
              <input
                type="number"
                value={form.expiresIn}
                onChange={(e) => update("expiresIn", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 focus:outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">0 = вечно</span>
            </div>
            {errors.expiresIn && <span className="text-xs text-red-600 mt-1 block">{errors.expiresIn}</span>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий (виден клиенту)</label>
            <input
              type="text"
              placeholder="Подарок на день рождения!"
              value={form.comment}
              onChange={(e) => update("comment", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-500 focus:outline-none"
            />
            {errors.comment && <span className="text-xs text-red-600 mt-1 block">{errors.comment}</span>}
          </div>

          {apiError && <div className="text-sm text-red-600">{apiError}</div>}
        </div>

        <div className="p-4 bg-gray-50 rounded-b-xl flex justify-end space-x-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm"
            disabled={submitting}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 text-sm font-medium disabled:opacity-70 disabled:cursor-not-allowed"
            disabled={submitting}
          >
            {submitting ? "Отправляем…" : "Подарить"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

export default ComplimentaryModal;
