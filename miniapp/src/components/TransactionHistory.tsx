"use client";

import React from "react";
import {
  ShoppingBag,
  Star,
  RotateCcw,
  Gift,
  Cake,
  Flag,
  UserPlus,
  UserMinus,
  Clock,
  Tag,
  Zap,
} from "lucide-react";

export type TransactionType =
  | "purchase"
  | "admin_bonus"
  | "refund"
  | "birthday"
  | "signup"
  | "referral"
  | "referral_refund"
  | "expiration"
  | "promo"
  | "campaign";

export type Transaction = {
  id: string;
  title: string;
  description?: string;
  date: string;
  amount: number;
  cashback: number;
  pointsBurned?: number;
  type: TransactionType;
};

interface Props {
  transactions: Transaction[];
  onShowAll?: () => void;
  title?: string;
  titleClassName?: string;
  headerClassName?: string;
}

const TransactionHistory: React.FC<Props> = ({
  transactions,
  onShowAll,
  title = "История",
  titleClassName = "text-xl font-bold text-gray-900",
  headerClassName = "flex items-center justify-between mb-4",
}) => {
  const getIcon = (type: TransactionType) => {
    switch (type) {
      case "purchase":
        return <ShoppingBag size={18} />;
      case "refund":
        return <RotateCcw size={18} />;
      case "admin_bonus":
        return <Gift size={18} />;
      case "birthday":
        return <Cake size={18} />;
      case "signup":
        return <Flag size={18} />;
      case "referral":
        return <UserPlus size={18} />;
      case "referral_refund":
        return <UserMinus size={18} />;
      case "expiration":
        return <Clock size={18} />;
      case "promo":
        return <Tag size={18} />;
      case "campaign":
        return <Zap size={18} fill="currentColor" />;
      default:
        return <Star size={18} />;
    }
  };

  const getIconStyles = (type: TransactionType) => {
    switch (type) {
      case "purchase":
        return "bg-gray-100 text-gray-500";
      case "refund":
        return "bg-orange-100 text-orange-600";
      case "admin_bonus":
        return "bg-purple-100 text-purple-600";
      case "birthday":
        return "bg-pink-100 text-pink-500";
      case "signup":
        return "bg-green-100 text-green-600";
      case "referral":
        return "bg-blue-100 text-blue-600";
      case "referral_refund":
        return "bg-red-100 text-red-500";
      case "expiration":
        return "bg-gray-100 text-gray-400";
      case "promo":
        return "bg-indigo-100 text-indigo-600";
      case "campaign":
        return "bg-yellow-100 text-yellow-600";
      default:
        return "bg-gray-100 text-gray-500";
    }
  };

  const getAmountDisplay = (t: Transaction) => {
    if (t.amount === 0) return null;
    if (t.type === "refund") return `+${t.amount.toLocaleString()} ₽`;
    return `-${t.amount.toLocaleString()} ₽`;
  };

  const renderPoints = (t: Transaction) => {
    const isCashbackNegative = ["refund", "expiration", "referral_refund"].includes(t.type);
    const isBurnedPositive = t.type === "refund";

    const elements = [] as React.ReactElement[];

    if (t.cashback > 0) {
      const sign = isCashbackNegative ? "-" : "+";
      const color = isCashbackNegative ? "text-gray-400" : "text-green-600 font-semibold";

      elements.push(
        <div key="cashback" className={`text-sm ${color}`}>
          {sign}
          {t.cashback} Б
        </div>,
      );
    }

    if (t.pointsBurned && t.pointsBurned > 0) {
      const sign = isBurnedPositive ? "+" : "-";
      const color = isBurnedPositive ? "text-green-600 font-semibold" : "text-gray-400";

      elements.push(
        <div key="burned" className={`text-sm ${color}`}>
          {sign}
          {t.pointsBurned} Б
        </div>,
      );
    }

    if (t.amount === 0 && elements.length === 1) {
      const first = elements[0] as React.ReactElement<{ className?: string }>;
      const className = first.props.className || "";
      return React.cloneElement(first, {
        className: className.replace("text-sm", "text-base font-bold"),
      });
    }

    return <div className="flex flex-col items-end">{elements}</div>;
  };

  return (
    <div className="w-full">
      <div className={headerClassName}>
        <h3 className={titleClassName}>{title}</h3>
        {onShowAll && (
          <button
            onClick={onShowAll}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 active:opacity-60"
          >
            Показать все
          </button>
        )}
      </div>

      <div className="space-y-0 bg-white rounded-2xl shadow-card overflow-hidden">
        {transactions.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-gray-400">Пока нет операций</p>
          </div>
        ) : (
          transactions.map((t, index) => (
            <div
              key={t.id}
              className={`p-4 flex items-center justify-between ${
                index !== transactions.length - 1 ? "border-b border-gray-100" : ""
              }`}
            >
              <div className="flex items-center space-x-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${getIconStyles(t.type)}`}>
                  {getIcon(t.type)}
                </div>
                <div>
                  <div className="font-semibold text-gray-900 text-sm leading-snug">{t.title}</div>
                  {t.description && <div className="text-xs text-gray-500 mb-0.5">{t.description}</div>}
                  <div className="text-xs text-gray-400">{t.date}</div>
                </div>
              </div>
              <div className="text-right whitespace-nowrap pl-2">
                {t.amount > 0 && (
                  <div className={`font-bold text-base mb-0.5 ${t.type === "refund" ? "text-green-600" : "text-gray-900"}`}>
                    {getAmountDisplay(t)}
                  </div>
                )}
                {renderPoints(t)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TransactionHistory;
