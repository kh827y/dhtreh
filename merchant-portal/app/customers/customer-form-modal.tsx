"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Button, Icons } from "@loyalty/ui";
import type { Gender } from "./data";

const { X } = Icons;

export type CustomerFormPayload = {
  login: string;
  email: string;
  firstName: string;
  tags: string;
  birthday: string;
  levelId: string | null;
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
    } else if (existingLogins.some((login) => login === form.login && login !== loginToIgnore)) {
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

    if (!form.levelId) {
      nextErrors.levelId = "Выберите уровень";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;

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
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="modal"
        style={modalStyle}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={modalHeaderStyle}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {mode === "create" ? "Добавить клиента" : "Редактировать клиента"}
          </div>
          <button type="button" onClick={onClose} style={closeButtonStyle} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: "18px 24px", display: "grid", gap: 16, maxHeight: "70vh", overflowY: "auto" }}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Телефон</span>
            <input
              style={inputStyle}
              value={form.login}
              onChange={(event) => update("login", event.target.value)}
              placeholder="+7 (900) 000-00-00"
            />
            {errors.login && <ErrorText>{errors.login}</ErrorText>}
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Email</span>
            <input
              style={inputStyle}
              type="email"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              placeholder="client@example.com"
            />
            {errors.email && <ErrorText>{errors.email}</ErrorText>}
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Имя клиента</span>
            <input
              style={inputStyle}
              value={form.firstName}
              onChange={(event) => update("firstName", event.target.value)}
              placeholder="Например, Иван Иванов"
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Теги</span>
            <input
              style={inputStyle}
              value={form.tags}
              onChange={(event) => update("tags", event.target.value)}
              placeholder="vip, день рождения; #кофе"
            />
            <span style={{ fontSize: 12, opacity: 0.65 }}>
              Используйте запятую или точку с запятой как разделитель. Префикс # сохранится в значении тега.
            </span>
          </label>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>День рождения</span>
              <input
                style={inputStyle}
                type="date"
                value={form.birthday}
                onChange={(event) => update("birthday", event.target.value)}
              />
              {errors.birthday && <ErrorText>{errors.birthday}</ErrorText>}
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Уровень клиента</span>
              <select
                style={inputStyle}
                value={form.levelId ?? ""}
                onChange={(event) => update("levelId", event.target.value || null)}
                disabled={!levels.length}
              >
                {levels.length === 0 && <option value="">Нет доступных уровней</option>}
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
              {errors.levelId && <ErrorText>{errors.levelId}</ErrorText>}
            </label>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Пол</span>
              <select
                style={inputStyle}
                value={form.gender}
                onChange={(event) => update("gender", event.target.value as Gender)}
              >
                <option value="male">Мужской</option>
                <option value="female">Женский</option>
                <option value="unknown">Не указан</option>
              </select>
            </label>
          </div>

          <label style={fieldStyle}>
            <span style={labelStyle}>Комментарий к пользователю</span>
            <textarea
              style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
              value={form.comment}
              onChange={(event) => update("comment", event.target.value)}
              placeholder="Комментарий виден только администраторам"
            />
          </label>

          {submitError && <ErrorText>{submitError}</ErrorText>}
        </div>
        <div style={modalFooterStyle}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Сохраняем…" : mode === "create" ? "Создать" : "Сохранить"}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

const modalStyle: React.CSSProperties = {
  width: "min(640px, 96vw)",
  maxHeight: "82vh",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border-default)",
  background: "var(--bg-elevated)",
  boxShadow: "var(--shadow-xl)",
  display: "grid",
  gridTemplateRows: "auto 1fr auto",
  color: "var(--fg)",
};

const modalHeaderStyle: React.CSSProperties = {
  padding: "18px 24px",
  borderBottom: "1px solid var(--border-default)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const modalFooterStyle: React.CSSProperties = {
  padding: "16px 24px",
  borderTop: "1px solid var(--border-default)",
  display: "flex",
  justifyContent: "flex-end",
  gap: 12,
};

const closeButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--fg-muted)",
  width: 32,
  height: 32,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 4,
};

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  opacity: 0.8,
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface)",
  color: "var(--fg)",
};

const ErrorText: React.FC<React.PropsWithChildren> = ({ children }) => (
  <span style={{ fontSize: 12, color: "#f87171" }}>{children}</span>
);

export default CustomerFormModal;
