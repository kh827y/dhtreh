"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { MessageSquareHeart, Send, Star, X } from "lucide-react";
import Toast from "./Toast";
import {
  submitReview,
  transactions,
  dismissReviewPrompt,
  type ReviewsShareSettings,
  type SubmitReviewShareOption,
} from "../lib/api";
import { useMiniappAuthContext } from "../lib/MiniappAuthContext";
import { getTelegramWebApp } from "../lib/telegram";
import {
  REVIEW_LOOKBACK_MS,
  parseDateMs,
  isPurchaseTransaction,
  type TransactionItem,
} from "../lib/reviewUtils";
import { subscribeToLoyaltyEvents } from "../lib/loyaltyEvents";
import { useDelayedRender } from "../lib/useDelayedRender";

const REVIEW_PLATFORM_LABELS: Record<string, string> = {
  yandex: "Яндекс.Карты",
  twogis: "2ГИС",
  google: "Google",
};

type ToastState = { msg: string; type: "success" | "error" } | null;

type SubmitResponseShare = {
  enabled: boolean;
  threshold: number;
  options: Array<{ id: string; url: string }>;
} | null;

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function mapTransactions(
  items: Array<{
    id: string;
    type: string;
    amount: number;
    createdAt: string;
    orderId?: string | null;
    receiptTotal?: number | null;
    redeemApplied?: number | null;
    outletId?: string | null;
    staffId?: string | null;
    reviewId?: string | null;
    reviewRating?: number | null;
    reviewCreatedAt?: string | null;
    source?: string | null;
    canceledAt?: string | null;
    earnAmount?: number | null;
    redeemAmount?: number | null;
  }>,
): TransactionItem[] {
  const mapped = items
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: item.id,
      type: item.type,
      amount: item.amount,
      createdAt: item.createdAt,
      orderId: item.orderId ?? null,
      receiptTotal:
        typeof item.receiptTotal === "number" && Number.isFinite(item.receiptTotal)
          ? item.receiptTotal
          : null,
      redeemApplied:
        typeof item.redeemApplied === "number" && Number.isFinite(item.redeemApplied)
          ? item.redeemApplied
          : null,
      outletId: item.outletId ?? null,
      staffId: item.staffId ?? null,
      reviewId: item.reviewId ?? null,
      reviewRating: typeof item.reviewRating === "number" ? item.reviewRating : null,
      reviewCreatedAt: item.reviewCreatedAt ?? null,
      reviewDismissedAt: item.reviewDismissedAt ?? null,
      source:
        typeof item.source === "string" && item.source.trim().length > 0
          ? item.source.trim()
          : null,
      canceledAt:
        typeof item.canceledAt === "string" && item.canceledAt.trim().length > 0
          ? item.canceledAt.trim()
          : null,
      earnAmount:
        typeof item.earnAmount === "number" && Number.isFinite(item.earnAmount)
          ? item.earnAmount
          : null,
      redeemAmount:
        typeof item.redeemAmount === "number" && Number.isFinite(item.redeemAmount)
          ? item.redeemAmount
          : null,
    }));
  const grouped: TransactionItem[] = [];
  const refundGroups = new Map<string, { restore: number; revoke: number; base: TransactionItem }>();

  for (const item of mapped) {
    const typeUpper = (item.type || "").toUpperCase();
    if (typeUpper === "REFUND" && item.orderId) {
      const key = `${item.orderId}:${item.relatedOperationAt ?? ""}`;
      const current = refundGroups.get(key) ?? { restore: 0, revoke: 0, base: item };
      const amt = Number(item.amount ?? 0);
      if (amt > 0) current.restore += amt;
      else if (amt < 0) current.revoke += Math.abs(amt);
      if (new Date(item.createdAt).getTime() > new Date(current.base.createdAt).getTime()) {
        current.base = item;
      }
      refundGroups.set(key, current);
      continue;
    }
    grouped.push(item);
  }

  for (const [, group] of refundGroups) {
    grouped.push({
      ...group.base,
      amount: group.restore - group.revoke,
      earnAmount: group.restore > 0 ? group.restore : null,
      redeemAmount: group.revoke > 0 ? group.revoke : null,
    });
  }

  grouped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return grouped.filter((item) => !item.canceledAt);
}

function computeShareOptions(share: ReviewsShareSettings, activeOutletId: string | null) {
  if (!share || !share.enabled) return [] as Array<{ id: string; url: string }>;
  if (!activeOutletId) return [] as Array<{ id: string; url: string }>;
  const result: Array<{ id: string; url: string }> = [];
  for (const platform of share.platforms || []) {
    if (!platform || typeof platform !== "object" || !platform.enabled) continue;
    const outlets = Array.isArray(platform.outlets) ? platform.outlets : [];
    const outletMatch = outlets.find(
      (item) => item && item.outletId === activeOutletId && typeof item.url === "string" && item.url.trim(),
    );
    if (!outletMatch) continue;
    result.push({ id: platform.id, url: outletMatch.url.trim() });
  }
  return result;
}

export function FeedbackManager() {
  const auth = useMiniappAuthContext();
  const merchantId = auth.merchantId;
  const customerId = auth.customerId;
  const reviewsEnabled = auth.reviewsEnabled !== false;
  const [transactionsList, setTransactionsList] = useState<TransactionItem[]>([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackTxId, setFeedbackTxId] = useState<string | null>(null);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackStage, setFeedbackStage] = useState<"form" | "share">("form");
  const [sharePrompt, setSharePrompt] = useState<SubmitResponseShare>(null);
  const [shareOptions, setShareOptions] = useState<Array<{ id: string; url: string }>>([]);
  const [toast, setToast] = useState<ToastState>(null);
  const [dismissedTransactions, setDismissedTransactions] = useState<string[]>([]);
  const [dismissedReady, setDismissedReady] = useState(false);
  const feedbackPresence = useDelayedRender(feedbackOpen, 320);
  const [preferredTxId, setPreferredTxId] = useState<string | null>(null);

  const dismissedTxSet = useMemo(() => new Set(dismissedTransactions), [dismissedTransactions]);

  const loadTransactions = useCallback(async (opts?: { fresh?: boolean }) => {
    if (!merchantId || !customerId) return;
    try {
      const response = await transactions(merchantId, customerId, 20, undefined, { fresh: opts?.fresh });
      setTransactionsList(mapTransactions(response.items as TransactionItem[]));
    } catch (error) {
      setToast({ msg: `Не удалось обновить историю: ${resolveErrorMessage(error)}`, type: "error" });
    }
  }, [merchantId, customerId]);

  const persistDismissedTransaction = useCallback(
    async (transactionId: string) => {
      if (!transactionId || !merchantId || !customerId) return;
      try {
        await dismissReviewPrompt(merchantId, customerId, transactionId);
      } catch {
        // игнорируем сбои сохранения скрытия, это не должно блокировать UI
      }
    },
    [merchantId, customerId],
  );

  useEffect(() => {
    if (!customerId) return;
    void loadTransactions();
  }, [customerId, loadTransactions]);

  useEffect(() => {
    if (!reviewsEnabled && feedbackOpen) {
      setFeedbackOpen(false);
    }
  }, [reviewsEnabled, feedbackOpen]);

  useEffect(() => {
    if (!dismissedReady) return;
    try {
      localStorage.setItem("miniapp.dismissedTransactions", JSON.stringify(dismissedTransactions));
    } catch {
      // ignore
    }
  }, [dismissedTransactions, dismissedReady]);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const saved = localStorage.getItem("miniapp.dismissedTransactions");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setDismissedTransactions(parsed.filter((id) => typeof id === "string"));
        }
      }
    } catch {
      setDismissedTransactions([]);
    } finally {
      setDismissedReady(true);
    }
  }, []);

  useEffect(() => {
    if (!dismissedReady) return;
    if (!transactionsList.length) return;
    const ratedIds = transactionsList.filter((item) => item.reviewId).map((item) => item.id);
    if (!ratedIds.length) return;
    setDismissedTransactions((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ratedIds) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? Array.from(next) : prev;
    });
  }, [transactionsList, dismissedReady]);

  useEffect(() => {
    if (!dismissedReady) return;
    const remotelyDismissed = transactionsList
      .filter((item) => item.reviewDismissedAt)
      .map((item) => item.id);
    if (!remotelyDismissed.length) return;
    setDismissedTransactions((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of remotelyDismissed) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? Array.from(next) : prev;
    });
  }, [transactionsList, dismissedReady]);

  const isEligiblePurchaseTx = useCallback(
    (item: TransactionItem): boolean => {
      if (!reviewsEnabled) return false;
      const createdAtMs = parseDateMs(item.createdAt);
      if (createdAtMs == null) return false;
      if (Date.now() - createdAtMs > REVIEW_LOOKBACK_MS) return false;
      if (!isPurchaseTransaction(item.type, item.orderId)) return false;
      if (!item.outletId && !item.staffId) return false;
      if (item.reviewId) return false;
      if (item.reviewDismissedAt) return false;
      if (dismissedTxSet.has(item.id)) return false;
      return true;
    },
    [dismissedTxSet, reviewsEnabled],
  );

  useEffect(() => {
    if (!dismissedReady) return;
    if (feedbackOpen) return;
    if (!reviewsEnabled) return;
    let candidate: TransactionItem | null = null;
    if (preferredTxId) {
      const preferred = transactionsList.find((item) => item.id === preferredTxId) ?? null;
      if (preferred && isEligiblePurchaseTx(preferred)) {
        candidate = preferred;
      }
    }
    if (!candidate) {
      const latest = transactionsList.reduce<{ item: TransactionItem | null; ts: number }>(
        (acc, item) => {
          const ts = parseDateMs(item.createdAt) ?? 0;
          return ts > acc.ts ? { item, ts } : acc;
        },
        { item: null, ts: 0 },
      ).item;
      if (latest && isEligiblePurchaseTx(latest)) {
        candidate = latest;
      }
    }
    if (candidate) {
      setPreferredTxId(null);
      setFeedbackTxId(candidate.id);
      setFeedbackRating(0);
      setFeedbackComment("");
      setFeedbackStage("form");
      setSharePrompt(null);
      setFeedbackOpen(true);
    } else if (!transactionsList.length) {
      setFeedbackTxId(null);
    }
  }, [transactionsList, dismissedReady, feedbackOpen, isEligiblePurchaseTx, preferredTxId, reviewsEnabled]);

  const activeTransaction = useMemo(() => {
    if (!feedbackTxId) return null;
    return transactionsList.find((item) => item.id === feedbackTxId) ?? null;
  }, [feedbackTxId, transactionsList]);

  const activeOutletId = activeTransaction?.outletId ?? null;

  useEffect(() => {
    if (sharePrompt?.options?.length) {
      setShareOptions(sharePrompt.options);
      return;
    }
    setShareOptions(computeShareOptions(auth.shareSettings, activeOutletId));
  }, [sharePrompt, auth.shareSettings, activeOutletId]);

  const handleShareClick = useCallback((url: string) => {
    if (!url) return;
    const tg = getTelegramWebApp();
    const isTelegramLink = (() => {
      try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        return parsed.protocol === "tg:" || host === "t.me" || host === "telegram.me";
      } catch {
        return url.startsWith("tg://");
      }
    })();
    try {
      if (isTelegramLink && tg?.openTelegramLink) {
        tg.openTelegramLink(url);
        return;
      }
      if (tg?.openLink) {
        tg.openLink(url);
        return;
      }
    } catch {
      // ignore
    }
    try {
      if (typeof window !== "undefined") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      // ignore
    }
  }, []);

  const resetFeedbackState = useCallback(() => {
    setFeedbackOpen(false);
    setFeedbackTxId(null);
    setFeedbackComment("");
    setFeedbackRating(0);
    setFeedbackStage("form");
    setSharePrompt(null);
  }, []);

  const handleFeedbackClose = useCallback(() => {
    if (feedbackTxId) {
      const dismissedAt = new Date().toISOString();
      setDismissedTransactions((prev) => (prev.includes(feedbackTxId) ? prev : [...prev, feedbackTxId]));
      setTransactionsList((prev) =>
        prev.map((item) =>
          item.id === feedbackTxId && !item.reviewDismissedAt ? { ...item, reviewDismissedAt: dismissedAt } : item,
        ),
      );
      void persistDismissedTransaction(feedbackTxId);
    }
    resetFeedbackState();
  }, [feedbackTxId, resetFeedbackState, persistDismissedTransaction]);

  const handleFeedbackSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (feedbackStage === "share") {
        handleFeedbackClose();
        return;
      }
      if (!feedbackRating) {
        setToast({ msg: "Поставьте оценку", type: "error" });
        return;
      }
      if (!merchantId || !customerId) {
        setToast({ msg: "Не удалось определить клиента", type: "error" });
        return;
      }
      const activeTx = feedbackTxId
        ? transactionsList.find((item) => item.id === feedbackTxId) ?? null
        : null;
      try {
        setFeedbackSubmitting(true);
        const response = await submitReview({
          merchantId,
          customerId,
          rating: feedbackRating,
          comment: feedbackComment,
          orderId: activeTx?.orderId ?? null,
          transactionId: feedbackTxId,
          outletId: activeTx?.outletId ?? null,
          staffId: activeTx?.staffId ?? null,
        });
        if (feedbackTxId) {
          setDismissedTransactions((prev) => (prev.includes(feedbackTxId) ? prev : [...prev, feedbackTxId]));
          setTransactionsList((prev) =>
            prev.map((item) =>
              item.id === feedbackTxId
                ? {
                    ...item,
                    reviewId: response.reviewId,
                    reviewRating: feedbackRating,
                    reviewCreatedAt: new Date().toISOString(),
                  }
                : item,
            ),
          );
        }
        setToast({ msg: response.message || "Спасибо за отзыв!", type: "success" });
        void loadTransactions();
        let resolvedShare: SubmitResponseShare = null;
        const rawShare = response.share;
        if (rawShare !== undefined) {
          if (rawShare && typeof rawShare === "object") {
            const threshold =
              typeof rawShare.threshold === "number" && rawShare.threshold >= 1 && rawShare.threshold <= 5
                ? Math.round(rawShare.threshold)
                : auth.shareSettings?.threshold ?? 5;
            const options = Array.isArray(rawShare.options)
              ? rawShare.options
                  .filter((opt): opt is SubmitReviewShareOption => {
                    if (!opt) return false;
                    if (typeof opt.id !== "string" || typeof opt.url !== "string") return false;
                    return opt.id.trim().length > 0 && opt.url.trim().length > 0;
                  })
                  .map((opt) => ({ id: opt.id.trim(), url: opt.url.trim() }))
              : [];
            resolvedShare = {
              enabled: Boolean(rawShare.enabled),
              threshold,
              options,
            };
          } else if (rawShare === null) {
            resolvedShare = {
              enabled: false,
              threshold: auth.shareSettings?.threshold ?? 5,
              options: [],
            };
          }
        }
        setSharePrompt(resolvedShare);
        const fallbackOptions = computeShareOptions(auth.shareSettings, activeOutletId);
        const effectiveThreshold = resolvedShare?.threshold ?? auth.shareSettings?.threshold ?? 5;
        const effectiveEnabled = resolvedShare ? resolvedShare.enabled : Boolean(auth.shareSettings?.enabled);
        const hasOptions = resolvedShare ? resolvedShare.options.length > 0 : fallbackOptions.length > 0;
        if (effectiveEnabled && feedbackRating >= effectiveThreshold && hasOptions) {
          setFeedbackStage("share");
        } else {
          resetFeedbackState();
        }
      } catch (error) {
        setToast({ msg: resolveErrorMessage(error), type: "error" });
      } finally {
        setFeedbackSubmitting(false);
      }
    },
    [
      feedbackStage,
      feedbackRating,
      merchantId,
      customerId,
      feedbackTxId,
      transactionsList,
      feedbackComment,
      loadTransactions,
      auth.shareSettings,
      activeOutletId,
      resetFeedbackState,
      handleFeedbackClose,
    ],
  );

  useEffect(() => {
    const unsubscribe = subscribeToLoyaltyEvents((payload) => {
      if (!payload || typeof payload !== "object") return;
      const data = payload as Record<string, unknown>;
      const eventMerchant = data.merchantId ? String(data.merchantId) : "";
      if (eventMerchant && eventMerchant !== merchantId) return;
      const eventMc =
        data.customerId
          ? String(data.customerId)
          : data.merchantCustomerId
            ? String(data.merchantCustomerId)
            : "";
      if (eventMc && eventMc !== customerId) return;

      const transactionTypeRaw = typeof data.transactionType === "string" ? data.transactionType : null;
      const fallbackType = typeof data.type === "string" ? data.type : null;
      const declaredType = typeof data.eventType === "string" ? data.eventType : null;
      const tokens = [transactionTypeRaw, fallbackType, declaredType]
        .filter((token): token is string => typeof token === "string" && token.length > 0)
        .map((token) => token.toLowerCase());
      if (!tokens.length) return;

      const blockedTokens = [
        "refund",
        "return",
        "adjust",
        "complimentary",
        "referral",
        "burn",
        "bonus",
        "gift",
        "promo",
        "campaign",
        "birthday",
      ];
      if (tokens.some((token) => blockedTokens.some((blocked) => token.includes(blocked)))) {
        return;
      }

      // Реагируем только на начисления/списания по покупке (transactionType EARN/REDEEM/COMMIT или явные purchase-хинты).
      const allowedKinds = ["earn", "redeem", "commit"];
      const hintedPurchase = tokens.some((token) => token.includes("purchase") || token.includes("order"));
      const isLoyaltyKind = tokens.some((token) => allowedKinds.some((allowed) => token.includes(allowed)));
      if (!hintedPurchase && !isLoyaltyKind) {
        return;
      }

      const txId =
        typeof data.transactionId === "string"
          ? data.transactionId
          : typeof data.id === "string"
            ? data.id
            : null;
      setPreferredTxId(txId || null);
      void loadTransactions({ fresh: true });
    }, merchantId && customerId ? { merchantId, customerId } : undefined);
    return () => {
      unsubscribe();
    };
  }, [merchantId, customerId, loadTransactions]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadTransactions({ fresh: true });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadTransactions]);

  const toastElement = toast ? <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} /> : null;

  if (!feedbackPresence.shouldRender) {
    return toastElement;
  }

  const overlayClass =
    feedbackPresence.status === "entered"
      ? "opacity-100"
      : "opacity-0";
  const cardClass =
    feedbackPresence.status === "entered"
      ? "opacity-100 translate-y-0 scale-100"
      : "opacity-0 translate-y-2 scale-95";

  const renderPlatformBadge = (id: string) => {
    const normalized = id.toLowerCase();
    if (normalized === "yandex") {
      return <span className="text-red-500 font-bold">Я</span>;
    }
    if (normalized === "twogis" || normalized === "2gis") {
      return <span className="text-green-500 font-extrabold">2</span>;
    }
    if (normalized === "google") {
      return <span className="text-blue-500 font-bold">G</span>;
    }
    return null;
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 safe-area-bottom">
        <div
          className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${overlayClass}`}
          onClick={handleFeedbackClose}
        />

        <form
          className={`relative z-10 w-full max-w-[340px] bg-white rounded-[28px] shadow-2xl transition-all duration-300 overflow-hidden flex flex-col p-6 ${cardClass}`}
          onClick={(event) => event.stopPropagation()}
          onSubmit={handleFeedbackSubmit}
        >
          <button
            type="button"
            onClick={handleFeedbackClose}
            className="absolute top-4 right-4 w-8 h-8 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors z-20"
            aria-label="Закрыть окно оценки"
          >
            <X size={18} />
          </button>

          {feedbackStage === "form" ? (
            <div className="flex flex-col items-center text-center animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="w-14 h-14 bg-yellow-50 rounded-full flex items-center justify-center mb-4 text-yellow-500">
                <Star fill="currentColor" size={28} />
              </div>

              <h2 className="text-xl font-bold text-gray-900 mb-2">Оцените визит</h2>
              <p className="text-sm text-gray-500 mb-6">Как вам обслуживание и качество?</p>

              <div className="flex space-x-2 mb-6" role="radiogroup" aria-label="Оценка визита">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFeedbackRating(value)}
                    className="transition-transform active:scale-90 focus:outline-none"
                    role="radio"
                    aria-checked={feedbackRating >= value}
                    aria-label={`Оценка ${value}`}
                  >
                    <Star
                      size={36}
                      className={`${
                        feedbackRating >= value ? "text-yellow-400 fill-yellow-400" : "text-gray-200"
                      } transition-colors duration-200`}
                      strokeWidth={feedbackRating >= value ? 0 : 1.5}
                    />
                  </button>
                ))}
              </div>

              <textarea
                placeholder="Расскажите подробнее (необязательно)"
                value={feedbackComment}
                onChange={(event) => setFeedbackComment(event.currentTarget.value)}
                className="w-full bg-gray-50 rounded-xl p-3 text-sm text-gray-900 placeholder-gray-400 resize-none outline-none focus:ring-2 focus:ring-blue-100 transition-all mb-4 h-24"
              />

              <button
                type="submit"
                disabled={feedbackRating === 0 || feedbackSubmitting}
                className={`w-full py-3.5 rounded-xl font-semibold text-[17px] flex items-center justify-center space-x-2 transition-all active:scale-[0.98] ${
                  feedbackRating > 0
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
                aria-busy={feedbackSubmitting || undefined}
              >
                {feedbackSubmitting ? (
                  <span className="animate-pulse">Отправка...</span>
                ) : (
                  <>
                    <span>Отправить</span>
                    <Send size={18} />
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4 text-red-500">
                <MessageSquareHeart fill="currentColor" size={32} />
              </div>

              <h2 className="text-xl font-bold text-gray-900 mb-2">Спасибо за оценку!</h2>
              <p className="text-[15px] text-gray-500 leading-relaxed mb-6">
                Мы очень рады, что вам понравилось. Пожалуйста, поделитесь впечатлениями в картах — это очень поможет нам.
              </p>

              <div className="w-full space-y-3">
                {shareOptions.map((platform) => (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => handleShareClick(platform.url)}
                    className="w-full bg-[#F2F2F7] hover:bg-gray-200 text-gray-900 py-3 rounded-xl font-medium text-[15px] flex items-center justify-center space-x-2 transition-colors active:scale-[0.98]"
                  >
                    {renderPlatformBadge(platform.id)}
                    <span>{REVIEW_PLATFORM_LABELS[platform.id] || platform.id}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleFeedbackClose}
                className="mt-4 text-gray-400 text-sm font-medium p-2 hover:text-gray-600 transition-colors"
                aria-busy={feedbackSubmitting || undefined}
              >
                Закрыть
              </button>
            </div>
          )}
        </form>
      </div>
      {toastElement}
    </>
  );
}
