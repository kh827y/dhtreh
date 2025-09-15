"use client";

import { ReactNode } from "react";
import Input from "./ui/Input";
import Select from "./ui/Select";
import Button from "./ui/Button";
import Switch from "./ui/Switch";

type Props = {
  merchantId: string;
  onMerchantIdChange: (v: string) => void;
  period: string;
  onPeriodChange: (v: string) => void;
  onRefresh: () => void;
  busy?: boolean;
  error?: string | null;
  rightSlot?: ReactNode;
  // Optional custom date range support
  customRange?: boolean;
  onCustomRangeChange?: (v: boolean) => void;
  fromDate?: string;
  toDate?: string;
  onFromDateChange?: (v: string) => void;
  onToDateChange?: (v: string) => void;
};

export default function TopBar({ merchantId, onMerchantIdChange, period, onPeriodChange, onRefresh, busy, error, rightSlot, customRange, onCustomRangeChange, fromDate, toDate, onFromDateChange, onToDateChange }: Props) {
  return (
    <div className="flex items-end gap-3 flex-wrap">
      <Input label="merchantId" value={merchantId} onChange={e=>onMerchantIdChange(e.target.value)} />
      <Select label="Период" value={period} onChange={e=>onPeriodChange(e.target.value)} disabled={!!customRange}>
        <option value="day">День</option>
        <option value="week">Неделя</option>
        <option value="month">Месяц</option>
        <option value="quarter">Квартал</option>
        <option value="year">Год</option>
      </Select>
      {onCustomRangeChange && (
        <Switch label="Диапазон дат" checked={!!customRange} onChange={onCustomRangeChange} />
      )}
      {onFromDateChange && (
        <Input label="С" type="date" value={fromDate || ""} onChange={e=>onFromDateChange(e.target.value)} disabled={!customRange} />
      )}
      {onToDateChange && (
        <Input label="По" type="date" value={toDate || ""} onChange={e=>onToDateChange(e.target.value)} disabled={!customRange} />
      )}
      <Button onClick={onRefresh} loading={!!busy}>Обновить</Button>
      {rightSlot}
      {error && <div className="text-rose-400 text-sm">{error}</div>}
    </div>
  );
}
