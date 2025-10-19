"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Icons } from "@loyalty/ui";
import Toggle from "../../../components/Toggle";

const { ShieldAlert } = Icons;

type AntifraudFormState = {
  dailyCap: string;
  monthlyCap: string;
  maxPointsPerOperation: string;
  blockDaily: boolean;
};

type FormErrors = Partial<Record<keyof AntifraudFormState, string>>;

const initialState: AntifraudFormState = {
  dailyCap: "5",
  monthlyCap: "40",
  maxPointsPerOperation: "3000",
  blockDaily: false,
};

export default function AntifraudPage() {
  const [form, setForm] = React.useState<AntifraudFormState>(initialState);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [requestError, setRequestError] = React.useState('');

  function handleChange<K extends keyof AntifraudFormState>(key: K, value: AntifraudFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setRequestError('');
      try {
        const res = await fetch('/api/portal/loyalty/antifraud', {
          cache: 'no-store',
        });
        let data: any = null;
        try { data = await res.json(); } catch {}
        if (!res.ok) {
          throw new Error((data && data.message) || 'Не удалось загрузить настройки антифрода');
        }
        if (!cancelled && data && typeof data === 'object') {
          setForm({
            dailyCap: String(data.dailyCap ?? initialState.dailyCap),
            monthlyCap: String(data.monthlyCap ?? initialState.monthlyCap),
            maxPointsPerOperation: String(data.maxPoints ?? initialState.maxPointsPerOperation),
            blockDaily: data.blockDaily === undefined ? initialState.blockDaily : Boolean(data.blockDaily),
          });
          setSavedAt(null);
          setErrors({});
        }
      } catch (e: any) {
        if (!cancelled) setRequestError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    const toValidate: Array<[keyof AntifraudFormState, string, boolean]> = [
      ["dailyCap", form.dailyCap, Number(form.dailyCap) >= 0],
      ["monthlyCap", form.monthlyCap, Number(form.monthlyCap) >= 0],
      ["maxPointsPerOperation", form.maxPointsPerOperation, Number(form.maxPointsPerOperation) > 0],
    ];

    toValidate.forEach(([key, value, condition]) => {
      if (!String(value).trim()) {
        nextErrors[key] = "Поле обязательно";
      } else if (!condition) {
        if (key === "maxPointsPerOperation") {
          nextErrors[key] = "Укажите положительное число";
        } else {
          nextErrors[key] = "Укажите число не меньше 0";
        }
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setErrors({});
    setRequestError('');
    const payload = {
      dailyCap: Math.max(0, Math.floor(Number(form.dailyCap) || 0)),
      monthlyCap: Math.max(0, Math.floor(Number(form.monthlyCap) || 0)),
      maxPoints: Math.max(1, Math.floor(Number(form.maxPointsPerOperation) || 0)),
      blockDaily: form.blockDaily,
    };
    try {
      const res = await fetch('/api/portal/loyalty/antifraud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      let data: any = null;
      try { data = await res.json(); } catch {}
      if (!res.ok) {
        throw new Error((data && data.message) || 'Не удалось сохранить настройки антифрода');
      }
      if (data && typeof data === 'object') {
        setForm({
          dailyCap: String(data.dailyCap ?? payload.dailyCap),
          monthlyCap: String(data.monthlyCap ?? payload.monthlyCap),
          maxPointsPerOperation: String(data.maxPoints ?? payload.maxPoints),
          blockDaily: data.blockDaily === undefined ? payload.blockDaily : Boolean(data.blockDaily),
        });
      }
      setSavedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    } catch (e: any) {
      setRequestError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20, alignItems: "start" }}>
      <Card>
        <CardBody style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "rgba(99,102,241,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#818cf8",
            }}
          >
            <ShieldAlert size={22} />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>События только уведомляют</div>
            <div style={{ opacity: 0.7, lineHeight: 1.5 }}>
              Настройки антифрода помогут отслеживать аномалии, но не блокируют проведение операций. Команда получает уведомление,
              чтобы вовремя проверить ситуацию и принять решение вручную.
            </div>
          </div>
        </CardBody>
      </Card>

      <form onSubmit={handleSubmit}>
        <Card style={{ display: "grid", gap: 0 }}>
          <CardHeader
            title="Ограничения по начислениям"
            subtitle="Установите частотные лимиты на одного клиента"
          />
          <CardBody style={{ display: "grid", gap: 18 }}>
            {requestError && <div style={{ color: "#f87171" }}>{requestError}</div>}
            <div style={fieldGridStyle}>
              <Field label="Покупателю начислены бонусы более N раз за день">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.dailyCap}
                  onChange={(event) => handleChange("dailyCap", event.target.value)}
                  style={inputStyle}
                  placeholder="Например, 5"
                  disabled={loading || saving}
                />
                {errors.dailyCap && <ErrorText>{errors.dailyCap}</ErrorText>}
              </Field>
              <Field label="… более N раз за месяц">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.monthlyCap}
                  onChange={(event) => handleChange("monthlyCap", event.target.value)}
                  style={inputStyle}
                  placeholder="Например, 30"
                  disabled={loading || saving}
                />
                {errors.monthlyCap && <ErrorText>{errors.monthlyCap}</ErrorText>}
              </Field>
              <Field label="Максимальное кол-во баллов для начисления">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.maxPointsPerOperation}
                  onChange={(event) => handleChange("maxPointsPerOperation", event.target.value)}
                  style={inputStyle}
                  placeholder="Например, 1500"
                  disabled={loading || saving}
                />
                {errors.maxPointsPerOperation && <ErrorText>{errors.maxPointsPerOperation}</ErrorText>}
              </Field>
            </div>
            <div
              style={{
                border: "1px solid rgba(148,163,184,0.18)",
                borderRadius: 14,
                padding: "14px 16px",
                display: "grid",
                gap: 6,
                background: "rgba(15,23,42,0.35)",
              }}
            >
              <Toggle
                checked={form.blockDaily}
                onChange={(next) => handleChange("blockDaily", next)}
                label="Блокировать операции при превышении дневного лимита"
                disabled={loading || saving}
              />
              <span style={{ fontSize: 12, opacity: 0.7 }}>
                Остальные лимиты (месячный и по сумме начисления) только создают уведомление и не останавливают операции.
              </span>
            </div>
          </CardBody>

          <div style={{ padding: 16, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, opacity: savedAt ? 0.7 : 0.4 }}>
              {loading
                ? 'Загрузка…'
                : savedAt
                  ? `Последнее сохранение: ${savedAt}`
                  : 'Не сохранено'}
            </div>
            <Button type="submit" disabled={saving || loading}>
              {saving ? "Сохраняем…" : "Сохранить"}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}

type FieldProps = {
  label: string;
  children: React.ReactNode;
};

const Field: React.FC<FieldProps> = ({ label, children }) => (
  <label style={{ display: "grid", gap: 8 }}>
    <span style={{ fontSize: 13, opacity: 0.8 }}>{label}</span>
    {children}
  </label>
);

const ErrorText: React.FC<React.PropsWithChildren> = ({ children }) => (
  <span style={{ fontSize: 12, color: "#f87171" }}>{children}</span>
);

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(15,23,42,0.55)",
  color: "inherit",
};

const fieldGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 18,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};
