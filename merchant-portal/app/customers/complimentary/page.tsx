"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";
import { getCustomerById, getCustomerByLogin } from "../data";

type FormState = {
  amount: string;
  expiresIn: string;
  comment: string;
};

type FormErrors = Partial<Record<keyof FormState, string>> & { amount?: string; expiresIn?: string };

const initialState: FormState = {
  amount: "",
  expiresIn: "0",
  comment: "",
};

export default function ComplimentaryPointsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawPhone = searchParams.get("phone") || "";
  const customerId = searchParams.get("customerId") || "";
  const phone = maskPhone(rawPhone);
  const customer = rawPhone
    ? getCustomerByLogin(maskPhone(rawPhone)) ?? getCustomerByLogin(rawPhone)
    : customerId
    ? getCustomerById(customerId)
    : null;

  const [form, setForm] = React.useState<FormState>(initialState);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const [apiError, setApiError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    const amountValue = Number(form.amount);
    const expiresValue = Number(form.expiresIn);

    if (!form.amount.trim()) {
      nextErrors.amount = "Укажите количество баллов";
    } else if (Number.isNaN(amountValue) || !Number.isInteger(amountValue) || amountValue <= 0) {
      nextErrors.amount = "Баллы должны быть целым числом больше 0";
    }

    if (form.expiresIn === "") {
      nextErrors.expiresIn = "Укажите срок";
    } else if (Number.isNaN(expiresValue) || expiresValue < 0) {
      nextErrors.expiresIn = "Срок не может быть отрицательным";
    }

    if (form.comment.length > 255) {
      nextErrors.comment = "Комментарий не должен превышать 255 символов";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  const canSubmit = !!rawPhone && form.amount.trim().length > 0 && form.expiresIn.trim().length > 0 && !submitting;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiError(null);
    if (!validate()) return;
    if (!rawPhone) {
      setApiError("Не указан телефон клиента");
      return;
    }

    const targetCustomer = customer ?? getCustomerByLogin(rawPhone) ?? getCustomerByLogin(phone);
    if (!targetCustomer) {
      setApiError("Клиент не найден. Проверьте телефон или откройте форму из карточки клиента.");
      return;
    }

    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    setSubmitting(false);
    setToast("Баллы начислены");

    const redirectId = customerId || targetCustomer.id;
    window.setTimeout(() => {
      router.push(`/customers/${redirectId}#operations`);
    }, 500);
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {toast && <div style={toastStyle}>{toast}</div>}
      <Card>
        <CardHeader title="Начисление комплиментарных баллов" subtitle="Специальное ручное начисление" />
        <CardBody>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 20, maxWidth: 520 }}>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={fieldStyle}>
                <span style={labelStyle}>Телефон клиента</span>
                <input style={{ ...inputStyle, opacity: 0.8 }} value={phone || rawPhone || "—"} disabled />
                {!rawPhone && (
                  <span style={{ fontSize: 12, color: "#f87171" }}>
                    Поле доступно только при переходе из карточки клиента или списка.
                  </span>
                )}
              </label>

              <label style={fieldStyle}>
                <span style={labelStyle}>Начислить баллов</span>
                <input
                  style={inputStyle}
                  type="number"
                  min={1}
                  step={1}
                  value={form.amount}
                  onChange={(event) => update("amount", event.target.value)}
                  placeholder="Например, 500"
                />
                {errors.amount && <ErrorText>{errors.amount}</ErrorText>}
              </label>

              <label style={fieldStyle}>
                <span style={labelStyle}>Через сколько дней баллы сгорят</span>
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  value={form.expiresIn}
                  onChange={(event) => update("expiresIn", event.target.value)}
                  placeholder="0"
                />
                <span style={{ fontSize: 12, opacity: 0.7 }}>Укажите 0, если срок действия баллов не ограничен.</span>
                {errors.expiresIn && <ErrorText>{errors.expiresIn}</ErrorText>}
              </label>

              <label style={fieldStyle}>
                <span style={labelStyle}>Комментарий к операции</span>
                <textarea
                  style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                  value={form.comment}
                  onChange={(event) => update("comment", event.target.value)}
                  placeholder="Комментарий увидит клиент в истории"
                />
                {errors.comment && <ErrorText>{errors.comment}</ErrorText>}
              </label>
            </div>

            {apiError && <ErrorText>{apiError}</ErrorText>}

            <div style={{ display: "flex", gap: 12 }}>
              <Button type="submit" disabled={!canSubmit}>
                {submitting ? "Начисляем…" : "Начислить"}
              </Button>
              <Link href={customer ? `/customers/${customer.id}` : "/customers"} style={{ color: "#94a3b8", alignSelf: "center" }}>
                Отмена
              </Link>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

function maskPhone(raw: string): string {
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 11) return raw;
  const [, a, b, c, d, e] = digits.match(/^(\d)(\d{3})(\d{3})(\d{2})(\d{2})$/) || [];
  if (!a) return raw;
  return `+${a} (${b}) ${c}-${d}-${e}`;
}

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

const toastStyle: React.CSSProperties = {
  position: "fixed",
  top: 96,
  right: 24,
  background: "rgba(34,197,94,0.16)",
  border: "1px solid rgba(34,197,94,0.35)",
  color: "#bbf7d0",
  padding: "12px 16px",
  borderRadius: 12,
  zIndex: 90,
  fontSize: 14,
  boxShadow: "0 16px 60px rgba(22,163,74,0.35)",
};

const ErrorText: React.FC<React.PropsWithChildren> = ({ children }) => (
  <span style={{ fontSize: 12, color: "#f87171" }}>{children}</span>
);
