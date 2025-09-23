"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";
import { mockCustomers, statusLabels, tagLabels } from "../data";

export default function CustomerProfilePage() {
  const params = useParams<{ customerId: string }>();
  const router = useRouter();
  const customer = React.useMemo(
    () => mockCustomers.find((item) => item.id === params.customerId),
    [params.customerId],
  );

  if (!customer) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <h1>Клиент не найден</h1>
        <Button variant="primary" onClick={() => router.push("/customers")}>Вернуться к списку</Button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0 }}>{customer.name}</h1>
          <div style={{ opacity: 0.75, fontSize: 14 }}>Карточка клиента и история взаимодействий</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => router.push(`/customers?edit=${customer.id}`)}>Редактировать</Button>
          <Button variant="ghost" onClick={() => router.push("/customers")}>Назад</Button>
        </div>
      </div>

      <Card>
        <CardHeader title="Основная информация" />
        <CardBody>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Телефон</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{customer.phone}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>E-mail</div>
              <div style={{ fontSize: 16 }}>{customer.email ?? "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Статус</div>
              <div style={{ fontSize: 16 }}>{statusLabels[customer.status]}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Баланс</div>
              <div style={{ fontSize: 16 }}>{customer.balance} баллов</div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Уровень</div>
              <div style={{ fontSize: 16 }}>{customer.level ?? "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Последний визит</div>
              <div style={{ fontSize: 16 }}>
                {customer.lastVisit ? new Date(customer.lastVisit).toLocaleString("ru-RU") : "—"}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Статистика" />
        <CardBody>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div className="glass" style={{ padding: 16, borderRadius: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Совокупный чек</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{customer.totalAmount.toLocaleString("ru-RU")} ₽</div>
            </div>
            <div className="glass" style={{ padding: 16, borderRadius: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Покупок за всё время</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{customer.totalPurchases}</div>
            </div>
            <div className="glass" style={{ padding: 16, borderRadius: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Визитов за последние 90 дней</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{customer.visits}</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Теги и предпочтения" />
        <CardBody>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {customer.tags.length ? (
              customer.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "rgba(37,211,102,0.18)",
                    fontSize: 12,
                  }}
                >
                  {tagLabels[tag]}
                </span>
              ))
            ) : (
              <span style={{ opacity: 0.6 }}>Теги отсутствуют</span>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="История операций" subtitle="Последние 5 действий клиента" />
        <CardBody>
          <div style={{ display: "grid", gap: 12 }}>
            {[...Array(5)].map((_, index) => (
              <div key={index} className="glass" style={{ padding: 12, borderRadius: 12, display: "grid", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                  <span>Заказ #{index + 1}</span>
                  <span>{(customer.totalAmount / 5).toFixed(0)} ₽</span>
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {new Date(Date.now() - index * 86400000).toLocaleString("ru-RU")}
                </div>
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  Начислено {Math.round(customer.balance / 5)} баллов
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Действия" />
        <CardBody>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button variant="secondary">Начислить баллы вручную</Button>
            <Link href={`/loyalty/antifraud`} className="btn btn-ghost">
              Проверить активность в антифроде
            </Link>
            <Button variant="ghost">Отправить персональную рассылку</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
