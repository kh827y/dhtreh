"use client";

import React from "react";
import { Button, Icons } from "@loyalty/ui";

const { X } = Icons;

export type CustomerFormPayload = {
  login: string;
  email: string;
  firstName: string;
  lastName: string;
  tags: string;
  birthday: string;
  group: string;
  blockAccruals: boolean;
  gender: "male" | "female" | "unknown";
  comment: string;
};

type CustomerFormModalProps = {
  open: boolean;
  groups: string[];
  existingLogins: string[];
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: CustomerFormPayload) => Promise<void> | void;
};

type FormErrors = Partial<Record<keyof CustomerFormPayload, string>>;

const defaultValues: CustomerFormPayload = {
  login: "",
  email: "",
  firstName: "",
  lastName: "",
  tags: "",
  birthday: "",
  group: "",
  blockAccruals: false,
  gender: "unknown",
  comment: "",
};

export function CustomerFormModal({
  open,
  groups,
  existingLogins,
  submitting = false,
  error,
  onClose,
  onSubmit,
}: CustomerFormModalProps) {
  const [form, setForm] = React.useState<CustomerFormPayload>(defaultValues);
  const [errors, setErrors] = React.useState<FormErrors>({});

  React.useEffect(() => {
    if (!open) return;
    setForm(defaultValues);
    setErrors({});
  }, [open]);

  if (!open) return null;

  function update<K extends keyof CustomerFormPayload>(key: K, value: CustomerFormPayload[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const next: FormErrors = {};
    const digits = form.login.replace(/\D+/g, "");

    if (!form.login.trim()) {
      next.login = "Укажите логин клиента";
    } else if (digits.length < 11) {
      next.login = "Минимум 11 цифр";
    } else if (existingLogins.some((login) => login === digits)) {
      next.login = "Логин уже используется";
    }

    if (!form.email.trim()) {
      next.email = "Укажите email";
    } else if (!/^[\w-.]+@[\w-]+\.[A-Za-z]{2,}$/u.test(form.email.trim())) {
      next.email = "Некорректный email";
    }

    if (form.birthday.trim()) {
      const date = new Date(form.birthday);
      if (Number.isNaN(date.getTime())) {
        next.birthday = "Некорректная дата";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;

    await onSubmit({
      ...form,
      login: form.login.trim(),
      email: form.email.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      tags: form.tags.trim(),
      birthday: form.birthday,
      group: form.group.trim(),
      comment: form.comment.trim(),
    });
  }

  return (
    <div style={overlayStyle} role="presentation">
      <form onSubmit={handleSubmit} style={modalStyle} role="dialog" aria-modal="true">
        <div style={modalHeaderStyle}>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Добавить клиента</div>
            <div style={{ fontSize: 12, opacity: 0.65 }}>
              Заполните карточку клиента. Поля отмеченные как обязательные должны быть заполнены.
            </div>
          </div>
          <button type="button" onClick={onClose} style={closeButtonStyle} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>
        <div style={modalBodyStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Логин (телефон)*</span>
            <input
              style={inputStyle}
              value={form.login}
              onChange={(event) => update("login", event.target.value)}
              placeholder="+7 (900) 000-00-00"
            />
            {errors.login && <ErrorText>{errors.login}</ErrorText>}
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Email*</span>
            <input
              style={inputStyle}
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              placeholder="client@example.com"
              type="email"
            />
            {errors.email && <ErrorText>{errors.email}</ErrorText>}
          </label>

          <div style={gridTwoColumns}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Имя</span>
              <input
                style={inputStyle}
                value={form.firstName}
                onChange={(event) => update("firstName", event.target.value)}
                placeholder="Имя клиента"
              />
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>Фамилия</span>
              <input
                style={inputStyle}
                value={form.lastName}
                onChange={(event) => update("lastName", event.target.value)}
                placeholder="Фамилия клиента"
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
            <span style={hintStyle}>Используйте запятую или «;» как разделитель. Префикс # сохранится в значении тега.</span>
          </label>

          <div style={gridTwoColumns}>
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
                <option value="">Не выбрано</option>
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

          <label style={fieldStyle}>
            <span style={labelStyle}>Пол</span>
            <select
              style={inputStyle}
              value={form.gender}
              onChange={(event) => update("gender", event.target.value as CustomerFormPayload["gender"])}
            >
              <option value="male">Мужской</option>
              <option value="female">Женский</option>
              <option value="unknown">Не указан</option>
            </select>
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Комментарий к пользователю</span>
            <textarea
              style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
              value={form.comment}
              onChange={(event) => update("comment", event.target.value)}
              placeholder="Комментарий виден только администраторам"
            />
          </label>

          {error && <ErrorText>{error}</ErrorText>}
        </div>
        <div style={modalFooterStyle}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Создаём…" : "Создать"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "#fca5a5", fontSize: 12 }}>{children}</div>;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.76)",
  backdropFilter: "blur(8px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  width: "min(760px, 94vw)",
  background: "#0f172a",
  borderRadius: 16,
  boxShadow: "0 40px 120px rgba(15,23,42,0.45)",
  border: "1px solid rgba(148,163,184,0.2)",
  display: "flex",
  flexDirection: "column",
  maxHeight: "90vh",
};

const modalHeaderStyle: React.CSSProperties = {
  padding: "20px 24px",
  borderBottom: "1px solid rgba(148,163,184,0.16)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};

const modalBodyStyle: React.CSSProperties = {
  padding: "20px 24px",
  display: "grid",
  gap: 16,
  overflowY: "auto",
};

const modalFooterStyle: React.CSSProperties = {
  padding: "16px 24px",
  borderTop: "1px solid rgba(148,163,184,0.16)",
  display: "flex",
  justifyContent: "flex-end",
  gap: 12,
  background: "rgba(15,23,42,0.45)",
};

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.25)",
  background: "rgba(15,23,42,0.6)",
  color: "#e2e8f0",
  fontSize: 14,
};

const gridTwoColumns: React.CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.6,
};

const closeButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#f87171",
  cursor: "pointer",
  padding: 6,
  borderRadius: 999,
  transition: "background 0.2s ease",
};

