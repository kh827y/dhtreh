"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, RefreshCw, Copy, Check, ScanLine } from "lucide-react";
import QrCanvas from "./QrCanvas";
import { getTelegramWebApp } from "../lib/telegram";

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
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const qrSlotRef = useRef<HTMLDivElement | null>(null);
  const refreshRef = useRef<HTMLDivElement | null>(null);
  const [qrSlot, setQrSlot] = useState<{ width: number; height: number } | null>(null);
  const [refreshWidth, setRefreshWidth] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setIsCopied(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const tg = getTelegramWebApp();
    const readViewport = () => {
      const tgAny = tg as unknown as { viewportHeight?: number; viewportWidth?: number } | null;
      const height =
        typeof tgAny?.viewportHeight === "number"
          ? tgAny.viewportHeight
          : typeof window !== "undefined"
            ? window.visualViewport?.height ?? window.innerHeight
            : 0;
      const width =
        typeof tgAny?.viewportWidth === "number"
          ? tgAny.viewportWidth
          : typeof window !== "undefined"
            ? window.visualViewport?.width ?? window.innerWidth
            : 0;
      if (height && width) {
        setViewport({ height: Math.round(height), width: Math.round(width) });
      }
    };
    readViewport();
    const onResize = () => readViewport();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    tg?.onEvent?.("viewportChanged", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      tg?.offEvent?.("viewportChanged", onResize);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const node = qrSlotRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setQrSlot({ width: Math.round(width), height: Math.round(height) });
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const node = refreshRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width } = entry.contentRect;
      if (width > 0) {
        setRefreshWidth(Math.round(width));
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [isOpen]);

  const layout = useMemo(() => {
    const height = viewport?.height ?? 0;
    const width = viewport?.width ?? 0;
    const tight = height > 0 && height < 560;
    const compact = height > 0 && height < 640;
    const outerPadding = tight ? 12 : 16;
    const cardWidth = width > 0 ? Math.max(0, Math.min(width - outerPadding * 2, 360)) : 360;
    const cardHeight = height > 0 ? Math.max(0, height - outerPadding * 2) : null;
    const contentPadding = compact ? 16 : 20;
    const widthLimit = cardWidth > 0 ? Math.max(0, Math.floor(cardWidth - contentPadding * 2)) : 0;
    const fallbackMax = compact ? (tight ? 200 : 230) : 256;
    const maxQrSize = widthLimit > 0 ? widthLimit : fallbackMax;
    const minQrSize = compact ? (tight ? 96 : 120) : 150;
    let ratio = compact ? 0.38 : 0.42;
    if (showManualCode) ratio -= 0.04;
    if (progress) ratio -= 0.02;
    if (showMaxLevelMessage) ratio -= 0.015;
    if (tight) ratio -= 0.03;
    ratio = Math.max(0.26, ratio);
    return {
      compact,
      tight,
      outerPadding,
      minQrSize,
      maxQrSize,
      ratio,
      cardHeight,
    };
  }, [viewport, progress, showMaxLevelMessage, showManualCode]);

  const inlineStats = useMemo(() => {
    if (layout.tight) return true;
    const slotHeight = qrSlot?.height ?? 0;
    return slotHeight > 0 && slotHeight < 140;
  }, [layout.tight, qrSlot]);

  const qrSize = useMemo(() => {
    const slotSize = qrSlot ? Math.min(qrSlot.width, qrSlot.height) : 0;
    const maxSize = layout.maxQrSize > 0 ? layout.maxQrSize : 0;
    const buttonLimit = refreshWidth ?? 0;
    if (slotSize > 0) {
      const baseSize = Math.min(maxSize || slotSize, slotSize);
      const size = buttonLimit > 0 ? Math.min(baseSize, buttonLimit) : baseSize;
      const clamped = slotSize < layout.minQrSize ? size : Math.max(layout.minQrSize, size);
      return Math.round(clamped);
    }
    const baseHeight = layout.cardHeight ?? 0;
    const targetSize = baseHeight > 0 ? Math.floor(baseHeight * layout.ratio) : maxSize;
    const baseFallback = Math.max(layout.minQrSize, Math.min(maxSize || targetSize, targetSize));
    const fallback = buttonLimit > 0 ? Math.min(baseFallback, buttonLimit) : baseFallback;
    return Math.round(fallback);
  }, [qrSlot, refreshWidth, layout]);

  const refreshLabel = useMemo(() => {
    const base = layout.compact ? "Обновить" : "Обновить код";
    if (qrTimeLeft != null && qrTimeLeft > 0) {
      return `${base} · ${qrTimeLeft}с`;
    }
    return base;
  }, [layout.compact, qrTimeLeft]);

  const statsLabelClass = `uppercase text-gray-400 font-bold tracking-wider ${layout.tight ? "text-[10px]" : "text-[11px]"}`;
  const statsValueClass = layout.tight ? "text-[17px]" : layout.compact ? "text-lg" : "text-xl";
  const dense = layout.tight || (qrSlot?.height != null && qrSlot.height < 170);
  const contentGapClass = dense
    ? showManualCode
      ? "gap-1"
      : "gap-2"
    : layout.compact
      ? showManualCode
        ? "gap-2"
        : "gap-3"
      : showManualCode
        ? "gap-3"
        : "gap-4";

  const handleCopyCode = (code: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code.replace(/\s+/g, ""));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center"
      style={{
        padding: layout.outerPadding,
        paddingTop: `calc(${layout.outerPadding}px + env(safe-area-inset-top, 0px))`,
        paddingBottom: `calc(${layout.outerPadding}px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      <div
        className="fixed inset-0 bg-gray-900/40 backdrop-blur-xl transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div
        className="relative z-10 w-full max-w-[360px] h-full bg-white rounded-[32px] shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 overflow-hidden flex flex-col"
      >
        <div className={`relative px-6 text-center ${layout.tight ? "pt-3 pb-1" : layout.compact ? "pt-4 pb-1" : "pt-6 pb-2"}`}>
          <button
            onClick={onClose}
            className={`absolute ${layout.tight ? "top-3 right-3" : layout.compact ? "top-4 right-4" : "top-6 right-6"} w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors z-20`}
          >
            <X size={20} />
          </button>

          <h2
            className={`font-extrabold text-gray-900 tracking-tight truncate px-8 ${
              layout.tight ? "text-xl" : layout.compact ? "text-[22px]" : "text-2xl"
            }`}
          >
            {name}
          </h2>
          <div className="inline-flex items-center space-x-1 mt-1">
            <span className={`${layout.tight ? "text-xs" : "text-sm"} font-medium text-gray-400`}>Статус:</span>
            <span className={`${layout.tight ? "text-xs" : "text-sm"} font-bold text-blue-600 uppercase tracking-wide`}>
              {levelName || "—"}
            </span>
          </div>
        </div>

        <div
          className={`flex-1 min-h-0 flex flex-col items-center justify-start ${layout.compact ? "px-4 pb-3 pt-2" : "px-5 pb-4 pt-3"} ${contentGapClass} overflow-y-auto hide-scrollbar`}
        >
          <div
            ref={qrSlotRef}
            className="relative w-full flex-1 min-h-0 flex items-center justify-center"
          >
            <ScanLine
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-900 opacity-[0.03]"
              style={{ width: Math.round(qrSize * 0.6), height: Math.round(qrSize * 0.6) }}
            />
            {qrToken && !qrLoading ? (
              <QrCanvas value={qrToken} size={qrSize} />
            ) : (
              <div
                className="rounded-lg bg-gray-100"
                style={{ width: qrSize, height: qrSize }}
              />
            )}
          </div>

          {showManualCode && manualCode ? (
            <button
              onClick={() => handleCopyCode(manualCode)}
              className={`flex items-center space-x-2.5 rounded-xl hover:bg-gray-50 transition-colors group ${
                dense ? "px-3 py-1" : "px-4 py-2"
              }`}
            >
              <span
                className={`font-mono font-bold text-gray-800 tracking-widest truncate ${
                  layout.tight ? "text-[15px] max-w-[160px]" : layout.compact ? "text-[17px] max-w-[200px]" : "text-[19px] max-w-[220px]"
                }`}
              >
                {manualCode}
              </span>
              {isCopied ? (
                <Check size={18} className="text-green-500 shrink-0" />
              ) : (
                <Copy size={18} className="text-gray-300 group-hover:text-blue-500 transition-colors shrink-0" />
              )}
            </button>
          ) : null}

          <div className="w-full max-w-[280px]" ref={refreshRef}>
            <button
              onClick={onRefresh}
              className={`w-full relative overflow-hidden bg-gray-900 text-white rounded-2xl font-semibold flex items-center justify-center space-x-2.5 active:scale-[0.98] transition-all shadow-lg shadow-gray-200 ${
                layout.tight ? "h-10 text-[14px]" : layout.compact ? "h-11 text-[15px]" : "h-[52px] text-[17px]"
              }`}
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
                size={layout.tight ? 16 : 18}
                className={qrRefreshing || (qrTimeLeft != null && qrTimeLeft < 10) ? "animate-spin text-blue-400" : "text-gray-400"}
              />
              <span>{refreshLabel}</span>
            </button>
            {qrError ? <div className="mt-2 text-center text-xs text-red-500">{qrError}</div> : null}
          </div>
        </div>

        <div className="bg-[#F9F9FB] border-t border-gray-100">
          <div className="grid grid-cols-2 divide-x divide-gray-200 border-b border-gray-200">
            <div
              className={`${layout.compact ? "p-3" : "p-4"} ${
                inlineStats
                  ? "flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
                  : "flex flex-col items-center"
              }`}
            >
              <span className={`${statsLabelClass} ${inlineStats ? "" : "mb-1"}`}>Баланс</span>
              <span className={`${statsValueClass} font-black text-gray-900`}>
                {balance != null ? balance.toLocaleString() : "—"} Б
              </span>
            </div>
            <div
              className={`${layout.compact ? "p-3" : "p-4"} ${
                inlineStats
                  ? "flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
                  : "flex flex-col items-center"
              }`}
            >
              <span className={`${statsLabelClass} ${inlineStats ? "" : "mb-1"}`}>Кэшбэк</span>
              <span className={`${statsValueClass} font-black text-blue-600`}>
                {cashbackPercent != null ? cashbackPercent : "—"}%
              </span>
            </div>
          </div>

          {showMaxLevelMessage ? (
            <div className={`${layout.compact ? "p-3 pt-2" : "p-5 pt-4"} text-center`}>
              <span className={`${layout.tight ? "text-[13px]" : "text-sm"} font-semibold text-gray-700`}>
                У вас максимальный уровень!
              </span>
            </div>
          ) : progress ? (
            <div className={`${layout.compact ? "p-3 pt-2" : "p-5 pt-4"}`}>
              <div className={`flex justify-between items-end ${layout.tight ? "mb-1" : "mb-2"}`}>
                <span className={`${layout.tight ? "text-[10px]" : "text-xs"} font-semibold text-gray-500`}>
                  До статуса <span className="text-gray-900">{progress.nextLevelName}</span>
                </span>
                <span
                  className={`${
                    layout.tight ? "text-[10px]" : "text-xs"
                  } font-bold text-gray-900 bg-white px-2 py-0.5 rounded-md shadow-sm border border-gray-100`}
                >
                  {progress.pointsToNext.toLocaleString()} ₽
                </span>
              </div>
              <div className={`${layout.tight ? "h-2" : "h-2.5"} w-full bg-gray-200 rounded-full overflow-hidden`}>
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
