"use client";

import React from "react";
import { Button, Card, CardBody } from "@loyalty/ui";
import { useRouter } from "next/navigation";

const outlets = [
  { id: "o-1", name: "ТЦ «Центральный»" },
  { id: "o-2", name: "ТРК «Сфера»" },
  { id: "o-3", name: "Онлайн" },
];

const levelDictionary = {
  base: {
    id: "base",
    name: "Базовый",
    accrual: 3,
    redeem: 20,
    threshold: 0,
    starter: true,
    hidden: false,
  },
  silver: {
    id: "silver",
    name: "Silver",
    accrual: 5,
    redeem: 30,
    threshold: 15000,
    starter: false,
    hidden: false,
  },
  gold: {
    id: "gold",
    name: "Gold",
    accrual: 7,
    redeem: 40,
    threshold: 45000,
    starter: false,
    hidden: false,
  },
  vip: {
    id: "vip",
    name: "VIP",
    accrual: 10,
    redeem: 50,
    threshold: 90000,
    starter: false,
    hidden: true,
  },
} as const;

type Adjustment = {
  outletId: string;
  outletName: string;
  accrual: number;
  redeem: number;
};

type ClientRow = {
  id: string;
  name: string;
  birthday: string;
  age: number;
};

const mockClients: ClientRow[] = [
  { id: "+7 999 111-22-33", name: "Ирина Н.", birthday: "12.04", age: 32 },
  { id: "+7 926 447-55-12", name: "Максим В.", birthday: "02.11", age: 41 },
  { id: "CID-4820", name: "Natalia", birthday: "—", age: 0 },
];

export default function LevelDetailPage({ params }: { params: { levelId: string } }) {
  const router = useRouter();
  const level = (levelDictionary as Record<string, typeof levelDictionary.base | undefined>)[params.levelId];

  const [adjustments, setAdjustments] = React.useState<Adjustment[]>([
    { outletId: "o-1", outletName: "ТЦ «Центральный»", accrual: 12, redeem: 40 },
    { outletId: "o-3", outletName: "Онлайн", accrual: 9, redeem: 35 },
  ]);
  const [formOutlet, setFormOutlet] = React.useState("");
  const [formAccrual, setFormAccrual] = React.useState("5");
  const [formRedeem, setFormRedeem] = React.useState("25");
  const [editingOutlet, setEditingOutlet] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("");

  if (!level) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Уровень не найден</div>
        <Button variant="secondary" style={{ marginTop: 12 }} onClick={() => router.push("/loyalty/mechanics/levels")}>Вернуться назад</Button>
      </div>
    );
  }

  const isDeleteAllowed = mockClients.length === 0;

  function resetForm() {
    setFormOutlet("");
    setFormAccrual("5");
    setFormRedeem("25");
    setEditingOutlet(null);
  }

  function handleAddAdjustment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!formOutlet) {
      setMessage("Выберите филиал");
      return;
    }
    const accrual = Number(formAccrual);
    const redeem = Number(formRedeem);
    if ([accrual, redeem].some((value) => Number.isNaN(value) || value < 0 || value > 100)) {
      setMessage("Проценты должны быть в диапазоне 0–100");
      return;
    }
    const outletInfo = outlets.find((outlet) => outlet.id === formOutlet);
    if (!outletInfo) {
      setMessage("Филиал не найден");
      return;
    }
    const exists = adjustments.some((item) => item.outletId === formOutlet);
    if (exists && editingOutlet !== formOutlet) {
      setMessage("Для выбранного филиала корректировка уже существует");
      return;
    }

    setAdjustments((prev) => {
      if (editingOutlet) {
        return prev.map((item) =>
          item.outletId === editingOutlet
            ? { outletId: formOutlet, outletName: outletInfo.name, accrual, redeem }
            : item
        );
      }
      return [...prev, { outletId: formOutlet, outletName: outletInfo.name, accrual, redeem }];
    });
    resetForm();
  }

  function handleEdit(outletId: string) {
    const record = adjustments.find((item) => item.outletId === outletId);
    if (!record) return;
    setFormOutlet(record.outletId);
    setFormAccrual(String(record.accrual));
    setFormRedeem(String(record.redeem));
    setEditingOutlet(record.outletId);
  }

  function handleDelete(outletId: string) {
    if (!window.confirm("Удалить корректировку?")) return;
    setAdjustments((prev) => prev.filter((item) => item.outletId !== outletId));
    if (editingOutlet === outletId) {
      resetForm();
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <nav style={{ fontSize: 13, opacity: 0.75 }}>
        <a href="/loyalty/mechanics" style={{ color: "inherit", textDecoration: "none" }}>Механики</a>
        <span style={{ margin: "0 8px" }}>→</span>
        <a href="/loyalty/mechanics/levels" style={{ color: "inherit", textDecoration: "none" }}>Уровни клиентов</a>
        <span style={{ margin: "0 8px" }}>→</span>
        <span style={{ color: "var(--brand-primary)" }}>{level.name}</span>
      </nav>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{level.name}</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Параметры уровня и состав участников</div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <Button variant="primary" onClick={() => router.push(`/loyalty/mechanics/levels/${level.id}/edit`)}>Редактировать</Button>
          <Button
            variant="secondary"
            disabled={!isDeleteAllowed}
            onClick={() => {
              if (!isDeleteAllowed) return;
              if (window.confirm("Удалить уровень?")) {
                alert("Уровень удалён (демо)");
                router.push("/loyalty/mechanics/levels");
              }
            }}
          >
            Удалить
          </Button>
        </div>
      </div>
      <div style={{ fontSize: 12, opacity: 0.65 }}>Удалить можно группу, в которой нет клиентов</div>

      <Card>
        <CardBody>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Параметры уровня</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <KeyValue label="ID" value={level.id.toUpperCase()} />
                <KeyValue label="Название" value={level.name} />
                <KeyValue label="% начисления" value={`${level.accrual}%`} />
                <KeyValue label="% списания от чека" value={`${level.redeem}%`} />
                <KeyValue label="Сумма покупок" value={`${level.threshold.toLocaleString("ru-RU")} ₽`} />
                <KeyValue label="Стартовая группа" value={level.starter ? "Да" : "Нет"} />
                <KeyValue label="Скрытая группа" value={level.hidden ? "Да" : "Нет"} />
              </tbody>
            </table>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Все значения отображаются только для просмотра. Для изменения используйте кнопку «Редактировать».</div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ display: "grid", gap: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Корректировки начисления</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Локальные правила для отдельных торговых точек</div>
          </div>

          {adjustments.length === 0 ? (
            <div style={{ fontSize: 13, opacity: 0.7 }}>Нет корректировок</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 12, opacity: 0.7 }}>
                  <th style={{ padding: "10px 8px" }}>Филиал</th>
                  <th style={{ padding: "10px 8px" }}> % начисления</th>
                  <th style={{ padding: "10px 8px" }}> % списания</th>
                  <th style={{ padding: "10px 8px" }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((item) => (
                  <tr key={item.outletId} style={{ borderTop: "1px solid rgba(148,163,184,0.12)" }}>
                    <td style={{ padding: "10px 8px" }}>{item.outletName}</td>
                    <td style={{ padding: "10px 8px" }}>{item.accrual}%</td>
                    <td style={{ padding: "10px 8px" }}>{item.redeem}%</td>
                    <td style={{ padding: "10px 8px", display: "flex", gap: 12 }}>
                      <button
                        type="button"
                        onClick={() => handleEdit(item.outletId)}
                        style={{ border: "none", background: "transparent", color: "var(--brand-primary)", cursor: "pointer", padding: 0 }}
                      >
                        Редактировать
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.outletId)}
                        style={{ border: "none", background: "transparent", color: "var(--brand-primary)", cursor: "pointer", padding: 0 }}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <form onSubmit={handleAddAdjustment} style={{ display: "grid", gap: 12, padding: 16, borderRadius: 12, background: "rgba(148,163,184,0.06)" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Добавить корректировку</div>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Филиал</span>
                <select
                  value={formOutlet}
                  onChange={(event) => setFormOutlet(event.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                >
                  <option value="">Выберите торговую точку</option>
                  {outlets.map((outlet) => (
                    <option key={outlet.id} value={outlet.id}>
                      {outlet.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span>% начисления</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formAccrual}
                  onChange={(event) => setFormAccrual(event.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span>% списания</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={formRedeem}
                  onChange={(event) => setFormRedeem(event.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.6)", color: "#e2e8f0" }}
                />
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              {editingOutlet && (
                <Button variant="secondary" type="button" onClick={resetForm}>Отменить</Button>
              )}
              <Button variant="primary" type="submit">{editingOutlet ? "Сохранить" : "Добавить"}</Button>
            </div>
            {message && <div style={{ color: "#f87171", fontSize: 12 }}>{message}</div>}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody style={{ display: "grid", gap: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Состав группы</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Список клиентов обновляется несколько раз в сутки</div>
          </div>

          {mockClients.length === 0 ? (
            <div style={{ fontSize: 13, opacity: 0.7 }}>Пока в группе нет клиентов</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 12, opacity: 0.7 }}>
                  <th style={{ padding: "10px 8px" }}>Логин</th>
                  <th style={{ padding: "10px 8px" }}>Имя</th>
                  <th style={{ padding: "10px 8px" }}>День рождения</th>
                  <th style={{ padding: "10px 8px" }}>Возраст</th>
                </tr>
              </thead>
              <tbody>
                {mockClients.map((client) => (
                  <tr
                    key={client.id}
                    style={{ borderTop: "1px solid rgba(148,163,184,0.12)", cursor: "pointer" }}
                    onClick={() => router.push(`/customers/${client.id}`)}
                  >
                    <td style={{ padding: "10px 8px" }}>{client.id}</td>
                    <td style={{ padding: "10px 8px" }}>{client.name}</td>
                    <td style={{ padding: "10px 8px" }}>{client.birthday}</td>
                    <td style={{ padding: "10px 8px" }}>{client.age || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ fontSize: 12, opacity: 0.65 }}>Показаны записи 1 — {mockClients.length} из {mockClients.length}</div>
        </CardBody>
      </Card>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr>
      <td style={{ padding: "8px 8px", width: "220px", opacity: 0.7 }}>{label}</td>
      <td style={{ padding: "8px 8px", fontWeight: 600 }}>{value}</td>
    </tr>
  );
}
