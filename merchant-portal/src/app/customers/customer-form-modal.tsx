"use client";

import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Gender } from "./data";
import { useActionGuard } from "lib/async-guards";

export type CustomerFormPayload = {
  login: string;
  email: string;
  firstName: string;
  tags: string;
  birthday: string;
  levelId: string | null;
  levelExpireDays: string;
  gender: Gender;
  comment: string;
};

type CustomerFormModalProps = {
  open: boolean;
  mode: "create" | "edit";
  initialValues?: Partial<CustomerFormPayload>;
  loginToIgnore?: string;
  levels: Array<{ id: string; name: string; isInitial?: boolean }>;
  onClose: () => void;
  onSubmit: (values: CustomerFormPayload) => Promise<void> | void;
  existingLogins: string[];
};

type FormErrors = Partial<Record<keyof CustomerFormPayload, string>>;

const defaultValues: CustomerFormPayload = {
  login: "",
  email: "",
  firstName: "",
  tags: "",
  birthday: "",
  levelId: null,
  levelExpireDays: "",
  gender: "unknown",
  comment: "",
};

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  open,
  mode,
  initialValues,
  loginToIgnore,
  levels,
  onClose,
  onSubmit,
  existingLogins,
}) => {
  const [form, setForm] = React.useState<CustomerFormPayload>({ ...defaultValues, ...(initialValues ?? {}) });
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const runSubmit = useActionGuard();

  React.useEffect(() => {
    if (open) {
      const preferredLevel =
        initialValues?.levelId ??
        levels.find((lvl) => lvl.isInitial)?.id ??
        levels[0]?.id ??
        null;
      setForm({ ...defaultValues, ...(initialValues ?? {}), levelId: preferredLevel ?? null });
      setErrors({});
      setSubmitError(null);
    }
  }, [open, initialValues, levels]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    if (open) {
      body.classList.add("modal-blur-active");
    } else {
      body.classList.remove("modal-blur-active");
    }
    return () => body.classList.remove("modal-blur-active");
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  function update<K extends keyof CustomerFormPayload>(key: K, value: CustomerFormPayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    const digits = form.login.replace(/\D+/g, "");

    if (!form.login.trim()) {
      nextErrors.login = "Укажите телефон клиента";
    } else if (digits.length < 11) {
      nextErrors.login = "Минимум 11 цифр";
    } else if (
      mode === "edit" &&
      existingLogins.some((login) => login === form.login && login !== loginToIgnore)
    ) {
      nextErrors.login = "Телефон уже используется";
    }

    if (form.email.trim() && !/^[\w-.]+@[\w-]+\.[A-Za-z]{2,}$/.test(form.email.trim())) {
      nextErrors.email = "Некорректный email";
    }

    if (form.birthday) {
      const date = new Date(form.birthday);
      if (Number.isNaN(date.getTime())) {
        nextErrors.birthday = "Некорректная дата";
      }
    }

    if (form.levelExpireDays.trim()) {
      const raw = Number(form.levelExpireDays);
      if (!Number.isFinite(raw) || raw < 0) {
        nextErrors.levelExpireDays = "Срок уровня должен быть 0 или больше";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;

    await runSubmit(async () => {
      try {
        setSubmitting(true);
        setSubmitError(null);
        await onSubmit(form);
        onClose();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error ?? "Произошла ошибка");
        setSubmitError(message);
      } finally {
        setSubmitting(false);
      }
    });
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-[150] flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative z-[101]"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
          <h3 className="text-xl font-bold text-gray-900">
            {mode === "create" ? "Новый клиент" : "Редактирование клиента"}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Телефон <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="+7"
                value={form.login}
                onChange={(e) => update("login", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {errors.login && <span className="text-xs text-red-600 mt-1 block">{errors.login}</span>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {errors.email && <span className="text-xs text-red-600 mt-1 block">{errors.email}</span>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ФИО клиента</label>
            <input
              type="text"
              value={form.firstName}
              onChange={(e) => update("firstName", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">День рождения</label>
              <input
                type="date"
                value={form.birthday}
                onChange={(e) => update("birthday", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {errors.birthday && <span className="text-xs text-red-600 mt-1 block">{errors.birthday}</span>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Пол</label>
              <select
                value={form.gender}
                onChange={(e) => update("gender", e.target.value as Gender)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="unknown">Не указан</option>
                <option value="male">Мужской</option>
                <option value="female">Женский</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Уровень</label>
            <select
              value={form.levelId ?? ""}
              onChange={(e) => update("levelId", e.target.value || null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              disabled={!levels.length}
            >
              {levels.length === 0 && <option value="">Нет доступных уровней</option>}
              {levels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
            </select>
            {mode === "edit" && (
              <p className="text-xs text-gray-500 mt-1">
                Ручной уровень не пересчитывается покупками. Его можно заменить вручную или промокодом.
              </p>
            )}
          </div>

          {mode === "edit" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Срок ручного уровня (дней)</label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="Не менять"
                value={form.levelExpireDays}
                onChange={(e) => update("levelExpireDays", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {errors.levelExpireDays && (
                <span className="text-xs text-red-600 mt-1 block">{errors.levelExpireDays}</span>
              )}
              <p className="text-xs text-gray-500 mt-1">0 = бессрочно. Пусто — не менять срок.</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label>
            <textarea
              rows={3}
              value={form.comment}
              onChange={(e) => update("comment", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>

          {submitError && <div className="text-sm text-red-600">{submitError}</div>}
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
            disabled={submitting}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-70 disabled:cursor-not-allowed"
            disabled={submitting}
          >
            {submitting ? "Сохраняем…" : mode === "create" ? "Создать" : "Сохранить"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

export default CustomerFormModal;
