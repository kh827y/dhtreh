"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Icons } from "@loyalty/ui";
import StarRating from "../../components/StarRating";

type OperationType = "PURCHASE" | "REGISTRATION" | "BIRTHDAY" | "AUTO_RETURN";

type Operation = {
  id: string;
  datetime: string;
  outlet: { id: string; name: string };
  client: { id: string; name: string };
  manager: { id: string; name: string };
  rating: number;
  spent: number;
  earned: { amount: number; source: string };
  total: number;
  paidByPoints: number;
  toPay: number;
  receipt: string;
  carrier: { id: string; name: string; code: string };
  type: OperationType;
};

const { Search, ChevronLeft, ChevronRight, X } = Icons;

const operations: Operation[] = [
  {
    id: "op-1",
    datetime: new Date().toISOString(),
    outlet: { id: "out-1", name: "Кофейня на Лиговском" },
    client: { id: "cust-15", name: "Екатерина Петрова" },
    manager: { id: "staff-4", name: "Алексей" },
    rating: 5,
    spent: 0,
    earned: { amount: 320, source: "Начислено по акции: ACT-1045" },
    total: 780,
    paidByPoints: 0,
    toPay: 780,
    receipt: "000547",
    carrier: { id: "card", name: "Пластиковая карта", code: "4213" },
    type: "PURCHASE",
  },
  {
    id: "op-2",
    datetime: new Date(Date.now() - 3600 * 1000 * 26).toISOString(),
    outlet: { id: "out-2", name: "Точка у метро Чкаловская" },
    client: { id: "cust-21", name: "Дмитрий Соколов" },
    manager: { id: "staff-6", name: "Мария" },
    rating: 4,
    spent: 150,
    earned: { amount: 0, source: "" },
    total: 920,
    paidByPoints: 150,
    toPay: 770,
    receipt: "000541",
    carrier: { id: "app", name: "Мобильное приложение", code: "8A2F" },
    type: "PURCHASE",
  },
  {
    id: "op-3",
    datetime: new Date(Date.now() - 3600 * 1000 * 48).toISOString(),
    outlet: { id: "out-1", name: "Кофейня на Лиговском" },
    client: { id: "cust-30", name: "Михаил Иванов" },
    manager: { id: "staff-4", name: "Алексей" },
    rating: 0,
    spent: 0,
    earned: { amount: 500, source: "Регистрация" },
    total: 0,
    paidByPoints: 0,
    toPay: 0,
    receipt: "REG-203",
    carrier: { id: "app", name: "Мобильное приложение", code: "5C90" },
    type: "REGISTRATION",
  },
  {
    id: "op-4",
    datetime: new Date(Date.now() - 3600 * 1000 * 72).toISOString(),
    outlet: { id: "out-3", name: "Pop-up в бизнес-центре" },
    client: { id: "cust-41", name: "Анна Лебедева" },
    manager: { id: "staff-9", name: "Сергей" },
    rating: 5,
    spent: 0,
    earned: { amount: 1000, source: "Промокод WELCOME1000" },
    total: 1240,
    paidByPoints: 0,
    toPay: 1240,
    receipt: "000533",
    carrier: { id: "phone", name: "Номер телефона", code: "+7 •• 55" },
    type: "BIRTHDAY",
  },
  {
    id: "op-5",
    datetime: new Date(Date.now() - 3600 * 1000 * 96).toISOString(),
    outlet: { id: "out-2", name: "Точка у метро Чкаловская" },
    client: { id: "cust-52", name: "Владимир Ким" },
    manager: { id: "staff-8", name: "Ирина" },
    rating: 3,
    spent: 200,
    earned: { amount: 120, source: "Начислено по акции: ACT-1772" },
    total: 860,
    paidByPoints: 200,
    toPay: 660,
    receipt: "000528",
    carrier: { id: "wallet", name: "Цифровая карта Wallet", code: "WLT-884" },
    type: "PURCHASE",
  },
  {
    id: "op-6",
    datetime: new Date(Date.now() - 3600 * 1000 * 120).toISOString(),
    outlet: { id: "out-1", name: "Кофейня на Лиговском" },
    client: { id: "cust-62", name: "Евгения Смирнова" },
    manager: { id: "staff-4", name: "Алексей" },
    rating: 5,
    spent: 0,
    earned: { amount: 700, source: "Автовозврат" },
    total: 0,
    paidByPoints: 0,
    toPay: 0,
    receipt: "AUTO-118",
    carrier: { id: "app", name: "Мобильное приложение", code: "6F2D" },
    type: "AUTO_RETURN",
  },
];

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("ru-RU");
}

function formatTime(date: string) {
  return new Date(date).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(date: string) {
  return `${formatDate(date)} ${formatTime(date)}`;
}

function formatRub(value: number) {
  return value.toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
}

function formatPoints(value: number) {
  return value.toLocaleString("ru-RU");
}

export default function OperationsPage() {
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [staffScope, setStaffScope] = React.useState("all");
  const [managerFilter, setManagerFilter] = React.useState("all");
  const [outletFilter, setOutletFilter] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState<"ALL" | OperationType>("ALL");
  const [directionFilter, setDirectionFilter] = React.useState("both");
  const [carrierFilter, setCarrierFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [preview, setPreview] = React.useState<Operation | null>(null);

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return operations.filter((operation) => {
      const dateValue = operation.datetime.slice(0, 10);
      if (dateFrom && dateValue < dateFrom) return false;
      if (dateTo && dateValue > dateTo) return false;
      if (typeFilter !== "ALL" && operation.type !== typeFilter) return false;
      if (directionFilter === "earn" && operation.earned.amount <= 0) return false;
      if (directionFilter === "spend" && operation.spent <= 0) return false;
      if (outletFilter !== "all" && operation.outlet.id !== outletFilter) return false;
      if (managerFilter !== "all" && operation.manager.id !== managerFilter) return false;
      if (carrierFilter !== "all" && operation.carrier.id !== carrierFilter) return false;
      if (query && !operation.receipt.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [dateFrom, dateTo, typeFilter, directionFilter, outletFilter, managerFilter, carrierFilter, search]);

  React.useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, typeFilter, directionFilter, outletFilter, managerFilter, carrierFilter, search]);

  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 24, fontWeight: 700 }}>Журнал начисления баллов</div>
        <div style={{ fontSize: 13, opacity: 0.65 }}>Всего: {filtered.length} записей</div>
      </div>

      <Card>
        <CardBody>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              alignItems: "flex-end",
            }}
          >
            <FilterBlock label="Дата">
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  style={dateInputStyle}
                />
                <span style={{ opacity: 0.6 }}>—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  style={dateInputStyle}
                />
              </div>
            </FilterBlock>
            <FilterBlock label="Сотрудники">
              <select value={staffScope} onChange={(event) => setStaffScope(event.target.value)} style={selectStyle}>
                <option value="all">Текущие и бывшие сотрудники</option>
                <option value="current">Только текущие</option>
                <option value="former">Только бывшие</option>
              </select>
            </FilterBlock>
            <FilterBlock label="Все менеджеры">
              <select value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)} style={selectStyle}>
                <option value="all">Все менеджеры</option>
                <option value="staff-4">Алексей</option>
                <option value="staff-6">Мария</option>
                <option value="staff-8">Ирина</option>
                <option value="staff-9">Сергей</option>
              </select>
            </FilterBlock>
            <FilterBlock label="Все торговые точки">
              <select value={outletFilter} onChange={(event) => setOutletFilter(event.target.value)} style={selectStyle}>
                <option value="all">Все торговые точки</option>
                <option value="out-1">Кофейня на Лиговском</option>
                <option value="out-2">Метро Чкаловская</option>
                <option value="out-3">Pop-up в БЦ</option>
              </select>
            </FilterBlock>
            <FilterBlock label="Тип операции">
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)} style={selectStyle}>
                <option value="ALL">Все операции</option>
                <option value="PURCHASE">Покупка</option>
                <option value="REGISTRATION">Регистрация</option>
                <option value="BIRTHDAY">День Рождения</option>
                <option value="AUTO_RETURN">Автовозврат</option>
              </select>
            </FilterBlock>
            <FilterBlock label="Списания и начисления">
              <select value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value)} style={selectStyle}>
                <option value="both">Списания и начисления</option>
                <option value="earn">Только начисления</option>
                <option value="spend">Только списания</option>
              </select>
            </FilterBlock>
            <FilterBlock label="Все носители">
              <select value={carrierFilter} onChange={(event) => setCarrierFilter(event.target.value)} style={selectStyle}>
                <option value="all">Все носители</option>
                <option value="card">Пластиковая карта</option>
                <option value="app">Мобильное приложение</option>
                <option value="wallet">Цифровая карта Wallet</option>
                <option value="phone">Номер телефона</option>
              </select>
            </FilterBlock>
            <FilterBlock label="Поиск по номеру чека">
              <div style={{ position: "relative" }}>
                <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.6 }} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Введите номер"
                  style={{ ...inputStyle, paddingLeft: 32 }}
                />
              </div>
            </FilterBlock>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Список операций" />
        <CardBody style={{ display: "grid", gap: 12 }}>
          {pageItems.map((operation) => (
            <button
              key={operation.id}
              type="button"
              onClick={() => setPreview(operation)}
              style={rowStyle}
            >
              <div style={rowGridStyle}>
                <div>
                  <div style={{ fontWeight: 700 }}>{formatDateTime(operation.datetime)}</div>
                  <div style={{ fontSize: 12, opacity: 0.65 }}>Чек №{operation.receipt}</div>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>Торговая точка</div>
                  <div style={{ fontWeight: 600 }}>{operation.outlet.name}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12 }}>
                    <span>
                      Клиент: {" "}
                      <a href={`/customers/${operation.client.id}`} style={{ color: "#818cf8" }}>
                        {operation.client.name}
                      </a>
                    </span>
                    <span>Менеджер: {operation.manager.name}</span>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <StarRating rating={operation.rating} size={18} />
                </div>
                <div style={totalsGridStyle}>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>– Списано</div>
                    <div style={{ color: "#f87171", fontWeight: 600 }}>–{formatPoints(operation.spent)}</div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>баллов</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>+ Начислено</div>
                    <div style={{ color: "#4ade80", fontWeight: 600 }}>+{formatPoints(operation.earned.amount)}</div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>{operation.earned.source || ""}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>Сумма чека, ₽</div>
                    <div style={{ fontWeight: 600 }}>{formatRub(operation.total)}</div>
                  </div>
                </div>
              </div>
            </button>
          ))}
          {!pageItems.length && (
            <div style={{ textAlign: "center", padding: 24, opacity: 0.6 }}>Нет операций для выбранных фильтров</div>
          )}
        </CardBody>
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Страница {page} из {totalPages}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            leftIcon={<ChevronLeft size={14} />}
          >
            Назад
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page === totalPages}
            rightIcon={<ChevronRight size={14} />}
          >
            Вперёд
          </Button>
        </div>
      </div>

      {preview && (
        <div style={modalOverlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {formatDate(preview.datetime)} {formatTime(preview.datetime)}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Чек №{preview.receipt}</div>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                style={closeButtonStyle}
                aria-label="Закрыть"
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: 24, display: "grid", gap: 16, overflowY: "auto", maxHeight: "70vh" }}>
              <InfoRow label="Торговая точка" value={preview.outlet.name} />
              <InfoRow
                label="Клиент"
                value={
                  <a href={`/customers/${preview.client.id}`} style={{ color: "#818cf8" }}>
                    {preview.client.name}
                  </a>
                }
              />
              <InfoRow label="Менеджер" value={preview.manager.name} />
              <InfoRow label="Носитель (способ предъявления)" value={`${preview.carrier.name} • ${preview.carrier.code}`} />
              <div style={{ border: "1px solid rgba(148,163,184,0.16)", borderRadius: 14, padding: 16, display: "grid", gap: 10 }}>
                <div style={{ fontWeight: 600 }}>Бонусные баллы</div>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>Начислено</div>
                    <div style={{ color: "#4ade80", fontWeight: 600 }}>+{formatPoints(preview.earned.amount)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>Списано</div>
                    <div style={{ color: "#f87171", fontWeight: 600 }}>–{formatPoints(preview.spent)}</div>
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
                <SummaryCard label="К оплате" value={formatRub(preview.toPay)} />
                <SummaryCard label="Оплачено баллами" value={`${formatPoints(preview.paidByPoints)} баллов`} />
                <SummaryCard label="Итого" value={formatRub(preview.total)} />
              </div>
            </div>
            <div style={modalFooterStyle}>
              <Button variant="secondary">Отменить транзакцию</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type FilterBlockProps = {
  label: string;
  children: React.ReactNode;
};

const FilterBlock: React.FC<FilterBlockProps> = ({ label, children }) => (
  <div style={{ display: "grid", gap: 6 }}>
    <span style={{ fontSize: 11, opacity: 0.6 }}>{label}</span>
    {children}
  </div>
);

type InfoRowProps = { label: string; value: React.ReactNode };

const InfoRow: React.FC<InfoRowProps> = ({ label, value }) => (
  <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12 }}>
    <span style={{ opacity: 0.65 }}>{label}</span>
    <span>{value}</span>
  </div>
);

type SummaryCardProps = { label: string; value: React.ReactNode };

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value }) => (
  <div style={{ border: "1px solid rgba(148,163,184,0.14)", borderRadius: 14, padding: 14, display: "grid", gap: 6 }}>
    <span style={{ fontSize: 12, opacity: 0.6 }}>{label}</span>
    <span style={{ fontWeight: 600 }}>{value}</span>
  </div>
);

const dateInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: 140,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  minWidth: 180,
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(15,23,42,0.6)",
  color: "inherit",
};

const rowStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 16,
  background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
  padding: 18,
  textAlign: "left",
  color: "inherit",
  cursor: "pointer",
};

const rowGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "160px minmax(0,1fr) 160px minmax(0,320px)",
  gap: 16,
  alignItems: "center",
};

const totalsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0,1fr))",
  gap: 12,
  justifyItems: "end",
  fontSize: 13,
};

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.76)",
  backdropFilter: "blur(8px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 80,
};

const modalStyle: React.CSSProperties = {
  width: "min(520px, 94vw)",
  background: "rgba(12,16,26,0.97)",
  borderRadius: 18,
  border: "1px solid rgba(148,163,184,0.18)",
  boxShadow: "0 26px 80px rgba(2,6,23,0.55)",
  display: "grid",
  gridTemplateRows: "auto 1fr auto",
};

const modalHeaderStyle: React.CSSProperties = {
  padding: "18px 24px",
  borderBottom: "1px solid rgba(148,163,184,0.14)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const modalFooterStyle: React.CSSProperties = {
  padding: "18px 24px",
  borderTop: "1px solid rgba(148,163,184,0.14)",
  display: "flex",
  justifyContent: "flex-end",
};

const closeButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(248,113,113,0.5)",
  color: "#fca5a5",
  borderRadius: 999,
  padding: "6px 10px",
  cursor: "pointer",
};
