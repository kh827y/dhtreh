"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import QrCanvas from "../components/QrCanvas";
import {
  balance,
  consentGet,
  consentSet,
  levels,
  mechanicsLevels,
  mintQr,
  transactions,
} from "../lib/api";
import Spinner from "../components/Spinner";
import Toast from "../components/Toast";
import { useMiniappAuth } from "../lib/useMiniapp";
import styles from "./page.module.css";

const DEV_UI =
  (process.env.NEXT_PUBLIC_MINIAPP_DEV_UI || "").toLowerCase() === "true" ||
  process.env.NEXT_PUBLIC_MINIAPP_DEV_UI === "1";

type TelegramUser = {
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
};

type LevelInfo = {
  merchantId: string;
  customerId: string;
  metric: "earn" | "redeem" | "transactions";
  periodDays: number;
  value: number;
  current: { name: string; threshold: number };
  next: { name: string; threshold: number } | null;
  progressToNext: number;
};

type MechanicsLevel = {
  id?: string;
  name?: string;
  threshold?: number;
  cashbackPercent?: number | null;
  benefits?: { cashbackPercent?: number | null; [key: string]: unknown } | null;
  rewardPercent?: number | null;
};

type TelegramInitUser = {
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

type TelegramWebApp = {
  initDataUnsafe?: { user?: TelegramInitUser };
  ready?: () => void;
  expand?: () => void;
  requestPhoneNumber?: () => Promise<unknown>;
};

type TelegramWindow = Window & { Telegram?: { WebApp?: TelegramWebApp } };

type TransactionItem = {
  id: string;
  type: string;
  amount: number;
  createdAt: string;
};

const genderOptions: Array<{ value: "male" | "female"; label: string }> = [
  { value: "male", label: "Мужской" },
  { value: "female", label: "Женский" },
];

function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const tgWindow = window as TelegramWindow;
  return tgWindow.Telegram?.WebApp || null;
}

function getTelegramUser(): TelegramUser | null {
  try {
    const tg = getTelegramWebApp();
    const user = tg?.initDataUnsafe?.user;
    if (!user) return null;
    return {
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      photoUrl: user.photo_url,
    };
  } catch {
    return null;
  }
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function formatTxType(type: string): { title: string; tone: "earn" | "redeem" | "other" } {
  const lower = type.toLowerCase();
  if (lower.includes("earn")) return { title: "Начисление", tone: "earn" };
  if (lower.includes("redeem") || lower.includes("spend")) return { title: "Списание", tone: "redeem" };
  if (lower.includes("refund")) return { title: "Возврат", tone: "earn" };
  if (lower.includes("promo")) return { title: "Промокод", tone: "other" };
  if (lower.includes("campaign")) return { title: "Акция", tone: "other" };
  return { title: type, tone: "other" };
}

function formatAmount(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "" : "";
  return `${sign}${amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}`;
}

function getProgressPercent(levelInfo: LevelInfo | null): number {
  if (!levelInfo) return 0;
  if (!levelInfo.next) return 100;
  const currentThreshold = levelInfo.current?.threshold || 0;
  const distance = Math.max(1, levelInfo.next.threshold - currentThreshold);
  const progress = Math.max(0, levelInfo.value - currentThreshold);
  return Math.max(0, Math.min(100, Math.round((progress / distance) * 100)));
}

export default function Page() {
  const auth = useMiniappAuth(process.env.NEXT_PUBLIC_MERCHANT_ID || "M-1");
  const merchantId = auth.merchantId;
  const setMerchantId = auth.setMerchantId;
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [qrToken, setQrToken] = useState<string>("");
  const [ttl, setTtl] = useState<number>(Number(process.env.NEXT_PUBLIC_QR_TTL || "60"));
  const [bal, setBal] = useState<number | null>(null);
  const [tx, setTx] = useState<TransactionItem[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [consent, setConsent] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [toast, setToast] = useState<{ msg: string; type?: "info" | "error" | "success" } | null>(null);
  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(null);
  const [levelCatalog, setLevelCatalog] = useState<MechanicsLevel[]>([]);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [profileForm, setProfileForm] = useState<{
    name: string;
    gender: "male" | "female" | "";
    birthDate: string;
  }>({
    name: "",
    gender: "",
    birthDate: "",
  });
  const [profileCompleted, setProfileCompleted] = useState<boolean>(true);
  const [profileTouched, setProfileTouched] = useState<boolean>(false);

  useEffect(() => {
    const tgUser = getTelegramUser();
    if (tgUser) {
      setTelegramUser(tgUser);
      setProfileForm((prev) => ({
        ...prev,
        name: prev.name || [tgUser.firstName, tgUser.lastName].filter(Boolean).join(" "),
      }));
    }
    const tg = getTelegramWebApp();
    try {
      if (tg?.ready) tg.ready();
      if (tg?.expand) tg.expand();
      if (tg?.requestPhoneNumber) {
        tg.requestPhoneNumber().catch(() => undefined);
      }
    } catch {
      // ignore telegram errors
    }
    try {
      const savedProfile = localStorage.getItem("miniapp.profile");
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile) as {
          name?: string;
          gender?: "male" | "female";
          birthDate?: string;
        };
        setProfileForm({
          name: parsed.name || "",
          gender: parsed.gender || "",
          birthDate: parsed.birthDate || "",
        });
        setProfileCompleted(true);
      } else {
        setProfileCompleted(false);
      }
    } catch {
      setProfileCompleted(false);
    }
  }, []);

  useEffect(() => {
    setLoading(auth.loading);
    setError(auth.error);
    if (!auth.loading) {
      setCustomerId(auth.customerId);
      if (auth.theme.ttl) setTtl(auth.theme.ttl);
    }
  }, [auth.loading, auth.error, auth.customerId, auth.theme]);

  const retry = useCallback(
    async <T,>(fn: () => Promise<T>, tries = 2, delayMs = 500): Promise<T> => {
      try {
        return await fn();
      } catch (error) {
        if (tries <= 0) throw error;
        await new Promise((r) => setTimeout(r, delayMs));
        return retry(fn, tries - 1, delayMs * 2);
      }
    },
    []
  );

  const doMint = useCallback(async () => {
    if (!customerId) {
      setStatus("Сначала авторизуйтесь");
      return;
    }
    try {
      const r = await mintQr(customerId, merchantId, ttl);
      setQrToken(r.token);
      setStatus(`QR обновлён (TTL ${r.ttl}с)`);
      setToast({ msg: "QR сгенерирован", type: "success" });
    } catch (error) {
      const message = resolveErrorMessage(error);
      setStatus(`Ошибка генерации QR: ${message}`);
      setToast({ msg: "Не удалось обновить QR", type: "error" });
    }
  }, [customerId, merchantId, ttl]);

  const loadBalance = useCallback(async () => {
    if (!customerId) {
      setStatus("Нет customerId");
      return;
    }
    try {
      const r = await retry(() => balance(merchantId, customerId));
      setBal(r.balance);
      setStatus("Баланс обновлён");
    } catch (error) {
      const message = resolveErrorMessage(error);
      setStatus(`Ошибка баланса: ${message}`);
      setToast({ msg: "Не удалось обновить баланс", type: "error" });
    }
  }, [customerId, merchantId, retry]);

  const loadTx = useCallback(async () => {
    if (!customerId) {
      setStatus("Нет customerId");
      return;
    }
    try {
      const r = await retry(() => transactions(merchantId, customerId, 20));
      setTx(
        r.items.map((i) => ({ id: i.id, type: i.type, amount: i.amount, createdAt: i.createdAt }))
      );
      setNextBefore(r.nextBefore || null);
      setStatus("История обновлена");
    } catch (error) {
      const message = resolveErrorMessage(error);
      setStatus(`Ошибка истории: ${message}`);
      setToast({ msg: "Не удалось обновить историю", type: "error" });
    }
  }, [customerId, merchantId, retry]);

  const loadMore = useCallback(async () => {
    if (!customerId || !nextBefore) return;
    try {
      const r = await transactions(merchantId, customerId, 20, nextBefore);
      setTx((prev) => [
        ...prev,
        ...r.items.map((i) => ({ id: i.id, type: i.type, amount: i.amount, createdAt: i.createdAt })),
      ]);
      setNextBefore(r.nextBefore || null);
    } catch (error) {
      const message = resolveErrorMessage(error);
      setStatus(`Ошибка подгрузки: ${message}`);
    }
  }, [merchantId, customerId, nextBefore]);

  const loadLevels = useCallback(async () => {
    if (!customerId) return;
    try {
      const info = await retry(() => levels(merchantId, customerId));
      setLevelInfo(info);
    } catch (error) {
      const message = resolveErrorMessage(error);
      setStatus(`Не удалось обновить уровень: ${message}`);
    }
  }, [customerId, merchantId, retry]);

  const loadLevelCatalog = useCallback(async () => {
    try {
      const cfg = await retry(() => mechanicsLevels(merchantId));
      if (Array.isArray(cfg?.levels)) {
        setLevelCatalog(
          cfg.levels.filter((lvl: MechanicsLevel) => lvl && typeof lvl === "object") as MechanicsLevel[]
        );
      }
    } catch {
      setLevelCatalog([]);
    }
  }, [merchantId, retry]);

  useEffect(() => {
    if (!qrToken || !autoRefresh) return;
    const id = setTimeout(() => {
      doMint().catch(() => undefined);
    }, Math.max(5, ttl - 5) * 1000);
    return () => clearTimeout(id);
  }, [qrToken, autoRefresh, ttl, doMint]);

  const syncConsent = useCallback(async () => {
    if (!customerId) return;
    try {
      const r = await consentGet(merchantId, customerId);
      setConsent(!!r.granted);
    } catch {
      // ignore
    }
  }, [customerId, merchantId]);

  useEffect(() => {
    loadLevelCatalog();
  }, [loadLevelCatalog]);

  useEffect(() => {
    if (customerId) {
      syncConsent();
      loadBalance();
      loadTx();
      loadLevels();
    }
  }, [customerId, syncConsent, loadBalance, loadTx, loadLevels]);

  useEffect(() => {
    if (customerId && !qrToken) {
      doMint().catch(() => undefined);
    }
  }, [customerId, qrToken, doMint]);

  const toggleConsent = useCallback(async () => {
    if (!customerId) return;
    try {
      await consentSet(merchantId, customerId, !consent);
      setConsent(!consent);
      setToast({ msg: "Настройки согласия обновлены", type: "success" });
    } catch (error) {
      const message = resolveErrorMessage(error);
      setToast({ msg: `Ошибка согласия: ${message}`, type: "error" });
    }
  }, [merchantId, customerId, consent]);

  const handleProfileSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setProfileTouched(true);
      if (!profileForm.name || !profileForm.gender || !profileForm.birthDate) {
        setToast({ msg: "Заполните все поля", type: "error" });
        return;
      }
      try {
        localStorage.setItem("miniapp.profile", JSON.stringify(profileForm));
        setProfileCompleted(true);
        setToast({ msg: "Профиль сохранён", type: "success" });
      } catch (error) {
        const message = resolveErrorMessage(error);
        setToast({ msg: `Не удалось сохранить: ${message}`, type: "error" });
      }
    },
    [profileForm]
  );

  const progressPercent = useMemo(() => getProgressPercent(levelInfo), [levelInfo]);
  const nextLevelLabel = levelInfo?.next?.name || "";
  const purchasesToNext = levelInfo?.progressToNext ?? 0;

  const availablePromotions = useMemo(
    () => tx.filter((item) => /promo|campaign/i.test(item.type)).length,
    [tx]
  );

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

  const displayName = useMemo(() => {
    if (profileForm.name) return profileForm.name;
    if (telegramUser) {
      return (
        [telegramUser.firstName, telegramUser.lastName].filter(Boolean).join(" ") ||
        telegramUser.username ||
        "Вы"
      );
    }
    return "Вы";
  }, [profileForm.name, telegramUser]);

  const profilePage = !profileCompleted;

  return (
    <div className={styles.page}>
      {profilePage ? (
        <div className={styles.profileContainer}>
          <form className={styles.profileCard} onSubmit={handleProfileSubmit}>
            <div className={`${styles.appear} ${styles.delay0}`}>
              <div className={styles.profileTitle}>Давайте познакомимся</div>
              <div className={styles.profileSubtitle}>
                Заполните данные, чтобы мы начисляли бонусы лично вам
              </div>
            </div>
            <div className={`${styles.profileField} ${styles.appear} ${styles.delay1}`}>
              <label htmlFor="name">Имя</label>
              <input
                id="name"
                value={profileForm.name}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Введите имя"
                className={profileTouched && !profileForm.name ? styles.inputError : undefined}
              />
            </div>
            <div className={`${styles.profileField} ${styles.appear} ${styles.delay2}`}>
              <span>Пол</span>
              <div
                className={`${styles.genderRow} ${
                  profileTouched && !profileForm.gender ? styles.inputErrorBorder : ""
                }`}
              >
                {genderOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => setProfileForm((prev) => ({ ...prev, gender: option.value }))}
                    className={`${styles.genderButton} ${
                      profileForm.gender === option.value ? styles.genderButtonActive : ""
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={`${styles.profileField} ${styles.appear} ${styles.delay3}`}>
              <label htmlFor="birth">Дата рождения</label>
              <input
                id="birth"
                type="date"
                value={profileForm.birthDate}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, birthDate: e.target.value }))}
                className={profileTouched && !profileForm.birthDate ? styles.inputError : undefined}
              />
            </div>
            <button type="submit" className={`${styles.profileSubmit} ${styles.appear} ${styles.delay4}`}>
              Сохранить
            </button>
          </form>
        </div>
      ) : (
        <>
          <header className={`${styles.header} ${styles.appear} ${styles.delay0}`}>
            <button className={styles.headerIconButton} aria-label="Назад">
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M11.5 5L7 9.5L11.5 14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className={styles.userBlock}>
              <div className={styles.avatarWrap}>
                {telegramUser?.photoUrl ? (
                  <Image
                    src={telegramUser.photoUrl}
                    alt="avatar"
                    width={52}
                    height={52}
                    className={styles.avatar}
                    unoptimized
                  />
                ) : (
                  <div className={styles.avatarFallback}>{displayName.slice(0, 1).toUpperCase()}</div>
                )}
              </div>
              <div className={styles.userName}>{displayName}</div>
            </div>
            <button
              className={styles.headerIconButton}
              aria-label="Настройки"
              onClick={() => setSettingsOpen(true)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 12.5C11.3807 12.5 12.5 11.3807 12.5 10C12.5 8.61929 11.3807 7.5 10 7.5C8.61929 7.5 7.5 8.61929 7.5 10C7.5 11.3807 8.61929 12.5 10 12.5Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3.272 11.5C3.10075 10.5221 3.10075 9.47795 3.272 8.5L1.66634 7.16634L3.16634 3.83301L5.16634 4.33301C5.873 3.64213 6.72911 3.1071 7.66634 2.76967L8.00067 0.666344H12.0007L12.335 2.76967C13.2722 3.1071 14.1283 3.64213 14.835 4.33301L16.835 3.83301L18.335 7.16634L16.7293 8.5C16.9006 9.47795 16.9006 10.5221 16.7293 11.5L18.335 12.8337L16.835 16.167L14.835 15.667C14.1283 16.3579 13.2722 16.8929 12.335 17.2303L12.0007 19.3337H8.00067L7.66634 17.2303C6.72911 16.8929 5.873 16.3579 5.16634 15.667L3.16634 16.167L1.66634 12.8337L3.272 11.5Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </header>

          <section className={`${styles.card} ${styles.appear} ${styles.delay1}`}>
            <button className={styles.qrMini} onClick={() => setShowQrModal(true)} aria-label="Открыть QR">
              <div className={styles.qrWrapper}>
                {qrToken ? <QrCanvas value={qrToken} /> : <div className={styles.qrPlaceholder} />}
              </div>
              <span className={styles.qrHint}>Нажмите</span>
            </button>
            <div className={styles.cardContent}>
              <div className={styles.cardRow}>
                <span className={styles.cardLabel}>Баланс</span>
                <span className={styles.cardValue}>{bal != null ? bal.toLocaleString("ru-RU") : "—"}</span>
              </div>
              <div className={styles.cardRow}>
                <span className={styles.cardLabel}>Уровень</span>
                <span className={styles.cardValue}>{levelInfo?.current?.name || "—"}</span>
              </div>
              <div className={styles.cardRow}>
                <span className={styles.cardLabel}>Кэшбэк</span>
                <span className={styles.cardValue}>
                  {typeof cashbackPercent === "number" ? `${cashbackPercent}%` : "—"}
                </span>
              </div>
            </div>
          </section>

          {levelInfo?.next && (
            <section className={`${styles.levelSection} ${styles.appear} ${styles.delay2}`}>
              <div className={styles.levelHeader}>
                Сумма покупок для перехода на {nextLevelLabel}
              </div>
              <div className={styles.levelInfoRow}>
                <span className={styles.levelAmount}>{purchasesToNext.toLocaleString("ru-RU")}</span>
                <span className={styles.levelUnit}>
                  {levelInfo.metric === "transactions" ? "покупок" : "₽"}
                </span>
              </div>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
              </div>
            </section>
          )}

          <section className={`${styles.actionsRow} ${styles.appear} ${styles.delay3}`}>
            <div className={styles.promoInputBlock}>
              <input className={styles.promoInput} placeholder="Введите промокод" />
              <button className={styles.promoButton}>Активировать</button>
            </div>
            <button className={styles.promotionsButton}>
              <span>Акции</span>
              <span className={styles.promotionsBadge}>{availablePromotions}</span>
            </button>
          </section>

          <section className={`${styles.historySection} ${styles.appear} ${styles.delay4}`}>
            <div className={styles.historyHeader}>История</div>
            {tx.length === 0 ? (
              <div className={styles.emptyState}>Операций пока нет</div>
            ) : (
              <ul className={styles.historyList}>
                {tx.map((item, idx) => {
                  const meta = formatTxType(item.type);
                  return (
                    <li
                      key={item.id}
                      className={`${styles.historyItem} ${styles[`historyTone_${meta.tone}`]}`}
                      style={{ animationDelay: `${0.05 * idx}s` }}
                    >
                      <div className={styles.historyIcon}>
                        {meta.tone === "earn" ? "⬆" : meta.tone === "redeem" ? "⬇" : "★"}
                      </div>
                      <div className={styles.historyBody}>
                        <div className={styles.historyTitle}>{meta.title}</div>
                        <div className={styles.historyDate}>
                          {new Date(item.createdAt).toLocaleString("ru-RU")}
                        </div>
                      </div>
                      <div className={styles.historyAmount}>{formatAmount(item.amount)}</div>
                    </li>
                  );
                })}
              </ul>
            )}
            {nextBefore && (
              <button className={styles.loadMore} onClick={loadMore}>
                Показать ещё
              </button>
            )}
          </section>

          {status && (
            <div className={`${styles.statusBar} ${styles.appear} ${styles.delay5}`}>
              {status}
            </div>
          )}

          {DEV_UI && (
            <section className={`${styles.devPanel} ${styles.appear} ${styles.delay5}`}>
              <div className={styles.devRow}>
                <label>
                  Мерчант
                  <input value={merchantId} onChange={(e) => setMerchantId(e.target.value)} />
                </label>
                <label>
                  TTL QR
                  <input
                    type="number"
                    min={10}
                    max={600}
                    value={ttl}
                    onChange={(e) => setTtl(parseInt(e.target.value || "60", 10))}
                  />
                </label>
              </div>
              <label>
                CustomerId
                <input
                  value={customerId || ""}
                  placeholder="teleauth заполнит сам"
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    localStorage.setItem("miniapp.customerId", e.target.value);
                  }}
                />
              </label>
            </section>
          )}
        </>
      )}

      {(loading || auth.loading) && (
        <div className={styles.loaderOverlay}>
          <Spinner />
        </div>
      )}

      {error && !loading && <div className={styles.error}>{error}</div>}

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {showQrModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowQrModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span>Покажите этот QR на кассе</span>
              <button className={styles.modalClose} onClick={() => setShowQrModal(false)} aria-label="Закрыть">
                ✕
              </button>
            </div>
            {qrToken ? <QrCanvas value={qrToken} /> : <div className={styles.qrPlaceholder} />}
            <button className={styles.modalRefresh} onClick={doMint}>
              Обновить QR
            </button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className={styles.modalBackdrop} onClick={() => setSettingsOpen(false)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHeader}>Настройки</div>
            <label className={styles.switchRow}>
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              <span>Автообновление QR</span>
            </label>
            <label className={styles.switchRow}>
              <input type="checkbox" checked={consent} onChange={toggleConsent} />
              <span>Согласие на рассылку</span>
            </label>
            <button className={styles.sheetButton} onClick={loadBalance}>
              Обновить баланс
            </button>
            <button className={styles.sheetButton} onClick={loadTx}>
              Обновить историю
            </button>
            <button className={styles.sheetButton} onClick={doMint}>
              Пересоздать QR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
