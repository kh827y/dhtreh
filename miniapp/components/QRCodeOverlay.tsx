"use client";

import React, { useEffect, useState } from "react";
import { X, RefreshCw, Copy, Check, ScanLine } from "lucide-react";
import QrCanvas from "./QrCanvas";

type ProgressInfo = {
  nextLevelName: string;
  pointsToNext: number;
  percent: number;
};

interface QRCodeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  levelName: string | null;
  balance: number | null;
  cashbackPercent: number | null;
  qrToken: string;
  qrTimeLeft: number | null;
  qrRefreshing: boolean;
  qrLoading: boolean;
  qrError?: string | null;
  onRefresh: () => void;
  qrTtlSec: number | null;
  showManualCode: boolean;
  manualCode: string | null;
  progress: ProgressInfo | null;
  showMaxLevelMessage: boolean;
}

const QRCodeOverlay: React.FC<QRCodeOverlayProps> = ({
  isOpen,
  onClose,
  name,
  levelName,
  balance,
  cashbackPercent,
  qrToken,
  qrTimeLeft,
  qrRefreshing,
  qrLoading,
  qrError,
  onRefresh,
  qrTtlSec,
  showManualCode,
  manualCode,
  progress,
  showMaxLevelMessage,
}) => {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsCopied(false);
    }
  }, [isOpen]);

  const handleCopyCode = (code: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code.replace(/\s+/g, ""));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 safe-area-bottom">
      <div
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-xl transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-[360px] bg-white rounded-[32px] shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 overflow-hidden flex flex-col">
        <div className="relative px-6 pt-6 pb-2 text-center">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors z-20"
          >
            <X size={20} />
          </button>

          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight truncate px-8">{name}</h2>
          <div className="inline-flex items-center space-x-1 mt-1">
            <span className="text-sm font-medium text-gray-400">Статус:</span>
            <span className="text-sm font-bold text-blue-600 uppercase tracking-wide">{levelName || "—"}</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="relative bg-white p-4 rounded-[28px] border-2 border-dashed border-gray-200 shadow-sm mb-4">
            <ScanLine className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-900 opacity-[0.03] w-40 h-40" />
            {qrToken && !qrLoading ? (
              <QrCanvas value={qrToken} size={256} />
            ) : (
              <div className="w-64 h-64 rounded-lg bg-gray-100" />
            )}
          </div>

          {showManualCode && manualCode ? (
            <button
              onClick={() => handleCopyCode(manualCode)}
              className="flex items-center space-x-2.5 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors group mb-2"
            >
              <span className="font-mono text-[19px] font-bold text-gray-800 tracking-widest truncate max-w-[200px]">
                {manualCode}
              </span>
              {isCopied ? (
                <Check size={18} className="text-green-500 shrink-0" />
              ) : (
                <Copy size={18} className="text-gray-300 group-hover:text-blue-500 transition-colors shrink-0" />
              )}
            </button>
          ) : (
            <div className="h-4" />
          )}

          <div className="w-full max-w-[280px]">
            <button
              onClick={onRefresh}
              className="w-full relative overflow-hidden bg-gray-900 text-white h-[52px] rounded-2xl font-semibold flex items-center justify-center space-x-2.5 active:scale-[0.98] transition-all shadow-lg shadow-gray-200"
            >
              <div
                className="absolute bottom-0 left-0 h-[3px] bg-blue-500 transition-all duration-1000 ease-linear"
                style={{
                  width: `${
                    qrTimeLeft != null && qrTimeLeft > 0
                      ? (qrTimeLeft / Math.max(1, qrTtlSec ?? 60)) * 100
                      : 0
                  }%`,
                }}
              />
              <RefreshCw
                size={18}
                className={qrRefreshing || (qrTimeLeft != null && qrTimeLeft < 10) ? "animate-spin text-blue-400" : "text-gray-400"}
              />
              <span className="text-[17px]">Обновить код</span>
            </button>
            <div className="text-center mt-2">
              <span className="text-xs text-gray-400 font-medium">
                {qrTimeLeft != null ? `Код обновится через ${qrTimeLeft} сек` : ""}
              </span>
            </div>
            {qrError ? <div className="mt-2 text-center text-xs text-red-500">{qrError}</div> : null}
          </div>
        </div>

        <div className="bg-[#F9F9FB] border-t border-gray-100">
          <div className="grid grid-cols-2 divide-x divide-gray-200 border-b border-gray-200">
            <div className="p-4 flex flex-col items-center">
              <span className="text-[11px] uppercase text-gray-400 font-bold tracking-wider mb-1">Баланс</span>
              <span className="text-xl font-black text-gray-900">
                {balance != null ? balance.toLocaleString() : "—"} Б
              </span>
            </div>
            <div className="p-4 flex flex-col items-center">
              <span className="text-[11px] uppercase text-gray-400 font-bold tracking-wider mb-1">Кэшбэк</span>
              <span className="text-xl font-black text-blue-600">
                {cashbackPercent != null ? cashbackPercent : "—"}%
              </span>
            </div>
          </div>

          {showMaxLevelMessage ? (
            <div className="p-5 pt-4 text-center">
              <span className="text-sm font-semibold text-gray-700">У вас максимальный уровень!</span>
            </div>
          ) : progress ? (
            <div className="p-5 pt-4">
              <div className="flex justify-between items-end mb-2">
                <span className="text-xs font-semibold text-gray-500">
                  До статуса <span className="text-gray-900">{progress.nextLevelName}</span>
                </span>
                <span className="text-xs font-bold text-gray-900 bg-white px-2 py-0.5 rounded-md shadow-sm border border-gray-100">
                  {progress.pointsToNext.toLocaleString()} ₽
                </span>
              </div>
              <div className="h-2.5 w-full bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default QRCodeOverlay;
