"use client";

import React from "react";
import { Card, CardHeader, CardBody, Button, Icons } from "@loyalty/ui";
import StarRating from "../../components/StarRating";

type OperationKind =
  | "PURCHASE"
  | "REGISTRATION"
  | "BIRTHDAY"
  | "AUTO_RETURN"
  | "MANUAL_ACCRUAL"
  | "MANUAL_REDEEM"
  | "COMPLIMENTARY"
  | "REFERRAL"
  | "REFUND"
  | "BURN"
  | "ADJUST"
  | "EARN"
  | "REDEEM"
  | "CAMPAIGN"
  | "OTHER";

type Operation = {
  id: string;
  datetime: string;
  outlet: { id: string; name: string | null };
  client: { id: string; name: string };
  manager: { id: string; name: string | null };
  rating: number | null;
  spent: number;
  spentSource: string | null;
  earned: number;
  earnedSource: string | null;
  total: number;
  paidByPoints: number;
  toPay: number;
  receipt: string;
  orderId: string;
  carrier: { id: string; name: string; code: string } | null;
  kind: OperationKind;
  details: string;
  note: string | null;
  change: number;
  canceledAt: string | null;
  canceledBy?: { id: string; name: string | null } | null;
};

const { Search, ChevronLeft, ChevronRight, X } = Icons;

// убрали мок-данные; список загружается с сервера

const operationKindLabels: Record<OperationKind, string> = {
  PURCHASE: "Покупка",
  REGISTRATION: "Регистрация",
  BIRTHDAY: "День рождения",
  AUTO_RETURN: "Автовозврат",
  MANUAL_ACCRUAL: "Начислено администратором",
  MANUAL_REDEEM: "Списание администратором",
  COMPLIMENTARY: "Комплиментарные баллы",
  REFERRAL: "Реферальное начисление",
  REFUND: "Возврат покупки",
  BURN: "Сгорание баллов",
  ADJUST: "Корректировка",
  EARN: "Начисление",
  REDEEM: "Списание",
  CAMPAIGN: "Акции и промо",
  OTHER: "Прочие операции",
};

const kindFilterOptions: Array<{ value: OperationKind; label: string }> = [
  { value: "PURCHASE", label: operationKindLabels.PURCHASE },
  { value: "MANUAL_ACCRUAL", label: operationKindLabels.MANUAL_ACCRUAL },
  { value: "MANUAL_REDEEM", label: operationKindLabels.MANUAL_REDEEM },
  { value: "COMPLIMENTARY", label: operationKindLabels.COMPLIMENTARY },
  { value: "REFUND", label: operationKindLabels.REFUND },
  { value: "BIRTHDAY", label: operationKindLabels.BIRTHDAY },
  { value: "AUTO_RETURN", label: operationKindLabels.AUTO_RETURN },
  { value: "REGISTRATION", label: operationKindLabels.REGISTRATION },
  { value: "REFERRAL", label: operationKindLabels.REFERRAL },
  { value: "BURN", label: operationKindLabels.BURN },
  { value: "CAMPAIGN", label: operationKindLabels.CAMPAIGN },
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

function mapOperationFromDto(item: any): Operation {
  const carrierType = String(item?.carrier?.type || '').toUpperCase();
  const carrierIdMap: Record<string, string> = { PHONE: 'phone', APP: 'app', WALLET: 'wallet', CARD: 'card' };
  const carrierNameMap: Record<string, string> = {
    phone: 'Номер телефона',
    app: 'Мобильное приложение',
    wallet: 'Цифровая карта Wallet',
    card: 'Пластиковая карта',
  };
  const carrierId = carrierIdMap[carrierType] || carrierType.toLowerCase() || 'other';
  const fallbackCarrierName = carrierNameMap[carrierId] || '—';
  const receipt = String(item?.receiptNumber || item?.orderId || item?.id || '');
  const earnedAmount = Number(item?.earn?.amount ?? 0);
  const spentAmount = Number(item?.redeem?.amount ?? 0);
  const totalAmount = Number(item?.totalAmount ?? 0);
  const customerName = String(item?.customer?.name || item?.customer?.phone || 'Клиент');
  const managerId = String(item?.staff?.id || '');
  const managerName = item?.staff?.name != null ? String(item.staff.name) : null;
  const canceledAt = item?.canceledAt ? String(item.canceledAt) : null;
  const canceledByName =
    item?.canceledBy?.name ||
    item?.canceledBy?.fullName ||
    item?.canceledBy?.login ||
    null;
  const canceledBy = canceledAt
    ? {
        id: String(item?.canceledBy?.id || ''),
        name: canceledByName ? String(canceledByName) : null,
      }
    : null;
  const rawKind = String(item?.kind || '').toUpperCase();
  const allowedKinds = Object.keys(operationKindLabels) as OperationKind[];
  const kind = allowedKinds.includes(rawKind as OperationKind)
    ? (rawKind as OperationKind)
    : 'OTHER';
  const details = String(
    item?.details || item?.earn?.source || item?.redeem?.source || 'Операция с баллами',
  );
  const note = typeof item?.note === 'string' ? item.note : null;
  const change = Number(item?.change ?? earnedAmount - spentAmount);
  const carrierLabel =
    item?.carrier?.label != null && String(item.carrier.label).trim()
      ? String(item.carrier.label).trim()
      : fallbackCarrierName;
  const carrierCode = String(item?.carrier?.code || '');
  return {
    id: String(item?.id || receipt),
    datetime: String(item?.occurredAt || new Date().toISOString()),
    outlet: {
      id: String(item?.outlet?.id || ''),
      name:
        item?.outlet?.name != null
          ? String(item.outlet.name)
          : item?.outlet?.code != null
            ? String(item.outlet.code)
            : null,
    },
    client: { id: String(item?.customer?.id || ''), name: customerName },
    manager: { id: managerId, name: managerName },
    rating: item?.rating != null ? Number(item.rating) : null,
    spent: Math.max(0, spentAmount),
    spentSource: item?.redeem?.source ? String(item.redeem.source) : null,
    earned: Math.max(0, earnedAmount),
    earnedSource: item?.earn?.source ? String(item.earn.source) : null,
    total: totalAmount,
    paidByPoints: Math.max(0, spentAmount),
    toPay: Math.max(0, totalAmount - Math.max(0, spentAmount)),
    receipt,
    orderId: String(item?.orderId || item?.id || ''),
    carrier: item?.carrier
      ? { id: carrierId, name: carrierLabel, code: carrierCode }
      : null,
    kind,
    details,
    note,
    change,
    canceledAt,
    canceledBy,
  };
}

export default function OperationsPage() {
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [staffScope, setStaffScope] = React.useState("all");
  const [managerFilter, setManagerFilter] = React.useState("all");
  const [outletFilter, setOutletFilter] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState<"ALL" | OperationKind>("ALL");
  const [directionFilter, setDirectionFilter] = React.useState("both");
  const [carrierFilter, setCarrierFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [preview, setPreview] = React.useState<Operation | null>(null);
  const [items, setItems] = React.useState<Operation[]>([]);
  const [total, setTotal] = React.useState(0);

  async function cancelOperation(operation: Operation) {
    if (!operation?.id) return;
    const confirmed = window.confirm("Вы уверены, что хотите отменить транзакцию?");
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/operations/log/${encodeURIComponent(operation.id)}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || res.statusText);
      }
      let mapped: Operation | null = null;
      if (text) {
        try {
          const data = JSON.parse(text);
          mapped = mapOperationFromDto(data);
        } catch {
          mapped = null;
        }
      }
      setItems((prev) =>
        prev.map((item) => (mapped && item.id === mapped.id ? mapped : item)),
      );
      setPreview((prev) => (prev && mapped && prev.id === mapped.id ? mapped : prev));
      window.alert("Операция отменена администратором");
    } catch (error: any) {
      window.alert(error?.message || "Не удалось отменить операцию");
    }
  }

  // Подтягиваем реальные данные из БД через API-прокси
  React.useEffect(() => {
    let aborted = false;
    async function load() {
      const qs = new URLSearchParams();
      if (dateFrom) qs.set("from", dateFrom);
      if (dateTo) qs.set("to", dateTo);
      if (managerFilter !== "all") qs.set("staffId", managerFilter);
      if (outletFilter !== "all") qs.set("outletId", outletFilter);
      // Направление: both -> ALL, earn -> EARN, spend -> REDEEM
      const dir = directionFilter === "earn" ? "EARN" : directionFilter === "spend" ? "REDEEM" : "ALL";
      qs.set("direction", dir);
      if (search.trim()) qs.set("receiptNumber", search.trim());
      if (typeFilter !== "ALL") qs.set("operationType", typeFilter);
      // Переносим фильтр носителя (если нужен)
      if (carrierFilter !== "all") {
        const carrierMap: Record<string, string> = { phone: "PHONE", app: "APP", wallet: "WALLET", card: "CARD" };
        const c = carrierMap[carrierFilter] || carrierFilter.toUpperCase();
        qs.set("carrier", c);
      }
      const pageSize = 4;
      qs.set("limit", String(pageSize));
      qs.set("offset", String((page - 1) * pageSize));

      const res = await fetch(`/api/operations/log?${qs.toString()}`, { cache: "no-store" });
      const txt = await res.text();
      if (!res.ok) throw new Error(txt || res.statusText);
      const data = txt ? JSON.parse(txt) : { total: 0, items: [] };
      const mapped: Operation[] = Array.isArray(data.items) ? data.items.map(mapOperationFromDto) : [];
      if (!aborted) {
        setItems(mapped);
        setTotal(Number(data.total || mapped.length));
      }
    }
    load().catch((e) => {
      console.error(e);
      if (!aborted) {
        setItems([]);
        setTotal(0);
      }
    });
    return () => { aborted = true; };
  }, [dateFrom, dateTo, typeFilter, directionFilter, outletFilter, managerFilter, carrierFilter, search, page]);

  React.useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, typeFilter, directionFilter, outletFilter, managerFilter, carrierFilter, search]);

  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageItems = items;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 24, fontWeight: 700 }}>Журнал операций</div>
        <div style={{ fontSize: 13, opacity: 0.65 }}>Всего: {total} записей</div>
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
                {kindFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
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
                  style={{ ...inputFieldStyle, paddingLeft: 32 }}
                />
              </div>
            </FilterBlock>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Список операций" />
        <CardBody style={{ display: "grid", gap: 12 }}>
          {pageItems.map((operation) => {
            const isCanceled = Boolean(operation.canceledAt);
            return (
              <div
                key={operation.id}
                role="button"
                tabIndex={0}
                onClick={() => setPreview(operation)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPreview(operation);
                  }
                }}
                style={{
                  ...rowStyle,
                  border: isCanceled ? "1px solid rgba(248,113,113,0.35)" : rowStyle.border,
                  background: isCanceled
                    ? "rgba(248,113,113,0.08)"
                    : rowStyle.background,
                }}
              >
                <div style={rowGridStyle}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 700 }}>{formatDateTime(operation.datetime)}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>{operation.details}</div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>
                      Чек/ID: {operation.receipt || operation.orderId || operation.id}
                    </div>
                    {operation.note && (
                      <div style={{ fontSize: 11, opacity: 0.6 }}>{operation.note}</div>
                    )}
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>Торговая точка</div>
                    <div style={{ fontWeight: 600 }}>{operation.outlet.name || "—"}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12 }}>
                      <span>
                        Клиент: {" "}
                        <a
                          href={`/customers/${operation.client.id}`}
                          style={{ color: "#818cf8" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {operation.client.name}
                        </a>
                      </span>
                      <span>Менеджер: {operation.manager.name || "—"}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    {operation.rating != null ? (
                      <StarRating rating={operation.rating} size={18} />
                    ) : (
                      <span style={{ opacity: 0.45 }}>—</span>
                    )}
                  </div>
                  <div style={totalsGridStyle}>
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.6 }}>– Списано</div>
                      <div style={{ color: "#f87171", fontWeight: 600 }}>
                        –{formatPoints(operation.spent)}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>
                        {operation.spentSource || "баллы"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.6 }}>+ Начислено</div>
                      <div style={{ color: "#4ade80", fontWeight: 600 }}>
                        +{formatPoints(operation.earned)}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>{operation.earnedSource || ''}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.6 }}>Сумма чека, ₽</div>
                      <div style={{ fontWeight: 600 }}>{formatRub(operation.total)}</div>
                    </div>
                  </div>
                </div>
                {isCanceled && (
                  <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: "#f87171" }}>
                    Операция отменена администратором
                  </div>
                )}
              </div>
            );
          })}
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
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {preview.details}
                </div>
                <div style={{ fontSize: 12, opacity: 0.65 }}>
                  Чек/ID: {preview.receipt || preview.orderId || preview.id}
                </div>
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
              <InfoRow label="Торговая точка" value={preview.outlet.name || '—'} />
              <InfoRow
                label="Клиент"
                value={
                  <a href={`/customers/${preview.client.id}`} style={{ color: "#818cf8" }}>
                    {preview.client.name}
                  </a>
                }
              />
              <InfoRow label="Менеджер" value={preview.manager.name || '—'} />
              <InfoRow
                label="Носитель (способ предъявления)"
                value={
                  preview.carrier
                    ? `${preview.carrier.name} • ${preview.carrier.code}`
                    : '—'
                }
              />
              <div style={{ border: "1px solid rgba(148,163,184,0.16)", borderRadius: 14, padding: 16, display: "grid", gap: 10 }}>
                <div style={{ fontWeight: 600 }}>Бонусные баллы</div>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>Начислено</div>
                    <div style={{ color: "#4ade80", fontWeight: 600 }}>+{formatPoints(preview.earned)}</div>
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
              {preview.canceledAt && (
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: "#f87171" }}>
                  Операция отменена администратором
                </div>
              )}
            </div>
            <div style={modalFooterStyle}>
              <Button
                variant="secondary"
                disabled={Boolean(preview.canceledAt)}
                onClick={() => cancelOperation(preview)}
              >
                {preview.canceledAt ? "Уже отменена" : "Отменить транзакцию"}
              </Button>
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

const inputFieldStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(15,23,42,0.6)",
  color: "inherit",
};

const dateInputStyle: React.CSSProperties = {
  ...inputFieldStyle,
  width: 140,
};

const selectStyle: React.CSSProperties = {
  ...inputFieldStyle,
  minWidth: 180,
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
