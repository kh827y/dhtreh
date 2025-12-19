"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Toast from "./Toast";
import styles from "../app/page.module.css";
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
  }, [transactionsList, dismissedReady, feedbackOpen, isEligiblePurchaseTx, preferredTxId]);

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
