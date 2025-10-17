"use client";

import React from "react";
import { Button, Icons } from "@loyalty/ui";
import type { Gender } from "./data";

const { X } = Icons;

export type CustomerFormPayload = {
  login: string;
  password: string;
  confirmPassword: string;
  email: string;
  firstName: string;
  lastName: string;
  tags: string;
  birthday: string;
  group: string;
  blockAccruals: boolean;
  gender: Gender;
  comment: string;
};

type CustomerFormModalProps = {
  open: boolean;
  mode: "create" | "edit";
  initialValues?: Partial<CustomerFormPayload>;
  loginToIgnore?: string;
  groups: string[];
  onClose: () => void;
  onSubmit: (values: CustomerFormPayload) => Promise<void> | void;
  existingLogins: string[];
};

type FormErrors = Partial<Record<keyof CustomerFormPayload, string>>;

const defaultValues: CustomerFormPayload = {
  login: "",
  password: "",
  confirmPassword: "",
  email: "",
  firstName: "",
  lastName: "",
  tags: "",
  birthday: "",
  group: "Стандарт",
  blockAccruals: false,
  gender: "unknown",
  comment: "",
};

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  open,
  mode,
  initialValues,
  loginToIgnore,
  groups,
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
      setForm({ ...defaultValues, ...(initialValues ?? {}) });
      setErrors({});
      setSubmitError(null);
    }
  }, [open, initialValues]);

  if (!open) return null;

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

    if (form.password || form.confirmPassword) {
      if (form.password !== form.confirmPassword) {
        nextErrors.confirmPassword = "Пароли не совпадают";
      }
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

  return (
    <div style={overlayStyle}>
      <form onSubmit={handleSubmit} style={modalStyle} role="dialog" aria-modal="true">
        <div style={modalHeaderStyle}>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {mode === "create" ? "Добавить клиента" : "Редактировать клиента"}
            </div>
            <div style={{ fontSize: 12, opacity: 0.65 }}>
              Пароль или пин-код можно оставить пустым при редактировании — текущие данные сохранятся.
            </div>
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

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Пароль или пин-код</span>
              <input
                style={inputStyle}
                type="password"
                value={form.password}
                onChange={(event) => update("password", event.target.value)}
                placeholder="Введите пароль"
              />
              {errors.password && <ErrorText>{errors.password}</ErrorText>}
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Повторите пароль или пин-код</span>
              <input
                style={inputStyle}
                type="password"
                value={form.confirmPassword}
                onChange={(event) => update("confirmPassword", event.target.value)}
                placeholder="Повторите пароль"
              />
              {errors.confirmPassword && <ErrorText>{errors.confirmPassword}</ErrorText>}
            </label>
          </div>

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

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Имя</span>
              <input
                style={inputStyle}
                value={form.firstName}
                onChange={(event) => update("firstName", event.target.value)}
                placeholder="Имя"
              />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Фамилия</span>
              <input
                style={inputStyle}
                value={form.lastName}
                onChange={(event) => update("lastName", event.target.value)}
                placeholder="Фамилия"
              />
            </label>
          </div>

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
              <span style={labelStyle}>Группа клиентов</span>
              <select
                style={inputStyle}
                value={form.group}
                onChange={(event) => update("group", event.target.value)}
              >
                {groups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={form.blockAccruals}
              onChange={(event) => update("blockAccruals", event.target.checked)}
            />
            <span>Блокировать начисления</span>
          </label>

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
    </div>
  );
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.76)",
  backdropFilter: "blur(8px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 90,
};

const modalStyle: React.CSSProperties = {
  width: "min(640px, 96vw)",
  borderRadius: 18,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(12,16,26,0.97)",
  boxShadow: "0 24px 90px rgba(2,6,23,0.6)",
  display: "grid",
  gridTemplateRows: "auto 1fr auto",
  color: "inherit",
};

const modalHeaderStyle: React.CSSProperties = {
  padding: "18px 24px",
  borderBottom: "1px solid rgba(148,163,184,0.14)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const modalFooterStyle: React.CSSProperties = {
  padding: "16px 24px",
  borderTop: "1px solid rgba(148,163,184,0.14)",
  display: "flex",
  justifyContent: "flex-end",
  gap: 12,
};

const closeButtonStyle: React.CSSProperties = {
  background: "rgba(248,113,113,0.18)",
  border: "1px solid rgba(248,113,113,0.5)",
  color: "#fca5a5",
  width: 32,
  height: 32,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
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
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(15,23,42,0.55)",
  color: "inherit",
};

const ErrorText: React.FC<React.PropsWithChildren> = ({ children }) => (
  <span style={{ fontSize: 12, color: "#f87171" }}>{children}</span>
);

export default CustomerFormModal;
