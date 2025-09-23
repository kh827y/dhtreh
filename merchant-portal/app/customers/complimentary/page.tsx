"use client";

import React from "react";
import Link from "next/link";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";
import Toggle from "../../../components/Toggle";

export default function ComplimentaryPage() {
  const [phone, setPhone] = React.useState("");
  const [points, setPoints] = React.useState(100);
  const [reason, setReason] = React.useState("");
  const [notify, setNotify] = React.useState(true);
  const [toast, setToast] = React.useState("");

  const handleSubmit = () => {
    if (!phone.trim() || points <= 0) {
      setToast("Укажите телефон клиента и положительное количество баллов");
      return;
    }
    setToast("Запрос на начисление отправлен (демо)");
    setPhone("");
    setPoints(100);
    setReason("");
  };

  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0 }}>Комплименты клиентам</h1>
          <div style={{ opacity: 0.75, fontSize: 14 }}>Ручное начисление или списание баллов по особым случаям</div>
        </div>
        <Link href="/customers" className="btn btn-ghost">
          К списку клиентов
        </Link>
      </div>

      {toast && (
        <div className="glass" style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(37,211,102,0.25)" }}>
          {toast}
        </div>
      )}

      <Card>
        <CardHeader title="Начисление комплимента" subtitle="Выберите клиента и обоснуйте выдачу баллов" />
        <CardBody style={{ display: "grid", gap: 16 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Телефон клиента *</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+7 999 000-00-00"
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: "inherit" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6, maxWidth: 260 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Баллы *</span>
            <input
              type="number"
              min={1}
              value={points}
              onChange={(event) => setPoints(Number(event.target.value))}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: "inherit" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Причина</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Например, отзыв клиента или компенсация"
              rows={3}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: "inherit", resize: "vertical" }}
            />
          </label>

          <Toggle checked={notify} onChange={setNotify} label="Отправить push/e-mail уведомление клиенту" />

          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="primary" onClick={handleSubmit}>
              Начислить баллы
            </Button>
            <Button variant="ghost" onClick={() => { setPhone(""); setPoints(100); setReason(""); }}>
              Очистить форму
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="История комплиментов" subtitle="Последние заявки" />
        <CardBody>
          <div style={{ display: "grid", gap: 12 }}>
            {[1, 2, 3].map((row) => (
              <div key={row} className="glass" style={{ padding: 16, borderRadius: 12, display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 600 }}>Заявка #{row}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>+{row * 100} баллов</div>
                </div>
                <div style={{ fontSize: 13 }}>Причина: День рождения</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Отправлено {new Date(Date.now() - row * 3600000).toLocaleString("ru-RU")}</div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
