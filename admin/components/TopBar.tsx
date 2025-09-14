"use client";

import { ReactNode } from "react";
import Input from "./ui/Input";
import Select from "./ui/Select";
import Button from "./ui/Button";

type Props = {
  merchantId: string;
  onMerchantIdChange: (v: string) => void;
  period: string;
  onPeriodChange: (v: string) => void;
  onRefresh: () => void;
  busy?: boolean;
  error?: string | null;
  rightSlot?: ReactNode;
};

export default function TopBar({ merchantId, onMerchantIdChange, period, onPeriodChange, onRefresh, busy, error, rightSlot }: Props) {
  return (
    <div className="flex items-end gap-3 flex-wrap">
      <Input label="merchantId" value={merchantId} onChange={e=>onMerchantIdChange(e.target.value)} />
      <Select label="Период" value={period} onChange={e=>onPeriodChange(e.target.value)}>
        <option value="day">День</option>
        <option value="week">Неделя</option>
        <option value="month">Месяц</option>
        <option value="quarter">Квартал</option>
        <option value="year">Год</option>
      </Select>
      <Button onClick={onRefresh} loading={!!busy}>Обновить</Button>
      {rightSlot}
      {error && <div className="text-rose-400 text-sm">{error}</div>}
    </div>
  );
}
