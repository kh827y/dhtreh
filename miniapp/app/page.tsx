/* eslint-disable @next/next/no-img-element */
"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import QrCanvas from "../components/QrCanvas";
import { balance, consentGet, consentSet, mintQr, transactions } from "../lib/api";
import Spinner from "../components/Spinner";
import Toast from "../components/Toast";
import { useMiniappAuth } from "../lib/useMiniapp";
import styles from "./page.module.css";

const DEV_UI =
  (process.env.NEXT_PUBLIC_MINIAPP_DEV_UI || "").toLowerCase() === "true" ||
  process.env.NEXT_PUBLIC_MINIAPP_DEV_UI === "1";

const LEVELS = [
  { min: 0, name: "Старт", percent: 3 },
  { min: 1000, name: "Серебро", percent: 5 },
  { min: 5000, name: "Золото", percent: 7 },
  { min: 10000, name: "Платина", percent: 10 },
];

type TelegramWebApp = {
  ready?: () => void;
  requestPhoneNumber?: ((callback?: (data: { phone_number?: string }) => void) => Promise<unknown>) &
    ((callback: (data: { phone_number?: string }) => void) => void);
};

type TelegramWindow = Window & { Telegram?: { WebApp?: TelegramWebApp } };

const TX_DICTIONARY: Record<
  string,
  { label: string; icon: string; color: string; positive: boolean | null }
> = {
  accrual: { label: "Начисление", icon: "⬆️", color: "rgba(34,197,94,0.18)", positive: true },
  earn: { label: "Начисление", icon: "⬆️", color: "rgba(34,197,94,0.18)", positive: true },
  debit: { label: "Списание", icon: "⬇️", color: "rgba(239,68,68,0.16)", positive: false },
  burn: { label: "Списание", icon: "⬇️", color: "rgba(239,68,68,0.16)", positive: false },
  refund: { label: "Возврат", icon: "🔄", color: "rgba(59,130,246,0.18)", positive: true },
  return: { label: "Возврат", icon: "🔄", color: "rgba(59,130,246,0.18)", positive: true },
  promo: { label: "Промокод", icon: "🎁", color: "rgba(245,158,11,0.18)", positive: true },
  promocode: { label: "Промокод", icon: "🎁", color: "rgba(245,158,11,0.18)", positive: true },
  coupon: { label: "Промокод", icon: "🎁", color: "rgba(245,158,11,0.18)", positive: true },
  campaign: { label: "Акция", icon: "⭐️", color: "rgba(244,114,182,0.2)", positive: true },
  bonus: { label: "Бонус", icon: "💎", color: "rgba(96,165,250,0.22)", positive: true },
  default: { label: "Операция", icon: "💠", color: "rgba(148,163,184,0.18)", positive: null },
};

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function resolveLevel(balanceValue: number | null) {
  const amount = balanceValue ?? 0;
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (amount >= level.min) {
      current = level;
    }
  }
  return current;
}

function resolveTransaction(type: string) {
  if (!type) return TX_DICTIONARY.default;
  const key = type.toLowerCase();
  return TX_DICTIONARY[key] ?? TX_DICTIONARY.default;
}

function initialsFromName(name: string) {
  return name
    .split(" ")
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function retryWithBackoff<T>(fn: () => Promise<T>, tries = 2, delayMs = 500): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (tries <= 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return retryWithBackoff(fn, tries - 1, delayMs * 2);
  }
}

export default function Page() {
  const auth = useMiniappAuth(process.env.NEXT_PUBLIC_MERCHANT_ID || "M-1");
  const merchantId = auth.merchantId;
  const setMerchantId = auth.setMerchantId;
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [qrToken, setQrToken] = useState<string>("");
  const [ttl, setTtl] = useState<number>(Number(process.env.NEXT_PUBLIC_QR_TTL || "60"));
  const [bal, setBal] = useState<number | null>(null);
  const [tx, setTx] = useState<Array<{ id: string; type: string; amount: number; createdAt: string }>>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [consent, setConsent] = useState<boolean>(false);
  const [toast, setToast] = useState<{ msg: string; type?: "info" | "error" | "success" } | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const [profileCompleted, setProfileCompleted] = useState<boolean>(false);
  const [profileForm, setProfileForm] = useState<{ name: string; gender: string; birthday: string }>({
    name: "",
    gender: "",
    birthday: "",
  });
  const [promoCode, setPromoCode] = useState<string>("");
  const [initialDataLoaded, setInitialDataLoaded] = useState<boolean>(false);
  const [qrFullScreenOpen, setQrFullScreenOpen] = useState<boolean>(false);

  useEffect(() => {
    setAuthLoading(auth.loading);
    setError(auth.error);
    if (!auth.loading) {
      setCustomerId(auth.customerId);
      if (auth.theme.ttl) setTtl(auth.theme.ttl);
    }
  }, [auth.loading, auth.error, auth.customerId, auth.theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("miniapp.profile");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { name?: string; gender?: string; birthday?: string };
        setProfileForm({
          name: parsed.name || "",
          gender: parsed.gender || "",
          birthday: parsed.birthday || "",
        });
        setProfileCompleted(true);
        setProfileModalOpen(false);
      } catch {
        setProfileModalOpen(true);
      }
    } else {
      setProfileModalOpen(true);
    }
  }, []);

  useEffect(() => {
    if (auth.user?.displayName && !profileCompleted && !profileForm.name) {
      setProfileForm((prev) => ({ ...prev, name: auth.user?.displayName || prev.name }));
    }
  }, [auth.user?.displayName, profileCompleted, profileForm.name]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tg = (window as TelegramWindow).Telegram?.WebApp ?? null;
    try {
      tg?.ready?.();
    } catch {}
    const storageKey = "miniapp.phoneRequested";
    if (!tg || !tg.requestPhoneNumber) return;
    if (localStorage.getItem(storageKey)) return;
    try {
      const result = tg.requestPhoneNumber?.();
      if (result && typeof (result as Promise<unknown>).then === "function") {
        (result as Promise<unknown>)
          .then(() => {
            localStorage.setItem(storageKey, "1");
          })
          .catch(() => {});
      }
    } catch {
      try {
        tg.requestPhoneNumber?.((data: { phone_number?: string }) => {
          if (data?.phone_number) {
            localStorage.setItem(storageKey, "1");
          }
        });
      } catch {}
    }
  }, []);

  const doMint = useCallback(async () => {
    if (!customerId) {
      setStatus("Сначала авторизуйтесь");
      return;
    }
    try {
      const r = await mintQr(customerId, merchantId, ttl);
      setQrToken(r.token);
      setQrFullScreenOpen(false);
      setStatus(`QR сгенерирован, TTL ${r.ttl}s`);
      setToast({ msg: "QR сгенерирован", type: "success" });
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      setStatus(`Ошибка генерации QR: ${message}`);
      setToast({ msg: "Не удалось сгенерировать QR", type: "error" });
    }
  }, [customerId, merchantId, ttl]);

  const loadBalance = useCallback(async () => {
    if (!customerId) {
      setStatus("Нет customerId");
      return;
    }
    try {
      const r = await retryWithBackoff(() => balance(merchantId, customerId));
      setBal(r.balance);
      setStatus("Баланс обновлён");
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      setStatus(`Ошибка баланса: ${message}`);
      setToast({ msg: "Не удалось загрузить баланс", type: "error" });
    }
  }, [customerId, merchantId]);

  const loadTx = useCallback(async () => {
    if (!customerId) {
      setStatus("Нет customerId");
      return;
    }
    try {
      const r = await retryWithBackoff(() => transactions(merchantId, customerId, 20));
      setTx(r.items.map((i) => ({ id: i.id, type: i.type, amount: i.amount, createdAt: i.createdAt })));
      setNextBefore(r.nextBefore || null);
      setStatus("История обновлена");
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      setStatus(`Ошибка истории: ${message}`);
      setToast({ msg: "Не удалось обновить историю", type: "error" });
    }
  }, [customerId, merchantId]);

  const loadMore = useCallback(async () => {
    if (!customerId || !nextBefore) return;
    try {
      const r = await transactions(merchantId, customerId, 20, nextBefore);
      setTx((prev) => [
        ...prev,
        ...r.items.map((i) => ({ id: i.id, type: i.type, amount: i.amount, createdAt: i.createdAt })),
      ]);
      setNextBefore(r.nextBefore || null);
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      setStatus(`Ошибка подгрузки: ${message}`);
    }
  }, [merchantId, customerId, nextBefore]);

  useEffect(() => {
    if (!qrToken || !autoRefresh) return;
    const id = setTimeout(() => {
      doMint().catch(() => {});
    }, Math.max(5, ttl - 5) * 1000);
    return () => clearTimeout(id);
  }, [qrToken, autoRefresh, ttl, doMint]);

  const syncConsent = useCallback(async () => {
    if (!customerId) return;
    try {
      const r = await consentGet(merchantId, customerId);
      setConsent(!!r.granted);
    } catch {}
  }, [customerId, merchantId]);

  useEffect(() => {
    if (customerId) syncConsent();
  }, [customerId, syncConsent]);

  useEffect(() => {
    if (!customerId || profileModalOpen || initialDataLoaded) return;
    (async () => {
      try {
        await doMint();
        await loadBalance();
        await loadTx();
      } finally {
        setInitialDataLoaded(true);
      }
    })();
  }, [customerId, profileModalOpen, initialDataLoaded, doMint, loadBalance, loadTx]);

  const handleProfileSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!profileForm.name || !profileForm.gender || !profileForm.birthday) {
        setToast({ msg: "Заполните все поля", type: "error" });
        return;
      }
      try {
        localStorage.setItem("miniapp.profile", JSON.stringify(profileForm));
        setProfileCompleted(true);
        setProfileModalOpen(false);
        setToast({ msg: "Данные сохранены", type: "success" });
      } catch {
        setToast({ msg: "Не удалось сохранить данные", type: "error" });
      }
    },
    [profileForm],
  );

  const displayName = useMemo(() => {
    if (auth.user?.displayName) return auth.user.displayName;
    if (profileForm.name) return profileForm.name;
    return "Гость";
  }, [auth.user?.displayName, profileForm.name]);

  const avatarUrl = auth.user?.avatarUrl;
  const initials = initialsFromName(displayName || "Гость");

  const level = useMemo(() => resolveLevel(bal), [bal]);

  const promoBadge = useMemo(() => {
    const promoTypes = ["promo", "promocode", "coupon", "campaign"];
    return tx.filter((item) => promoTypes.some((key) => item.type?.toLowerCase().includes(key))).length;
  }, [tx]);

  const handlePromoSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!promoCode.trim()) {
        setToast({ msg: "Введите промокод", type: "info" });
        return;
      }
      setToast({ msg: `Промокод ${promoCode.trim()} отправлен на проверку`, type: "success" });
      setPromoCode("");
    },
    [promoCode],
  );

  const toggleConsent = useCallback(async () => {
    if (!customerId) return;
    try {
      await consentSet(merchantId, customerId, !consent);
      setConsent(!consent);
      setToast({ msg: "Настройки согласия обновлены", type: "success" });
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      setStatus(`Ошибка согласия: ${message}`);
      setToast({ msg: "Не удалось обновить согласие", type: "error" });
    }
  }, [merchantId, customerId, consent]);

  return (
    <div className={styles.page} style={{ background: auth.theme.bg || "transparent" }}>
      <header className={styles.header}>
        <div className={styles.profile}>
          <div className={styles.avatar}>
            {avatarUrl ? <img src={avatarUrl} alt={displayName} /> : initials}
          </div>
          <div className={styles.profileText}>
            <span className={styles.greeting}>Добро пожаловать</span>
            <span className={styles.name}>{displayName}</span>
          </div>
        </div>
        <button className={styles.settingsButton} type="button" onClick={() => setProfileModalOpen(true)} aria-label="Настройки">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Zm7.94-2.06-.77-.59a1 1 0 0 1-.37-1l.2-.94a1 1 0 0 0-.51-1.08l-1.14-.57a1 1 0 0 0-1.1.14l-.74.63a1 1 0 0 1-1.05.16l-.9-.35a1 1 0 0 1-.62-.74l-.18-.95a1 1 0 0 0-.98-.81h-1.28a1 1 0 0 0-.98.81l-.18.95a1 1 0 0 1-.62.74l-.9.35a1 1 0 0 1-1.05-.16l-.74-.63a1 1 0 0 0-1.1-.14l-1.14.57a1 1 0 0 0-.51 1.08l.2.94a1 1 0 0 1-.37 1l-.77.59a1 1 0 0 0-.36 1.05l.35 1.24a1 1 0 0 0 .96.73h1.02a1 1 0 0 1 .87.49l.5.86a1 1 0 0 0 1.02.48l1.26-.22a1 1 0 0 1 1.08.58l.37.86a1 1 0 0 0 .92.58h1.34a1 1 0 0 0 .92-.58l.37-.86a1 1 0 0 1 1.08-.58l1.26.22a1 1 0 0 0 1.02-.48l.5-.86a1 1 0 0 1 .87-.49h1.02a1 1 0 0 0 .96-.73l.35-1.24a1 1 0 0 0-.36-1.05Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </header>

      {auth.theme.logo && (
        <div className={styles.brand}>
          <img src={auth.theme.logo} alt="Логотип" />
        </div>
      )}

      {authLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Spinner />
          <span>Загрузка профиля…</span>
        </div>
      )}

      {error && !authLoading && <div style={{ color: "#ef4444", marginBottom: 12 }}>{error}</div>}

      <section className={`${styles.card} ${styles.balanceCard}`} style={{ borderColor: auth.theme.primary || undefined }}>
        <div
          className={styles.qrBlock}
          onClick={() => {
            if (qrToken) setQrFullScreenOpen(true);
          }}
        >
          <div className={styles.qrFrame}>
            {qrToken ? <QrCanvas value={qrToken} size={108} /> : <Spinner />}
          </div>
          <span className={styles.qrHint}>
            <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M5 5h10v10H5V5Zm2 2v6h6V7H7Z"
                fill="currentColor"
                opacity="0.9"
              />
            </svg>
            Нажмите для увеличения
          </span>
        </div>
        <div className={styles.balanceInfo}>
          <div>
            <div className={styles.balanceTitle}>Ваш баланс</div>
            <div className={styles.balanceAmount}>{bal != null ? `${bal} баллов` : "—"}</div>
          </div>
          <div className={styles.balanceMeta}>
            <div className={styles.metaBadge}>
              <span>Уровень</span>
              <span>{level.name}</span>
            </div>
            <div className={styles.metaBadge}>
              <span>Начисление</span>
              <span>{level.percent}%</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button className={styles.primaryButton} type="button" onClick={doMint}>
              Обновить QR
            </button>
            <button className={styles.primaryButton} type="button" onClick={loadBalance} style={{ background: "#0ea5e9" }}>
              Обновить баланс
            </button>
          </div>
        </div>
      </section>

      <section className={styles.actionsCard}>
        <form className={styles.promoForm} onSubmit={handlePromoSubmit}>
          <input
            className={styles.promoInput}
            placeholder="Введите промокод"
            value={promoCode}
            onChange={(event) => setPromoCode(event.target.value)}
          />
          <button className={styles.primaryButton} type="submit">
            Активировать
          </button>
        </form>
        <button className={styles.promotionsButton} type="button">
          Акции
          {promoBadge > 0 && <span className={styles.promotionsBadge}>{promoBadge}</span>}
        </button>
        <button className={styles.promotionsButton} type="button" onClick={toggleConsent} style={{ alignSelf: "stretch" }}>
          {consent ? "Отозвать согласие на уведомления" : "Дать согласие на уведомления"}
        </button>
      </section>

      <section className={styles.historyCard}>
        <div className={styles.historyHeader}>
          <h2 className={styles.historyTitle}>История операций</h2>
          <button className={styles.primaryButton} type="button" onClick={loadTx}>
            Обновить
          </button>
        </div>
        {tx.length === 0 && !authLoading ? (
          <div className={styles.emptyState}>Операций пока нет — совершите первую покупку</div>
        ) : (
          <div className={styles.historyList}>
            {tx.map((item) => {
              const info = resolveTransaction(item.type);
              const isPositive = info.positive === null ? item.amount >= 0 : info.positive;
              const amountClass = `${styles.historyAmount} ${
                isPositive ? styles.historyAmountPositive : styles.historyAmountNegative
              }`;
              const amount = item.amount >= 0 ? `+${item.amount}` : `${item.amount}`;
              return (
                <div key={item.id} className={styles.historyItem}>
                  <div className={styles.historyDetails}>
                    <div className={styles.historyIcon} style={{ background: info.color }}>{info.icon}</div>
                    <div className={styles.historyText}>
                      <span className={styles.historyType}>{info.label}</span>
                      <span className={styles.historyDate}>{formatDate(item.createdAt)}</span>
                    </div>
                  </div>
                  <span className={amountClass}>{amount}</span>
                </div>
              );
            })}
          </div>
        )}
        {nextBefore && (
          <button className={styles.loadMore} type="button" onClick={loadMore}>
            Показать ещё
          </button>
        )}
      </section>

      {status && <div className={styles.statusMessage}>{status}</div>}

      {DEV_UI && (
        <div className={styles.devPanel}>
          <div>
            <label>
              Мерчант
              <input value={merchantId} onChange={(e) => setMerchantId(e.target.value)} style={{ width: "100%" }} />
            </label>
          </div>
          <div>
            <label>
              TTL QR (сек)
              <input
                type="number"
                min={10}
                max={600}
                value={ttl}
                onChange={(e) => setTtl(parseInt(e.target.value || "60", 10))}
                style={{ width: "100%" }}
              />
            </label>
          </div>
          <div>
            <label>
              CustomerId
              <input
                value={customerId || ""}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  localStorage.setItem("miniapp.customerId", e.target.value);
                }}
                placeholder="teleauth заполнит сам"
                style={{ width: "100%" }}
              />
            </label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /> авто‑обновлять QR
          </label>
        </div>
      )}

      {profileModalOpen && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>Расскажите о себе</h2>
            <p className={styles.modalDescription}>
              Эти данные помогут персонализировать акции и поздравить вас с днём рождения.
            </p>
            <form className={styles.modalForm} onSubmit={handleProfileSubmit}>
              <label className={styles.modalLabel}>
                Имя и фамилия
                <input
                  className={styles.modalInput}
                  value={profileForm.name}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Например, Иван Петров"
                />
              </label>
              <label className={styles.modalLabel}>
                Пол
                <select
                  className={styles.modalSelect}
                  value={profileForm.gender}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, gender: event.target.value }))}
                >
                  <option value="">Выберите</option>
                  <option value="female">Женский</option>
                  <option value="male">Мужской</option>
                  <option value="other">Другое</option>
                </select>
              </label>
              <label className={styles.modalLabel}>
                Дата рождения
                <input
                  className={styles.modalInput}
                  type="date"
                  value={profileForm.birthday}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, birthday: event.target.value }))}
                  max={new Date().toISOString().split("T")[0]}
                />
              </label>
              <div className={styles.modalActions}>
                <button className={styles.primaryButton} type="submit">
                  Сохранить
                </button>
                {profileCompleted && (
                  <button className={styles.modalSecondary} type="button" onClick={() => setProfileModalOpen(false)}>
                    Продолжить без изменений
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {qrToken && qrFullScreenOpen && (
        <div className={styles.qrOnlyModal} onClick={() => setQrFullScreenOpen(false)}>
          <button className={styles.backButton} type="button" onClick={() => setQrFullScreenOpen(false)}>
            ←
          </button>
          <div className={styles.qrOnlyWrapper} onClick={(event) => event.stopPropagation()}>
            <QrCanvas value={qrToken} size={320} />
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
