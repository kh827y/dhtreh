"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Button } from "@loyalty/ui";
import Toggle from "../../components/Toggle";
import type { Customer, CustomerStatus, CustomerTag } from "./data";
import { statusLabels, tagLabels } from "./data";

interface Props {
  open: boolean;
  initial?: Partial<Customer>;
  onClose(): void;
  onSubmit(customer: Partial<Customer>): void;
}

const tagOptions: CustomerTag[] = ["vip", "dr", "no_spam", "complaint", "new"];
const statusOptions: CustomerStatus[] = ["ACTIVE", "INACTIVE", "BLOCKED"];

export default function CustomerFormModal({ open, initial, onClose, onSubmit }: Props) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [phone, setPhone] = React.useState(initial?.phone ?? "");
  const [email, setEmail] = React.useState(initial?.email ?? "");
  const [birthday, setBirthday] = React.useState(initial?.birthday ?? "");
  const [status, setStatus] = React.useState<CustomerStatus>(initial?.status ?? "ACTIVE");
  const [level, setLevel] = React.useState(initial?.level ?? "");
  const [tags, setTags] = React.useState<CustomerTag[]>(initial?.tags ?? []);
  const [noMarketing, setNoMarketing] = React.useState(initial?.tags?.includes("no_spam") ?? false);

  React.useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setPhone(initial?.phone ?? "");
    setEmail(initial?.email ?? "");
    setBirthday(initial?.birthday ?? "");
    setStatus(initial?.status ?? "ACTIVE");
    setLevel(initial?.level ?? "");
    setTags(initial?.tags ?? []);
    setNoMarketing(initial?.tags?.includes("no_spam") ?? false);
  }, [open, initial]);

  const toggleTag = (tag: CustomerTag) => {
    setTags((prev) => {
      if (prev.includes(tag)) return prev.filter((value) => value !== tag);
      return [...prev, tag];
    });
  };

  if (!open) return null;

  const handleSubmit = () => {
    if (!name.trim() || !phone.trim()) return;
    const normalizedTags = Array.from(new Set([...tags.filter((tag) => tag !== "no_spam"), noMarketing ? "no_spam" : undefined].filter(Boolean) as CustomerTag[]));
    onSubmit({ name, phone, email, birthday, status, level, tags: normalizedTags });
    onClose();
  };

  const content = (
    <div
      role="dialog"
      aria-modal
      className="glass"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "center",
        zIndex: 90,
      }}
      onClick={onClose}
    >
      <div
        className="glass"
        style={{ width: "min(520px, 90vw)", borderRadius: 16, padding: 24, display: "grid", gap: 16 }}
        onClick={(event) => event.stopPropagation()}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 18 }}>{initial?.id ? "Редактировать клиента" : "Новый клиент"}</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>Заполните контактные данные и предпочтения</div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            ✕
          </button>
        </header>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Имя *</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Имя и фамилия"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Телефон *</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+7 999 000-00-00"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>E-mail</span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="client@example.com"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Дата рождения</span>
          <input
            type="date"
            value={birthday ?? ""}
            onChange={(event) => setBirthday(event.target.value)}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Статус</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as CustomerStatus)}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {statusLabels[option]}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Уровень программы лояльности</span>
          <input
            value={level ?? ""}
            onChange={(event) => setLevel(event.target.value)}
            placeholder="Например, Золото"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
          />
        </label>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 600 }}>Теги</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {tagOptions.map((tag) => {
              const active = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={`btn ${active ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => toggleTag(tag)}
                >
                  {tagLabels[tag]}
                </button>
              );
            })}
          </div>
          <Toggle checked={noMarketing} onChange={setNoMarketing} label="Клиент отказался от рекламных коммуникаций" />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!name.trim() || !phone.trim()}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
