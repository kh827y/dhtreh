"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QrCanvas from "../../components/QrCanvas";
import Spinner from "../../components/Spinner";
import {
  balance,
  levels,
  mechanicsLevels,
  mintQr,
  type MechanicsLevelsResp,
} from "../../lib/api";
import { getProgressPercent, type LevelInfo } from "../../lib/levels";
import { useMiniappAuthContext } from "../../lib/MiniappAuthContext";
import { subscribeToLoyaltyEvents } from "../../lib/loyaltyEvents";
import styles from "./page.module.css";
import { getTelegramWebApp } from "../../lib/telegram";

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

type MechanicsLevel = NonNullable<NonNullable<MechanicsLevelsResp["levels"]>[number]>;

const PROGRESS_STUB = {
  current: 18500,
  threshold: 50000,
};

export default function QrPage() {
  const auth = useMiniappAuthContext();
  const { merchantId, customerId, initData } = auth;
  const router = useRouter();
  const [qrToken, setQrToken] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(null);
  const [levelCatalog, setLevelCatalog] = useState<MechanicsLevel[]>([]);
  const [qrSize, setQrSize] = useState<number>(240);

  const effectiveTtl = useMemo(() => {
    if (typeof auth.theme?.ttl === "number" && !Number.isNaN(auth.theme.ttl)) {
      return auth.theme.ttl;
    }
    const fallback = Number(process.env.NEXT_PUBLIC_QR_TTL || "60");
    return Number.isFinite(fallback) ? fallback : 60;
  }, [auth.theme?.ttl]);

  const refreshQr = useCallback(async () => {
    if (!customerId) return;
    try {
      setRefreshing(true);
      const minted = await mintQr(customerId, merchantId, effectiveTtl, initData);
      setQrToken(minted.token);
      const ttlSec = typeof minted.ttl === "number" && Number.isFinite(minted.ttl) ? minted.ttl : effectiveTtl;
      setExpiresAt(Date.now() + Math.max(5, ttlSec) * 1000);
      setError("");
    } catch (err) {
      setError(`Не удалось обновить QR: ${resolveErrorMessage(err)}`);
    } finally {
      setRefreshing(false);
    }
  }, [customerId, merchantId, effectiveTtl, initData]);

  const loadBalance = useCallback(async () => {
    if (!customerId) return;
    try {
      const result = await balance(merchantId, customerId);
      setCurrentBalance(result.balance);
    } catch (err) {
      setError(`Не удалось получить баланс: ${resolveErrorMessage(err)}`);
    }
  }, [customerId, merchantId]);

  const loadLevelInfo = useCallback(async () => {
    if (!customerId) return;
    try {
      const info = await levels(merchantId, customerId);
      setLevelInfo(info);
    } catch (err) {
      setError(`Не удалось получить уровень: ${resolveErrorMessage(err)}`);
    }
  }, [customerId, merchantId]);

  const loadLevelCatalog = useCallback(async () => {
    try {
      const catalog = await mechanicsLevels(merchantId);
      if (Array.isArray(catalog?.levels)) {
        setLevelCatalog(
          catalog.levels.filter((lvl): lvl is MechanicsLevel => !!lvl && typeof lvl === "object")
        );
      } else {
        setLevelCatalog([]);
      }
    } catch (err) {
      setLevelCatalog([]);
      setError(`Не удалось загрузить уровни: ${resolveErrorMessage(err)}`);
    }
  }, [merchantId]);

  const refreshCustomerInfo = useCallback(() => {
    if (!customerId) return;
    void Promise.allSettled([loadBalance(), loadLevelInfo()]);
  }, [customerId, loadBalance, loadLevelInfo]);

  useEffect(() => {
    // Show Telegram BackButton in the native header and handle click
    const tg = getTelegramWebApp();
    if (!tg || !tg.BackButton) return;
    const backHandler = () => {
      try {
        router.back();
      } catch {
        router.push("/");
      }
    };
    try { tg.BackButton.show(); } catch {}
    let usedOnEvent = false;
    try {
      // Prefer the new API if available
      if (typeof tg.BackButton.onClick === "function") {
        tg.BackButton.onClick(backHandler);
      } else if (typeof tg.onEvent === "function") {
        tg.onEvent("backButtonClicked", backHandler);
        usedOnEvent = true;
      }
    } catch {}
    return () => {
      try {
        if (typeof tg.BackButton.hide === "function") tg.BackButton.hide();
        if (typeof tg.BackButton.offClick === "function") tg.BackButton.offClick(backHandler);
        if (usedOnEvent && typeof (tg as any).offEvent === "function") (tg as any).offEvent("backButtonClicked", backHandler);
      } catch {}
    };
  }, [router]);

  useEffect(() => {
    if (auth.loading) return;
    if (!customerId) {
      setLoading(false);
      setError("Не удалось определить клиента");
      return;
    }
    setLoading(true);
    void (async () => {
      await Promise.allSettled([refreshQr(), loadBalance(), loadLevelInfo(), loadLevelCatalog()]);
      setLoading(false);
    })();
  }, [auth.loading, customerId, refreshQr, loadBalance, loadLevelInfo, loadLevelCatalog]);

  useEffect(() => {
    if (!expiresAt) {
      setTimeLeft(null);
      return;
    }
    const update = () => {
      const diff = Math.round((expiresAt - Date.now()) / 1000);
      setTimeLeft(diff > 0 ? diff : 0);
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (!expiresAt) return;
    const msLeft = expiresAt - Date.now();
    if (msLeft <= 4000) return;
    const id = window.setTimeout(() => {
      void refreshQr();
    }, msLeft - 3000);
    return () => window.clearTimeout(id);
  }, [expiresAt, refreshQr]);

  useEffect(() => {
    if (!merchantId || !customerId) return;
    const unsubscribe = subscribeToLoyaltyEvents((payload) => {
      if (!payload || typeof payload !== "object") return;
      const data = payload as Record<string, unknown>;
      const eventMerchant = data.merchantId ? String(data.merchantId) : "";
      if (eventMerchant && eventMerchant !== merchantId) return;
      const eventCustomer = data.customerId ? String(data.customerId) : "";
      if (eventCustomer && eventCustomer !== customerId) return;
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
      refreshCustomerInfo();
    });
    return () => {
      unsubscribe();
    };
  }, [merchantId, customerId, refreshCustomerInfo]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (!customerId) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      refreshCustomerInfo();
    }, 20000);
    return () => {
      window.clearInterval(interval);
    };
  }, [customerId, refreshCustomerInfo]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshCustomerInfo();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshCustomerInfo]);

  const updateQrSize = useCallback(() => {
    if (typeof window === "undefined") return;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const fallback = 240;
    const widthBased = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth * 0.56 : fallback;
    const heightBased = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight * 0.42 : fallback;
    const base = Math.min(fallback, widthBased, heightBased);
    const calculated = Math.round(Math.min(320, Math.max(150, base)));
    setQrSize(Number.isFinite(calculated) && calculated > 0 ? calculated : fallback);
  }, []);

  useEffect(() => {
    updateQrSize();
    window.addEventListener("resize", updateQrSize);
    return () => window.removeEventListener("resize", updateQrSize);
  }, [updateQrSize]);

  const cashbackPercent = useMemo(() => {
    const currentName = levelInfo?.current?.name;
    if (!currentName) return null;
    const entry = levelCatalog.find((lvl) => (lvl?.name || "").toLowerCase() === currentName.toLowerCase());
    if (!entry) return null;
    if (typeof entry.cashbackPercent === "number") return entry.cashbackPercent;
    if (entry.benefits && typeof entry.benefits.cashbackPercent === "number") {
      return entry.benefits.cashbackPercent;
    }
    if (typeof entry.rewardPercent === "number") return entry.rewardPercent;
    return null;
  }, [levelInfo, levelCatalog]);

  const progressData = useMemo(() => {
    const fallbackPercent = PROGRESS_STUB.threshold
      ? Math.min(100, Math.max(0, Math.round((PROGRESS_STUB.current / PROGRESS_STUB.threshold) * 100)))
      : 0;

    const fallback = {
      percent: fallbackPercent,
      current: PROGRESS_STUB.current,
      threshold: PROGRESS_STUB.threshold,
    };

    if (!levelInfo?.next) {
      return fallback;
    }

    const thresholdRaw = levelInfo.next.threshold;
    if (typeof thresholdRaw !== "number" || !Number.isFinite(thresholdRaw) || thresholdRaw <= 0) {
      return fallback;
    }

    const currentRaw = typeof levelInfo.value === "number" && Number.isFinite(levelInfo.value)
      ? levelInfo.value
      : 0;

    const threshold = Math.max(0, Math.round(thresholdRaw));
    const current = Math.max(0, Math.round(currentRaw));
    const progressPercent = getProgressPercent(levelInfo);
    const normalizedPercent = Number.isFinite(progressPercent)
      ? Math.min(100, Math.max(0, Math.round(progressPercent)))
      : 0;

    if (normalizedPercent <= 0) {
      const recalculated = threshold
        ? Math.min(100, Math.max(0, Math.round((Math.min(current, threshold) / threshold) * 100)))
        : 0;
      return {
        percent: recalculated,
        current,
        threshold,
      };
    }

    return {
      percent: normalizedPercent,
      current,
      threshold,
    };
  }, [levelInfo]);

  const showProgress = useMemo(() => {
    // Прогресс показываем только когда у мерчанта больше одного уровня и для клиента есть следующий уровень
    return Array.isArray(levelCatalog) && levelCatalog.length > 1 && !!levelInfo?.next;
  }, [levelCatalog, levelInfo]);

  const qrWrapperSize = useMemo(() => Math.round(qrSize + 20), [qrSize]);

  return (
    <div className={styles.page}>
      <section className={styles.qrSection}>
        <div className={styles.qrHeader}>Покажите QR-код на кассе</div>
        <div className={styles.qrWrapper} style={{ width: qrWrapperSize, height: qrWrapperSize }}>
          {qrToken ? (
            <QrCanvas value={qrToken} size={qrSize} />
          ) : (
            <div className={styles.qrPlaceholder} style={{ width: qrSize, height: qrSize }} />
          )}
          {(loading || refreshing) && (
            <div className={styles.qrOverlay}>
              <Spinner />
            </div>
          )}
        </div>
        <div className={styles.qrFooter}>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => {
              void refreshQr();
            }}
            disabled={refreshing}
          >
            {refreshing ? "Обновляем…" : "Обновить QR"}
          </button>
          {typeof timeLeft === "number" && qrToken && (
            <span className={styles.ttlHint}>{timeLeft} сек.</span>
          )}
        </div>
      </section>

      <section className={styles.infoGrid}>
        <div className={styles.infoCard}>
          <div className={styles.infoLabel}>Баланс</div>
          <div className={styles.infoValue}>{currentBalance != null ? currentBalance.toLocaleString("ru-RU") : "—"}</div>
          <div className={styles.infoCaption}>бонусов</div>
        </div>
        <div className={styles.infoCard}>
          <div className={styles.infoLabel}>Уровень</div>
          <div className={styles.infoValue}>{levelInfo?.current?.name || "—"}</div>
          <div className={styles.infoCaption}>
            Кэшбэк {typeof cashbackPercent === "number" ? `${cashbackPercent}%` : "—%"}
          </div>
        </div>
      </section>

      {showProgress && (
        <section className={styles.progressSection}>
          <div className={styles.progressTitle}>Сумма покупок до следующего уровня &gt;</div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progressData.percent}%` }} />
          </div>
          <div className={styles.progressScale}>
            <span>{progressData.current.toLocaleString("ru-RU")}</span>
            <span>{progressData.threshold.toLocaleString("ru-RU")}</span>
          </div>
        </section>
      )}

      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
