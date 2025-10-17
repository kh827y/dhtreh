"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Toast from "./Toast";
import styles from "../app/page.module.css";
import {
  submitReview,
  transactions,
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
    outletId?: string | null;
    staffId?: string | null;
    reviewId?: string | null;
    reviewRating?: number | null;
    reviewCreatedAt?: string | null;
    source?: string | null;
    canceledAt?: string | null;
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
      outletId: item.outletId ?? null,
      staffId: item.staffId ?? null,
      reviewId: item.reviewId ?? null,
      reviewRating: typeof item.reviewRating === "number" ? item.reviewRating : null,
      reviewCreatedAt: item.reviewCreatedAt ?? null,
      source:
        typeof item.source === "string" && item.source.trim().length > 0
          ? item.source.trim()
          : null,
      canceledAt:
        typeof item.canceledAt === "string" && item.canceledAt.trim().length > 0
          ? item.canceledAt.trim()
          : null,
    }));
  return mapped.filter((item) => !item.canceledAt);
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
  const merchantCustomerId = auth.merchantCustomerId;
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

  const dismissedTxSet = useMemo(() => new Set(dismissedTransactions), [dismissedTransactions]);

  const loadTransactions = useCallback(async () => {
    if (!merchantId || !merchantCustomerId) return;
    try {
      const response = await transactions(merchantId, merchantCustomerId, 20);
      setTransactionsList(mapTransactions(response.items as TransactionItem[]));
    } catch (error) {
      setToast({ msg: `Не удалось обновить историю: ${resolveErrorMessage(error)}`, type: "error" });
    }
  }, [merchantId, merchantCustomerId]);

  useEffect(() => {
    if (!merchantCustomerId) return;
    void loadTransactions();
  }, [merchantCustomerId, loadTransactions]);

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

  const isEligiblePurchaseTx = useCallback(
    (item: TransactionItem): boolean => {
      const createdAtMs = parseDateMs(item.createdAt);
      if (createdAtMs == null) return false;
      if (Date.now() - createdAtMs > REVIEW_LOOKBACK_MS) return false;
      if (!isPurchaseTransaction(item.type, item.orderId)) return false;
      if (!item.outletId && !item.staffId) return false;
      if (item.reviewId) return false;
      if (dismissedTxSet.has(item.id)) return false;
      return true;
    },
    [dismissedTxSet],
  );

  useEffect(() => {
    if (!dismissedReady) return;
    if (feedbackOpen) return;
    const latest = transactionsList.reduce<{ item: TransactionItem | null; ts: number }>(
      (acc, item) => {
        const ts = parseDateMs(item.createdAt) ?? 0;
        return ts > acc.ts ? { item, ts } : acc;
      },
      { item: null, ts: 0 },
    ).item;
    const candidate = latest && isEligiblePurchaseTx(latest) ? latest : null;
    if (candidate) {
      setFeedbackTxId(candidate.id);
      setFeedbackRating(0);
      setFeedbackComment("");
      setFeedbackStage("form");
      setSharePrompt(null);
      setFeedbackOpen(true);
    } else {
      setFeedbackTxId(null);
    }
  }, [transactionsList, dismissedReady, feedbackOpen, isEligiblePurchaseTx]);

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
    try {
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(url);
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
      setDismissedTransactions((prev) => (prev.includes(feedbackTxId) ? prev : [...prev, feedbackTxId]));
    }
    resetFeedbackState();
  }, [feedbackTxId, resetFeedbackState]);

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
      if (!merchantId || !merchantCustomerId) {
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
          merchantCustomerId,
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
      merchantCustomerId,
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
    if (!merchantId || !merchantCustomerId) return;
    const unsubscribe = subscribeToLoyaltyEvents((payload) => {
      if (!payload || typeof payload !== "object") return;
      const data = payload as Record<string, unknown>;
      const eventMerchant = data.merchantId ? String(data.merchantId) : "";
      if (eventMerchant && eventMerchant !== merchantId) return;
      const eventMc = data.merchantCustomerId ? String(data.merchantCustomerId) : "";
      const eventCustomer = data.customerId ? String(data.customerId) : "";
      if (eventMc && eventMc !== merchantCustomerId) return;
      // Back-compat: if merchantCustomerId not provided in event, we cannot reliably compare against global customerId; skip filter
      const typeRaw = data.type ?? data.eventType;
      if (typeRaw) {
        const eventType = String(typeRaw).toLowerCase();
        if (
          !eventType.includes("commit") &&
          !eventType.includes("redeem") &&
          !eventType.includes("earn")
        ) {
          return;
        }
      }
      void loadTransactions();
    });
    return () => {
      unsubscribe();
    };
  }, [merchantId, merchantCustomerId, loadTransactions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!merchantCustomerId) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      void loadTransactions();
    }, 20000);
    return () => {
      window.clearInterval(interval);
    };
  }, [merchantCustomerId, loadTransactions]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadTransactions();
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

  return (
    <>
      <div
        className={`${styles.modalBackdrop} ${styles.modalBackdropTop} ${
          feedbackPresence.status === "entered" ? styles.modalBackdropVisible : styles.modalBackdropLeaving
        }`}
        onClick={handleFeedbackClose}
      >
        <form
          className={`${styles.sheet} ${styles.feedbackSheet} ${styles.sheetAnimated} ${
            feedbackPresence.status === "entered" ? styles.sheetEntering : styles.sheetLeaving
          }`}
          onClick={(event) => event.stopPropagation()}
          onSubmit={handleFeedbackSubmit}
        >
          <button
            type="button"
            className={styles.feedbackClose}
            onClick={handleFeedbackClose}
            aria-label="Закрыть окно оценки"
          >
            ✕
          </button>
          <div className={styles.feedbackHeader}>
            <div className={styles.feedbackTitle}>
              {feedbackStage === "share" ? "Отзыв отправлен!" : "Оцените визит."}
            </div>
            <div className={styles.feedbackSubtitle}>
              {feedbackStage === "share"
                ? shareOptions.length > 0
                  ? "Поделитесь впечатлением на площадке"
                  : "Спасибо за обратную связь"
                : "Ваш отзыв поможет нам улучшить сервис."}
            </div>
          </div>
          {feedbackStage === "form" && (
            <>
              <div className={styles.feedbackStars} role="radiogroup" aria-label="Оценка визита">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`${styles.starButton} ${feedbackRating >= value ? styles.starButtonActive : ""}`}
                    onClick={() => setFeedbackRating(value)}
                    role="radio"
                    aria-checked={feedbackRating >= value}
                    aria-label={`Оценка ${value}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <label className={styles.feedbackCommentLabel}>
                Комментарий
                <textarea
                  className={styles.feedbackComment}
                  value={feedbackComment}
                  onChange={(event) => setFeedbackComment(event.currentTarget.value)}
                  placeholder="Расскажите, что понравилось"
                  rows={3}
                />
              </label>
            </>
          )}
          {feedbackStage === "share" && shareOptions.length > 0 && (
            <div className={styles.feedbackShareBlock}>
              <div className={styles.feedbackShareTitle}>
                Мы рады, что вам понравилось! Пожалуйста, поделитесь своим отзывом
              </div>
              <div className={styles.feedbackShareButtons}>
                {shareOptions.map((platform) => (
                  <button
                    key={platform.id}
                    type="button"
                    className={styles.feedbackShareButton}
                    onClick={() => handleShareClick(platform.url)}
                  >
                    {REVIEW_PLATFORM_LABELS[platform.id] || platform.id}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            type={feedbackStage === "share" ? "button" : "submit"}
            className={styles.feedbackSubmit}
            disabled={
              (feedbackStage === "share" && feedbackSubmitting) ||
              (feedbackStage === "form" && (!feedbackRating || feedbackSubmitting))
            }
            onClick={feedbackStage === "share" ? handleFeedbackClose : undefined}
            aria-busy={feedbackSubmitting || undefined}
          >
            {feedbackStage === "share" ? "Готово" : feedbackSubmitting ? "Отправляем…" : "Отправить"}
          </button>
        </form>
      </div>
      {toastElement}
    </>
  );
}
