"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useMiniappAuth } from "../../lib/useMiniapp";
import styles from "./page.module.css";

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

export default function QrPage() {
  const auth = useMiniappAuth(process.env.NEXT_PUBLIC_MERCHANT_ID || "M-1");
  const { merchantId, customerId, initData } = auth;
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

  const updateQrSize = useCallback(() => {
    if (typeof window === "undefined") return;
    const viewportWidth = window.innerWidth;
    const calculated = Math.round(Math.min(320, Math.max(160, viewportWidth * 0.56)));
    setQrSize(calculated);
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

  const progressPercent = useMemo(() => getProgressPercent(levelInfo), [levelInfo]);
  const nextLevelName = levelInfo?.next?.name || "следующий уровень";
  const currentProgressValue = useMemo(() => {
    if (!levelInfo) return 0;
    return Math.max(0, Math.round(levelInfo.value || 0));
  }, [levelInfo]);
  const nextLevelThreshold = useMemo(() => {
    if (!levelInfo?.next) return 0;
    return Math.max(0, Math.round(levelInfo.next.threshold || 0));
  }, [levelInfo]);

  const canShowProgress = levelCatalog.length > 1 && !!levelInfo?.next;
  const qrWrapperSize = useMemo(() => Math.round(qrSize + 32), [qrSize]);

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link href="/" className={styles.backLink} prefetch={false}>
          Вернуться в профиль
        </Link>
      </div>

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

      {canShowProgress && (
        <section className={styles.progressSection}>
          <div className={styles.progressTitle}>
            Сумма покупок для перехода на {nextLevelName} &gt;
          </div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
          <div className={styles.progressScale}>
            <span>{currentProgressValue.toLocaleString("ru-RU")}</span>
            <span>{nextLevelThreshold.toLocaleString("ru-RU")}</span>
          </div>
        </section>
      )}

      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
