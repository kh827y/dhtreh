"use client";

import React, { Suspense } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Filter,
  Store,
  User,
  Monitor,
  Star,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  AlertTriangle,
  X,
  Ban,
  CheckCircle2,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Briefcase,
  ExternalLink,
} from "lucide-react";
import { useTimezone } from "../../components/TimezoneProvider";

// ---- Types ----

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
  manager: { id: string; name: string | null; status?: string | null } | null;
  device: string | null;
  rating: number | null;
  spent: number;
  spentSource: string | null;
  earned: number;
  earnedSource: string | null;
  total: number;
  paidByPoints: number;
  toPay: number;
  receiptNumber: string | null;
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
  CAMPAIGN: "Акция",
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

const PAGE_SIZE = 10;

function formatRub(value: number) {
  return value.toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
}

function formatPoints(value: number) {
  return value.toLocaleString("ru-RU");
}

const orderKey = (op: Pick<Operation, "orderId" | "receiptNumber" | "id" | "kind">) => {
  const key = (op.orderId || op.receiptNumber || "").trim();
  if (key) return key;
  if (op.kind === "REFUND") return `refund-${op.id || ""}`;
  return "";
};

function getReasonText(operation: Operation): string {
  const details = (operation.details || "").trim();
  const note = (operation.note || "").trim();
  if ((operation.kind === "PROMOCODE" || operation.kind === "CAMPAIGN") && note) {
    return note;
  }
  return details || operationKindLabels[operation.kind] || "Операция";
}

function getDisplayId(operation: Operation): string | null {
  if (operation.kind === "REFUND" || operation.kind === "COMPLIMENTARY") {
    return null;
  }
  const candidate = (operation.receiptNumber || operation.orderId || operation.id || "").trim();
  return candidate || null;
}

function getSourceMeta(operation: Operation) {
  if (operation.manager) {
    return {
      type: "staff" as const,
      name: operation.manager.name || operation.manager.id || "—",
      id: operation.manager.id,
    };
  }
  if (operation.device) {
    return {
      type: "device" as const,
      name: operation.device,
      id: operation.device,
    };
  }
  const fallbackName = operation.carrier?.name || "Система";
  return { type: "system" as const, name: fallbackName, id: "system" };
}

function mapOperationFromDto(item: any): Operation {
  const carrierType = String(item?.carrier?.type || "").toUpperCase();
  const carrierIdMap: Record<string, string> = { PHONE: "phone", APP: "app", WALLET: "wallet", CARD: "card" };
  const carrierNameMap: Record<string, string> = {
    phone: "Номер телефона",
    app: "Мобильное приложение",
    wallet: "Цифровая карта Wallet",
    card: "Пластиковая карта",
  };
  const carrierId = carrierIdMap[carrierType] || carrierType.toLowerCase() || "other";
  const fallbackCarrierName = carrierNameMap[carrierId] || "—";
  const carrierCode = String(item?.carrier?.code || "");
  const isDeviceCarrier =
    carrierType === "SMART" ||
    carrierType === "PC_POS" ||
    carrierType === "OUTLET" ||
    carrierType === "DEVICE";
  const deviceFromPayload =
    typeof item?.device?.code === "string" ? item.device.code.trim() : "";
  const deviceId =
    deviceFromPayload ||
    (isDeviceCarrier && carrierCode.trim() ? carrierCode.trim() : "");
  const receiptNumberRaw = item?.receiptNumber;
  const receiptNumber = receiptNumberRaw != null ? String(receiptNumberRaw).trim() : "";
  const orderIdRaw = item?.orderId;
  const orderId = orderIdRaw != null ? String(orderIdRaw).trim() : "";
  const fallbackId = String(item?.id || receiptNumber || orderId || "");
  const earnedAmount = Number(item?.earn?.amount ?? 0);
  const spentAmount = Number(item?.redeem?.amount ?? 0);
  const totalAmount = Number(item?.totalAmount ?? 0);
  const customerName = String(item?.customer?.name || item?.customer?.phone || "Клиент");
  const managerId = typeof item?.staff?.id === "string" ? item.staff.id.trim() : "";
  const managerNameRaw = item?.staff?.name != null ? String(item.staff.name).trim() : "";
  const managerName = managerNameRaw || managerId || null;
  const managerStatus = item?.staff?.status != null ? String(item.staff.status) : null;
  const manager =
    managerId || managerNameRaw
      ? {
          id: managerId || managerNameRaw || "",
          name: managerName,
          status: managerStatus,
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
          id: String(rawCanceledBy.id || ""),
          name: canceledByName ? String(canceledByName) : null,
        }
      : null;
  const rawKind = String(item?.kind || "").toUpperCase();
  const allowedKinds = Object.keys(operationKindLabels) as OperationKind[];
  const kind = allowedKinds.includes(rawKind as OperationKind)
    ? (rawKind as OperationKind)
    : "OTHER";
  const details = String(
    item?.details || item?.earn?.source || item?.redeem?.source || "Операция с баллами",
  );
  const note = typeof item?.note === "string" ? item.note : null;
  const change = Number(item?.change ?? earnedAmount - spentAmount);
  const carrierLabel =
    item?.carrier?.label != null && String(item.carrier.label).trim()
      ? String(item.carrier.label).trim()
      : fallbackCarrierName;

  return {
    id: fallbackId,
    datetime: String(item?.occurredAt || new Date().toISOString()),
    outlet: {
      id: String(item?.outlet?.id || ""),
      name:
        item?.outlet?.name != null
          ? String(item.outlet.name)
          : item?.outlet?.code != null
            ? String(item.outlet.code)
            : null,
    },
    client: { id: String(item?.customer?.id || ""), name: customerName },
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
    receiptNumber: receiptNumber || null,
    orderId: orderId || fallbackId,
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
  return (
    <Suspense fallback={null}>
      <OperationsPageInner />
    </Suspense>
  );
}

function OperationsPageInner() {
  const searchParams = useSearchParams();
  const initialStaffId = searchParams.get("staffId");
  const timezone = useTimezone();

  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [staffScope, setStaffScope] = React.useState("all");
  const [staffFilter, setStaffFilter] = React.useState("all");
  const [outletFilter, setOutletFilter] = React.useState("all");
  const [deviceFilter, setDeviceFilter] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState<"all" | OperationKind>("all");
  const [directionFilter, setDirectionFilter] = React.useState<"all" | "earn" | "redeem">("all");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [preview, setPreview] = React.useState<Operation | null>(null);
  const [items, setItems] = React.useState<Operation[]>([]);
  const [total, setTotal] = React.useState(0);
  const [refundedOrderIds, setRefundedOrderIds] = React.useState<Set<string>>(new Set());
  const [staffOptions, setStaffOptions] = React.useState<SelectOption[]>([]);
  const [outletOptions, setOutletOptions] = React.useState<SelectOption[]>([]);
  const [deviceOptions, setDeviceOptions] = React.useState<DeviceOption[]>([]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
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

  const formatDate = React.useCallback(
    (value: string) => dateFormatter.format(new Date(value)),
    [dateFormatter],
  );
  const formatTime = React.useCallback(
    (value: string) => timeFormatter.format(new Date(value)),
    [timeFormatter],
  );

  React.useEffect(() => {
    if (!initialStaffId) return;
    setStaffFilter(initialStaffId);
  }, [initialStaffId]);

  React.useEffect(() => {
    setPage(1);
  }, [
    search,
    dateFrom,
    dateTo,
    staffScope,
    staffFilter,
    outletFilter,
    deviceFilter,
    typeFilter,
    directionFilter,
  ]);

  const staffSelectOptions = React.useMemo(() => {
    const activeStatuses = new Set(["ACTIVE", "PENDING", "SUSPENDED"]);
    const formerStatuses = new Set(["FIRED", "ARCHIVED"]);
    const filtered =
      staffScope === "current"
        ? staffOptions.filter((opt) => activeStatuses.has((opt.status || "").toUpperCase()))
        : staffScope === "former"
          ? staffOptions.filter((opt) => formerStatuses.has((opt.status || "").toUpperCase()))
          : staffOptions;
    const withAll = [{ value: "all", label: "Все сотрудники" }, ...filtered];
    if (staffFilter !== "all" && !withAll.find((opt) => opt.value === staffFilter)) {
      withAll.push({ value: staffFilter, label: staffFilter });
    }
    return withAll;
  }, [staffOptions, staffScope, staffFilter]);

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
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String((page - 1) * PAGE_SIZE));
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (staffFilter !== "all") params.set("staffId", staffFilter);
    if (staffScope === "current") params.set("staffStatus", "current");
    if (staffScope === "former") params.set("staffStatus", "former");
    if (outletFilter !== "all") params.set("outletId", outletFilter);
    if (deviceFilter !== "all") params.set("deviceId", deviceFilter);
    if (typeFilter !== "all") params.set("operationType", typeFilter);
    if (directionFilter !== "all") params.set("direction", directionFilter);
    if (search.trim()) params.set("receiptNumber", search.trim());

    (async () => {
      try {
        const res = await fetch(`/api/operations/log?${params.toString()}`, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Не удалось загрузить операции");
        const payload: any = await res.json().catch(() => ({}));
        const list: any[] = Array.isArray(payload.items) ? payload.items : [];
        const mapped = list.map((item) => mapOperationFromDto(item));

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

        const staffMap = new Map<string, SelectOption>();
        const outletMap = new Map<string, SelectOption>();
        const deviceMap = new Map<string, DeviceOption>();
        mapped.forEach((op) => {
          if (op.manager?.id) {
            staffMap.set(op.manager.id, {
              value: op.manager.id,
              label: op.manager.name || op.manager.id,
              status: op.manager.status || "ACTIVE",
            });
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
    staffFilter,
    outletFilter,
    deviceFilter,
    typeFilter,
    directionFilter,
    search,
    page,
  ]);

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

  const pageStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, total);

  const renderStars = (rating: number) => (
    <div className="flex space-x-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={12}
          className={star <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200"}
        />
      ))}
    </div>
  );

  const modalDisplayId = preview ? getDisplayId(preview) : null;
  const modalNoteValue = preview ? (preview.note || "").trim() : "";
  const modalReasonUsesNote =
    preview && (preview.kind === "PROMOCODE" || preview.kind === "CAMPAIGN") && Boolean(modalNoteValue);

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Журнал операций</h2>
        <p className="text-gray-500 mt-1">История всех транзакций, начислений и списаний баллов.</p>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200/60 shadow-sm space-y-5">
        {/* Top Row: Search & Date & Reset */}
        <div className="flex flex-col xl:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Поиск по номеру чека..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-transparent focus:bg-white border focus:border-purple-500 rounded-xl text-sm font-medium transition-all outline-none"
            />
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl border border-gray-100">
            <div className="relative">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="pl-3 pr-2 py-1.5 bg-transparent text-sm font-medium text-gray-700 outline-none cursor-pointer"
              />
            </div>
            <span className="text-gray-300">|</span>
            <div className="relative">
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="pl-2 pr-3 py-1.5 bg-transparent text-sm font-medium text-gray-700 outline-none cursor-pointer"
              />
            </div>
          </div>

          {/* Reset */}
          <button
            onClick={() => {
              setSearch("");
              setDateFrom("");
              setDateTo("");
              setTypeFilter("all");
              setDirectionFilter("all");
              setOutletFilter("all");
              setStaffFilter("all");
              setStaffScope("all");
              setDeviceFilter("all");
              setPage(1);
            }}
            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
          >
            <X size={16} />
            <span>Сбросить</span>
          </button>
        </div>

        {/* Bottom Row: Selects */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Type */}
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <Filter size={16} />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="w-full pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none appearance-none cursor-pointer transition-all"
            >
              <option value="all">Все типы операций</option>
              {kindFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* 2. Direction */}
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <ArrowUpRight size={16} />
            </div>
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value as typeof directionFilter)}
              className="w-full pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none appearance-none cursor-pointer transition-all"
            >
              <option value="all">Начисления и списания</option>
              <option value="earn">Только начисления</option>
              <option value="redeem">Только списания</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* 3. Outlet */}
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <Store size={16} />
            </div>
            <select
              value={outletFilter}
              onChange={(e) => setOutletFilter(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none appearance-none cursor-pointer transition-all"
            >
              {outletSelectOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* 4. Staff Status */}
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <Briefcase size={16} />
            </div>
            <select
              value={staffScope}
              onChange={(e) => {
                setStaffScope(e.target.value);
                setStaffFilter("all");
                setDeviceFilter("all");
              }}
              className="w-full pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none appearance-none cursor-pointer transition-all"
            >
              <option value="all">Текущие и уволенные</option>
              <option value="current">Только текущие</option>
              <option value="former">Только уволенные</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* 5. Staff Name */}
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <User size={16} />
            </div>
            <select
              value={staffFilter}
              onChange={(e) => {
                setStaffFilter(e.target.value);
                setDeviceFilter("all");
              }}
              disabled={deviceFilter !== "all"}
              className="w-full pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none appearance-none cursor-pointer transition-all disabled:bg-gray-50 disabled:opacity-60"
            >
              {staffSelectOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* 6. Device */}
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <Monitor size={16} />
            </div>
            <select
              value={deviceFilter}
              onChange={(e) => {
                setDeviceFilter(e.target.value);
                setStaffFilter("all");
              }}
              disabled={staffFilter !== "all" || staffScope !== "all"}
              className="w-full pl-10 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 font-medium focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none appearance-none cursor-pointer transition-all disabled:bg-gray-50 disabled:opacity-60"
            >
              {deviceSelectOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-semibold w-32">Дата / Время</th>
                <th className="px-6 py-4 font-semibold">Клиент</th>
                <th className="px-6 py-4 font-semibold">Основание</th>
                <th className="px-6 py-4 font-semibold text-right">Баллы</th>
                <th className="px-6 py-4 font-semibold">Торговая точка</th>
                <th className="px-6 py-4 font-semibold">Источник</th>
                <th className="px-6 py-4 font-semibold text-center w-24">Оценка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <FileText size={48} className="mx-auto text-gray-300 mb-4" />
                    <p>Операции не найдены.</p>
                  </td>
                </tr>
              ) : (
                items.map((operation) => {
                  const isRefundOperation = operation.kind === "REFUND";
                  const isRefundedOrigin = !isRefundOperation && isRefundedOperation(operation);
                  const isCanceled = !isRefundOperation && Boolean(operation.canceledAt);
                  const statusMuted = isCanceled || isRefundedOrigin;
                  const source = getSourceMeta(operation);
                  const reason = getReasonText(operation);
                  const noteValue = (operation.note || "").trim();
                  const reasonUsesNote = (operation.kind === "PROMOCODE" || operation.kind === "CAMPAIGN") && Boolean(noteValue);
                  const showReceipt = Boolean(operation.receiptNumber) && operation.kind !== "PURCHASE";
                  const displayId = getDisplayId(operation);
                  const showCancelTag = operation.kind === "PURCHASE" && (isCanceled || isRefundedOrigin);

                  return (
                    <tr
                      key={operation.id}
                      onClick={() => setPreview(operation)}
                      className={`hover:bg-gray-50 transition-colors cursor-pointer group ${statusMuted ? "bg-gray-50/50 opacity-60 grayscale" : ""}`}
                    >
                      {/* Date */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{formatDate(operation.datetime)}</div>
                        <div className="text-xs text-gray-500">{formatTime(operation.datetime)}</div>
                      </td>

                      {/* Client */}
                      <td className="px-6 py-4">
                        {operation.client.id ? (
                          <a
                            href={`/customers?customerId=${encodeURIComponent(operation.client.id)}`}
                            onClick={(event) => event.stopPropagation()}
                            className="font-medium text-purple-600 hover:text-purple-800 hover:underline flex items-center"
                          >
                            {operation.client.name}
                            <ExternalLink size={10} className="ml-1 opacity-50" />
                          </a>
                        ) : (
                          <span className="font-medium text-gray-900">{operation.client.name}</span>
                        )}
                      </td>

                      {/* Reason & Amount */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-900">{reason}</span>
                          {operation.kind === "PURCHASE" && (
                            <span className="text-xs text-gray-500 mt-0.5">
                              Сумма: <span className="font-medium text-gray-700">{formatRub(operation.total)}</span>
                              {showCancelTag && <span className="text-red-500 font-bold ml-2">(ОТМЕНА)</span>}
                            </span>
                          )}
                          {operation.kind !== "PURCHASE" && showReceipt && (
                            <span className="text-xs text-gray-400 mt-0.5">Чек: {operation.receiptNumber}</span>
                          )}
                          {operation.kind !== "PURCHASE" && !showReceipt && noteValue && !reasonUsesNote && (
                            <span className="text-xs text-gray-400 mt-0.5">{noteValue}</span>
                          )}
                          {operation.kind !== "PURCHASE" && !showReceipt && !noteValue && displayId && (
                            <span className="text-xs text-gray-400 mt-0.5">ID: {displayId}</span>
                          )}
                        </div>
                      </td>

                      {/* Points */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end gap-1">
                          {operation.earned > 0 && (
                            <span className="font-bold text-green-600 flex items-center">
                              +{formatPoints(operation.earned)} <ArrowUpRight size={12} className="ml-0.5" />
                            </span>
                          )}
                          {operation.spent > 0 && (
                            <span className="font-bold text-red-500 flex items-center">
                              -{formatPoints(operation.spent)} <ArrowDownLeft size={12} className="ml-0.5" />
                            </span>
                          )}
                          {operation.earned === 0 && operation.spent === 0 && (
                            <span className="text-gray-300">-</span>
                          )}
                        </div>
                      </td>

                      {/* Outlet */}
                      <td className="px-6 py-4 text-gray-600">
                        {operation.outlet?.name ? (
                          <div className="flex items-center space-x-2">
                            <Store size={14} className="text-gray-400" />
                            <span className="truncate max-w-[150px]" title={operation.outlet.name}>
                              {operation.outlet.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-300 pl-6">-</span>
                        )}
                      </td>

                      {/* Source */}
                      <td className="px-6 py-4 text-gray-600">
                        <div className="flex items-center space-x-2">
                          {source.type === "device" ? (
                            <Monitor size={14} className="text-purple-500" />
                          ) : source.type === "system" ? (
                            <CheckCircle2 size={14} className="text-blue-500" />
                          ) : (
                            <User size={14} className="text-gray-400" />
                          )}
                          <span className="truncate max-w-[120px]" title={source.name}>
                            {source.name}
                          </span>
                        </div>
                      </td>

                      {/* Rating */}
                      <td className="px-6 py-4 text-center">
                        {operation.rating ? renderStars(operation.rating) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Показано {pageStart} - {pageEnd} из {total}
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-medium text-gray-900">Стр. {page}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {preview && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
              style={{ backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
            >
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative z-[101]">
                {/* Modal Header */}
                <div className={`p-6 border-b border-gray-100 rounded-t-xl flex justify-between items-start ${preview.canceledAt ? "bg-gray-100" : "bg-white"}`}>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-xl font-bold text-gray-900">{getReasonText(preview)}</h3>
                      {preview.canceledAt && (
                        <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide border border-red-200">
                          Отменена
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 font-mono mt-1">
                      {modalDisplayId ? `ID: ${modalDisplayId} • ${formatDate(preview.datetime)}` : formatDate(preview.datetime)}
                    </p>
                  </div>
                  <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600 p-1">
                    <X size={24} />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-6 space-y-6">
                  {/* Financial Breakdown */}
                  {preview.kind === "PURCHASE" && (
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">Сумма чека (полная)</span>
                        <span className="font-bold text-gray-900">{formatRub(preview.total)}</span>
                      </div>
                      {preview.paidByPoints > 0 && (
                        <div className="flex justify-between items-center text-sm text-red-600">
                          <span>Оплачено баллами</span>
                          <span className="font-bold">-{formatPoints(preview.paidByPoints)} Б</span>
                        </div>
                      )}
                      {preview.earned > 0 && (
                        <div className="flex justify-between items-center text-sm text-green-600">
                          <span>Начислено за покупку</span>
                          <span className="font-bold">+{formatPoints(preview.earned)} Б</span>
                        </div>
                      )}
                      <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between items-center text-sm">
                        <span className="text-gray-600">Оплачено деньгами</span>
                        <span className="font-medium text-gray-900">{formatRub(preview.toPay)}</span>
                      </div>
                    </div>
                  )}

                  {/* General Points Info */}
                  {preview.kind !== "PURCHASE" && (
                    <div className="flex justify-center space-x-8 py-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">+{formatPoints(preview.earned)}</div>
                        <div className="text-xs text-gray-500 uppercase font-medium">Начислено</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-500">-{formatPoints(preview.spent)}</div>
                        <div className="text-xs text-gray-500 uppercase font-medium">Списано/Возврат</div>
                      </div>
                    </div>
                  )}

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="block text-xs text-gray-400 uppercase font-medium mb-1">Клиент</span>
                      {preview.client.id ? (
                        <a
                          href={`/customers?customerId=${encodeURIComponent(preview.client.id)}`}
                          className="font-medium text-purple-600"
                        >
                          {preview.client.name}
                        </a>
                      ) : (
                        <div className="font-medium text-gray-800">{preview.client.name}</div>
                      )}
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 uppercase font-medium mb-1">Торговая точка</span>
                      <div className="text-gray-800">{preview.outlet?.name || "—"}</div>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 uppercase font-medium mb-1">Исполнитель</span>
                      <div className="text-gray-800">{getSourceMeta(preview).name}</div>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-400 uppercase font-medium mb-1">Номер чека</span>
                      <div className="font-mono text-gray-800">{preview.receiptNumber || "—"}</div>
                    </div>
                  </div>

                  {modalNoteValue && !modalReasonUsesNote && (
                    <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-700 border border-gray-100">
                      {modalNoteValue}
                    </div>
                  )}

                  {/* Cancellation Warning/Action */}
                  <div className="border-t border-gray-100 pt-6">
                    {preview.canceledAt ? (
                      <div className="bg-red-50 p-4 rounded-lg flex items-start space-x-3">
                        <Ban className="text-red-600 mt-0.5" size={20} />
                        <div className="text-sm text-red-800">
                          <p className="font-bold">Операция уже отменена</p>
                          <p>Баллы возвращены/списаны в соответствии с правилами отмены.</p>
                        </div>
                      </div>
                    ) : preview.kind === "REFUND" ? (
                      <div className="bg-amber-50 p-4 rounded-lg flex items-start space-x-3">
                        <AlertTriangle className="text-amber-600 mt-0.5" size={20} />
                        <div className="text-sm text-amber-800">
                          <p className="font-bold">Нельзя отменить возврат</p>
                          <p>Для коррекции создайте новую операцию вручную.</p>
                        </div>
                      </div>
                    ) : isRefundedOperation(preview) ? (
                      <div className="bg-amber-50 p-4 rounded-lg flex items-start space-x-3">
                        <AlertTriangle className="text-amber-600 mt-0.5" size={20} />
                        <div className="text-sm text-amber-800">
                          <p className="font-bold">Возврат уже оформлен</p>
                          <p>Эта покупка не может быть отменена повторно.</p>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => cancelOperation(preview)}
                        className="w-full flex items-center justify-center space-x-2 border-2 border-red-100 bg-white text-red-600 hover:bg-red-50 hover:border-red-200 py-3 rounded-xl font-bold transition-colors"
                      >
                        <RotateCcw size={18} />
                        <span>Отменить операцию</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
