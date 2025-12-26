"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";
import StarRating from "../../components/StarRating";
import { useTimezone } from "../../components/TimezoneProvider";
import { 
  Receipt, 
  Search as SearchIcon, 
  ChevronLeft, 
  ChevronRight,
  X,
  Calendar,
  Filter,
  User,
  Smartphone,
  Store as StoreIcon,
  ArrowUpRight,
  ArrowDownLeft,
  CreditCard,
  Ban,
  RefreshCcw,
} from "lucide-react";

type OperationKind =
  | "PURCHASE"
  | "REGISTRATION"
  | "BIRTHDAY"
  | "AUTO_RETURN"
  | "MANUAL_ACCRUAL"
  | "MANUAL_REDEEM"
  | "COMPLIMENTARY"
  | "REFERRAL"
  | "REFERRAL_ROLLBACK"
  | "REFUND"
  | "BURN"
  | "PROMOCODE"
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
  manager: { id: string; name: string | null } | null;
  device: string | null;
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

type SelectOption = { value: string; label: string; status?: string };
type DeviceOption = { value: string; label: string; outletId?: string };

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
  REFERRAL_ROLLBACK: "Возврат реферала",
  REFUND: "Возврат покупки",
  BURN: "Сгорание баллов",
  PROMOCODE: "Промокод",
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
  { value: "REFERRAL_ROLLBACK", label: operationKindLabels.REFERRAL_ROLLBACK },
  { value: "BURN", label: operationKindLabels.BURN },
  { value: "PROMOCODE", label: operationKindLabels.PROMOCODE },
  { value: "CAMPAIGN", label: operationKindLabels.CAMPAIGN },
];

function formatRub(value: number) {
  return value.toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
}

function formatPoints(value: number) {
  return value.toLocaleString("ru-RU");
}

const orderKey = (op: Pick<Operation, "orderId" | "receipt" | "canceledAt" | "kind">) => {
  const key = (op.orderId || op.receipt || "").trim();
  // для возвратов без orderId/receipt пытаемся брать id как ключ
  if (key) return key;
  // fallback только для REFUND без ключа
  if ((op as any).kind === "REFUND") return `refund-${(op as any).id || ""}`;
  return "";
};

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
  const carrierCode = String(item?.carrier?.code || '');
  const isDeviceCarrier =
    carrierType === 'SMART' ||
    carrierType === 'PC_POS' ||
    carrierType === 'OUTLET' ||
    carrierType === 'DEVICE';
  const deviceFromPayload =
    typeof item?.device?.code === 'string' ? item.device.code.trim() : '';
  const deviceId =
    deviceFromPayload ||
    (isDeviceCarrier && carrierCode.trim() ? carrierCode.trim() : '');
  const receipt = String(item?.receiptNumber || item?.orderId || item?.id || '');
  const earnedAmount = Number(item?.earn?.amount ?? 0);
  const spentAmount = Number(item?.redeem?.amount ?? 0);
  const totalAmount = Number(item?.totalAmount ?? 0);
  const customerName = String(item?.customer?.name || item?.customer?.phone || 'Клиент');
  const managerId = typeof item?.staff?.id === 'string' ? item.staff.id.trim() : '';
  const managerNameRaw = item?.staff?.name != null ? String(item.staff.name).trim() : '';
  const managerName = managerNameRaw || managerId || null;
  const manager =
    managerId || managerNameRaw
      ? {
          id: managerId || managerNameRaw || '',
          name: managerName,
        }
      : null;
  const canceledAt = item?.canceledAt ? String(item.canceledAt) : null;
  const rawCanceledBy = item?.canceledBy as any;
  const canceledByName =
    rawCanceledBy?.name ||
    rawCanceledBy?.fullName ||
    rawCanceledBy?.login ||
    rawCanceledBy?.email ||
    null;
  const hasCanceledBy = Boolean(
    rawCanceledBy &&
      ((rawCanceledBy.id && String(rawCanceledBy.id).trim()) || canceledByName),
  );
  const canceledBy =
    canceledAt && hasCanceledBy
      ? {
          id: String(rawCanceledBy.id || ''),
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
    manager,
    device: deviceId || null,
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

const PAGE_SIZE = 10;
const purchaseSummaryKinds: OperationKind[] = ["PURCHASE"];

export default function OperationsPage() {
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [staffScope, setStaffScope] = React.useState("all");
  const [managerFilter, setManagerFilter] = React.useState("all");
  const [outletFilter, setOutletFilter] = React.useState("all");
  const [deviceFilter, setDeviceFilter] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState<"ALL" | OperationKind>("ALL");
  const [directionFilter, setDirectionFilter] = React.useState("both");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [preview, setPreview] = React.useState<Operation | null>(null);
  const [items, setItems] = React.useState<Operation[]>([]);
  const [total, setTotal] = React.useState(0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const [hoveredRowId, setHoveredRowId] = React.useState<string | null>(null);
  const [refundedOrderIds, setRefundedOrderIds] = React.useState<Set<string>>(new Set());
  const [staffOptions, setStaffOptions] = React.useState<SelectOption[]>([]);
  const [outletOptions, setOutletOptions] = React.useState<SelectOption[]>([]);
  const [deviceOptions, setDeviceOptions] = React.useState<DeviceOption[]>([]);
  const timezone = useTimezone();
  const dateFormatter = React.useMemo(
    () => new Intl.DateTimeFormat("ru-RU", { timeZone: timezone.iana }),
    [timezone],
  );
  const timeFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat("ru-RU", {
        timeZone: timezone.iana,
        hour: "2-digit",
        minute: "2-digit",
      }),
    [timezone],
  );
  const formatDate = React.useCallback((value: string) => dateFormatter.format(new Date(value)), [dateFormatter]);
  const formatTime = React.useCallback((value: string) => timeFormatter.format(new Date(value)), [timeFormatter]);
  const staffSelectOptions = React.useMemo(() => {
    const activeStatuses = new Set(["ACTIVE", "PENDING", "SUSPENDED"]);
    const formerStatuses = new Set(["FIRED", "ARCHIVED"]);
    const filtered =
      staffScope === "current"
        ? staffOptions.filter((opt) => activeStatuses.has((opt.status || "").toUpperCase()))
        : staffScope === "former"
          ? staffOptions.filter((opt) => formerStatuses.has((opt.status || "").toUpperCase()))
          : staffOptions;
    return [{ value: "all", label: "Все сотрудники", status: "ACTIVE" }, ...filtered];
  }, [staffOptions, staffScope]);
  const outletSelectOptions = React.useMemo(
    () => [{ value: "all", label: "Все торговые точки" }, ...outletOptions],
    [outletOptions],
  );
  const deviceSelectOptions = React.useMemo(
    () => [{ value: "all", label: "Все устройства" }, ...deviceOptions],
    [deviceOptions],
  );

  const isRefundedOperation = React.useCallback(
    (op: Operation | null) => {
      if (!op) return false;
      if (op.kind === "REFUND") return true;
      const key = orderKey(op);
      return Boolean(key) && refundedOrderIds.has(key);
    },
    [refundedOrderIds],
  );

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    if (preview) {
      body.classList.add("modal-blur-active");
    } else {
      body.classList.remove("modal-blur-active");
    }
    return () => {
      body.classList.remove("modal-blur-active");
    };
  }, [preview]);

  React.useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String((page - 1) * PAGE_SIZE));
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (managerFilter !== "all") params.set("staffId", managerFilter);
    if (staffScope === "current") params.set("staffStatus", "current");
    if (staffScope === "former") params.set("staffStatus", "former");
    if (outletFilter !== "all") params.set("outletId", outletFilter);
    if (deviceFilter !== "all") params.set("deviceId", deviceFilter);
    if (typeFilter !== "ALL") params.set("operationType", typeFilter);
    if (directionFilter !== "both") params.set("direction", directionFilter);
    if (search.trim()) params.set("receipt", search.trim());

    (async () => {
      try {
        const res = await fetch(`/api/operations/log?${params.toString()}`, {
          method: "GET",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Не удалось загрузить операции");
        const payload: any = await res.json().catch(() => ({}));
        const list: any[] = Array.isArray(payload.items) ? payload.items : [];
        const mapped = list.map((item) => mapOperationFromDto(item));
        // отметим чеки с возвратами
        const refunds = new Set<string>();
        mapped.forEach((op) => {
          if (op.kind === "REFUND") {
            const key = orderKey(op);
            if (key) refunds.add(key);
          }
        });

        setRefundedOrderIds(refunds);
        setItems(mapped);
        setTotal(Number(payload.total ?? mapped.length ?? 0));

        // заполняем селекты на основе полученных данных
        const staffMap = new Map<string, SelectOption>();
        const outletMap = new Map<string, SelectOption>();
        const deviceMap = new Map<string, DeviceOption>();
        mapped.forEach((op) => {
          if (op.manager?.id) {
            staffMap.set(op.manager.id, { value: op.manager.id, label: op.manager.name || op.manager.id, status: "ACTIVE" });
          }
          if (op.outlet?.id) {
            outletMap.set(op.outlet.id, { value: op.outlet.id, label: op.outlet.name || op.outlet.id });
          }
          if (op.device) {
            deviceMap.set(op.device, { value: op.device, label: op.device, outletId: op.outlet?.id });
          }
        });
        setStaffOptions(Array.from(staffMap.values()));
        setOutletOptions(Array.from(outletMap.values()));
        setDeviceOptions(Array.from(deviceMap.values()));
      } catch (error) {
        if ((error as any)?.name === "AbortError") return;
        setItems([]);
        setTotal(0);
      }
    })();

    return () => controller.abort();
  }, [
    dateFrom,
    dateTo,
    staffScope,
    managerFilter,
    outletFilter,
    deviceFilter,
    typeFilter,
    directionFilter,
    search,
    page,
  ]);

  const previewActor = React.useMemo(() => {
    if (!preview) return { label: "Устройство", value: "—" };
    const val = (preview.manager?.name || "").trim() || (preview.manager?.id || "").trim();
    return {
        label: preview.manager ? "Сотрудник" : "Устройство",
        value: val || "—"
    };
  }, [preview]);

  const cancelOperation = React.useCallback(async (op: Operation) => {
    if (!op.id || op.kind === "REFUND") return;
    if (!window.confirm("Вы уверены, что хотите отменить эту операцию?")) return;
    try {
      const res = await fetch(`/api/operations/log/${encodeURIComponent(op.id)}/cancel`, {
        method: "POST",
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || "Не удалось отменить операцию");
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
      if (mapped) {
        setItems((prev) => prev.map((item) => (item.id === mapped!.id ? mapped! : item)));
        setPreview((prev) => (prev && prev.id === mapped!.id ? mapped! : prev));
      }
    } catch (e: any) {
      alert(e?.message || "Ошибка при отмене операции");
    }
  }, []);

  return (
    <div className="animate-in" style={{ display: "grid", gap: 24 }}>
      {/* Header code remains same ... */}
      <header style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: "var(--radius-lg)",
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.1))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--brand-primary-light)",
        }}>
          <Receipt size={24} />
        </div>
        <div>
          <h1 style={{ 
            fontSize: 28, 
            fontWeight: 800, 
            margin: 0,
            letterSpacing: "-0.02em",
          }}>
            Журнал операций
          </h1>
          <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              Всего: <strong style={{ color: "var(--fg)" }}>{total}</strong> записей
            </span>
            <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>
              Время: {timezone.label}
            </span>
          </div>
        </div>
      </header>

      <Card>
        <CardBody style={{ padding: 20 }}>
          <div className="filter-grid">
            <FilterBlock label="Дата">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="input"
                  style={{ width: 140 }}
                />
                <span style={{ opacity: 0.4 }}>—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="input"
                  style={{ width: 140 }}
                />
              </div>
            </FilterBlock>
            <FilterBlock label="Сотрудники">
              <select value={staffScope} onChange={(event) => setStaffScope(event.target.value)} className="input" style={{ minWidth: 200 }}>
                <option value="all">Текущие и бывшие</option>
                <option value="current">Только текущие</option>
                <option value="former">Только бывшие</option>
              </select>
            </FilterBlock>
            <FilterBlock label="Имя сотрудника">
              <select value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)} className="input" style={{ minWidth: 200 }}>
                {staffSelectOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FilterBlock>
            <FilterBlock label="Устройство">
              <select value={deviceFilter} onChange={(event) => setDeviceFilter(event.target.value)} className="input" style={{ minWidth: 180 }}>
                {deviceSelectOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FilterBlock>
            <FilterBlock label="Торговые точки">
              <select value={outletFilter} onChange={(event) => setOutletFilter(event.target.value)} className="input" style={{ minWidth: 200 }}>
                {outletSelectOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FilterBlock>
            <FilterBlock label="Тип операции">
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
                className="input"
                style={{ minWidth: 180 }}
              >
                <option value="ALL">Все операции</option>
                {kindFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FilterBlock>
            <FilterBlock label="Направление">
              <select value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value)} className="input" style={{ minWidth: 200 }}>
                <option value="both">Списания и начисления</option>
                <option value="earn">Только начисления</option>
                <option value="spend">Только списания</option>
              </select>
            </FilterBlock>
            <FilterBlock label="Поиск по чеку">
              <div style={{ position: "relative" }}>
                <SearchIcon size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--fg-muted)" }} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Номер чека"
                  className="input"
                  style={{ paddingLeft: 38, width: 180 }}
                />
              </div>
            </FilterBlock>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Список операций" />
        <CardBody style={{ display: "grid", gap: 0 }}>
          {items.map((operation) => {
            const isRefundOperation = operation.kind === "REFUND";
            const isRefundedOrigin = !isRefundOperation && isRefundedOperation(operation);
            const isCanceled = !isRefundOperation && Boolean(operation.canceledAt);
            const hasAdminCancelMarker = Boolean(operation.canceledBy);
            const isPromocode = operation.kind === "PROMOCODE";
            const statusText = isCanceled && hasAdminCancelMarker
              ? "Операция отменена администратором"
              : isRefundedOrigin
                ? "Возврат оформлен"
                : isCanceled
                  ? "Операция отменена"
                  : "";
            const statusColor = isCanceled || isRefundedOrigin ? "var(--fg-muted)" : "inherit";
            const ratingValue = operation.rating ?? 0;
            const hasOutlet = Boolean(operation.outlet?.name);
            const performerFromManager =
              (operation.manager?.name || "").trim() ||
              (operation.manager?.id || "").trim();
            const performerValue = performerFromManager || "—";
            const performerLabel = operation.manager ? "Сотрудник" : "Устройство";
            const isPurchaseOperation = purchaseSummaryKinds.includes(operation.kind);
            const summaryLabel = isPurchaseOperation ? "Сумма покупки" : null;
            const summaryValue =
              isPurchaseOperation && operation.total > 0
                ? formatRub(operation.total)
                : operation.details || "—";
            const earnedPoints = `+${formatPoints(operation.earned)}`;
            const spentPoints = operation.spent > 0 ? `-${formatPoints(operation.spent)}` : "0";
            const isHovered = hoveredRowId === operation.id;
            const customerId = operation.client?.id?.trim();
            const customerHref = customerId ? `/customers?customerId=${encodeURIComponent(customerId)}` : null;
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
                onMouseEnter={() => setHoveredRowId(operation.id)}
                onMouseLeave={() => {
                  setHoveredRowId((current) => (current === operation.id ? null : current));
                }}
                className="list-row operation-grid"
                style={{
                  opacity: isCanceled || isRefundedOrigin ? 0.6 : 1,
                }}
              >
                <div className="cell-date">
                  <span style={{ fontWeight: 600 }}>{formatDate(operation.datetime)}</span>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>{formatTime(operation.datetime)}</span>
                </div>
                <div className="cell-info">
                  {hasOutlet && <span style={{ fontWeight: 500 }}>{operation.outlet.name}</span>}
                  <span style={{ display: 'flex', gap: 4 }}>
                    <span style={{ opacity: 0.7 }}>Клиент:</span>
                    {customerHref ? (
                      <a
                        href={customerHref}
                        style={{ color: "var(--brand-primary-light)", fontWeight: 500 }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {operation.client.name}
                      </a>
                    ) : (
                      <span>{operation.client.name}</span>
                    )}
                  </span>
                  <span style={{ opacity: 0.7 }}>
                    {performerLabel}: {performerValue}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <StarRating rating={ratingValue} size={16} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: statusColor }}>
                  {statusText}
                </div>
                <div className="cell-right">
                  <span className="cell-label">Начислено</span>
                  <span style={{ color: "var(--success)", fontWeight: 600 }}>{earnedPoints}</span>
                </div>
                <div className="cell-right">
                  <span className="cell-label">Списано</span>
                  <span style={{ color: operation.spent > 0 ? "var(--danger)" : "inherit", fontWeight: 600 }}>
                    {spentPoints}
                  </span>
                </div>
                <div className="cell-right">
                  {summaryLabel && <span className="cell-label">{summaryLabel}</span>}
                  <span
                    style={{
                      fontWeight: isPurchaseOperation && operation.total > 0 ? 600 : 400,
                      background: isPromocode ? "rgba(250,204,21,0.15)" : undefined,
                      color: isPromocode ? "#ca8a04" : undefined,
                      padding: isPromocode ? "2px 8px" : undefined,
                      borderRadius: isPromocode ? 999 : undefined,
                      fontSize: isPromocode ? 12 : undefined,
                    }}
                  >
                    {summaryValue}
                  </span>
                </div>
              </div>
            );
          })}
          {!items.length && (
            <div style={{ textAlign: "center", padding: 48, opacity: 0.6 }}>
              <Filter size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
              <div>Нет операций для выбранных фильтров</div>
            </div>
          )}
        </CardBody>
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <span style={{ fontSize: 13, color: "var(--fg-muted)" }}>Страница {page} из {totalPages}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            leftIcon={<ChevronLeft size={16} />}
          >
            Назад
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page === totalPages}
            rightIcon={<ChevronRight size={16} />}
          >
            Вперёд
          </Button>
        </div>
      </div>

      {preview && typeof document !== "undefined"
        ? createPortal(
        <div className="modal-overlay" onClick={() => setPreview(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {formatDate(preview.datetime)} {formatTime(preview.datetime)}
                </div>
                <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
                  {preview.details}
                </div>
                <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>
                  ID: {preview.receipt || preview.orderId || preview.id}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--fg-muted)",
                  cursor: "pointer",
                  padding: 4,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.2s",
                }}
                className="btn-ghost"
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: "grid", gap: 0 }}>
                <InfoRow label="Торговая точка" value={preview.outlet.name || '—'} />
                <InfoRow
                  label="Клиент"
                  value={
                    <a
                      href={`/customers?customerId=${encodeURIComponent(preview.client.id)}`}
                      style={{ color: "var(--brand-primary-light)", fontWeight: 500 }}
                    >
                      {preview.client.name}
                    </a>
                  }
                />
                <InfoRow label={previewActor.label} value={previewActor.value} />
              </div>
              
              <div style={{ 
                background: "rgba(255, 255, 255, 0.03)", 
                borderRadius: 12, 
                padding: 16, 
                border: "1px solid var(--border-subtle)" 
              }}>
                <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Движение баллов</div>
                <div style={{ display: "flex", gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>Начислено</div>
                    <div style={{ color: "var(--success)", fontWeight: 600, fontSize: 16 }}>+{formatPoints(preview.earned)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>Списано</div>
                    <div style={{ color: "var(--danger)", fontWeight: 600, fontSize: 16 }}>–{formatPoints(preview.spent)}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                <SummaryCard label="К оплате" value={formatRub(preview.toPay)} />
                <SummaryCard label="Баллами" value={`${formatPoints(preview.paidByPoints)}`} />
                <SummaryCard label="Итого" value={formatRub(preview.total)} />
              </div>

              {(() => {
                const isRefundOperationModal = preview.kind === "REFUND";
                const isRefundedOriginModal = !isRefundOperationModal && isRefundedOperation(preview);
                const isCanceledModal = !isRefundOperationModal && Boolean(preview.canceledAt);
                const hasAdminCancelMarkerModal = Boolean(preview.canceledBy);
                if (isCanceledModal) {
                  const isWarnStyle = isRefundedOriginModal && !hasAdminCancelMarkerModal;
                  const text = isRefundedOriginModal
                    ? "Оформлен возврат по покупке"
                    : "Операция отменена администратором";
                  return (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        background: isWarnStyle
                          ? "rgba(234, 179, 8, 0.12)"
                          : "rgba(239, 68, 68, 0.1)",
                        color: isWarnStyle
                          ? "var(--warning, #eab308)"
                          : "var(--danger)",
                        fontSize: 13,
                        fontWeight: 500,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Ban size={16} />
                      {text}
                    </div>
                  );
                }
                return null;
              })()}

              {preview.kind === "REFUND" && (
                <div style={{
                  padding: 12,
                  borderRadius: 8,
                  background: "rgba(234, 179, 8, 0.12)",
                  color: "var(--warning, #eab308)",
                  fontSize: 13,
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}>
                  <Ban size={16} />
                  Возврат нельзя отменить
                </div>
              )}
            </div>
            <div className="modal-footer">
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Закрыть
              </Button>
              <Button
                variant="danger"
                disabled={
                  Boolean(preview.canceledAt) ||
                  preview.kind === "REFUND" ||
                  isRefundedOperation(preview)
                }
                onClick={() => cancelOperation(preview)}
                leftIcon={<Ban size={16} />}
              >
                {preview.canceledAt ? "Отменена" : "Отменить"}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

type FilterBlockProps = {
  label: string;
  children: React.ReactNode;
};

const FilterBlock: React.FC<FilterBlockProps> = ({ label, children }) => (
  <div className="filter-block">
    <span className="filter-label">{label}</span>
    {children}
  </div>
);

type InfoRowProps = { label: string; value: React.ReactNode };

const InfoRow: React.FC<InfoRowProps> = ({ label, value }) => (
  <div className="info-row">
    <span className="info-label">{label}</span>
    <span className="info-value">{value}</span>
  </div>
);

type SummaryCardProps = { label: string; value: React.ReactNode };

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value }) => (
  <div style={{ 
    border: "1px solid var(--border-subtle)", 
    borderRadius: 12, 
    padding: 12, 
    display: "flex", 
    flexDirection: "column", 
    gap: 4 
  }}>
    <span style={{ fontSize: 11, opacity: 0.6 }}>{label}</span>
    <span style={{ fontWeight: 600, fontSize: 15 }}>{value}</span>
  </div>
);
