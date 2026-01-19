"use client";

import React from "react";
import {
  Send,
  Copy,
  RefreshCw,
  MessageCircle,
  ExternalLink,
  User,
  Users,
  Bell,
  AlertTriangle,
  Star,
  FileText,
} from "lucide-react";
import { normalizeErrorMessage } from "lib/portal-errors";

type Subscriber = {
  id: string;
  chatId: string;
  chatType: string;
  username: string | null;
  title: string | null;
  staffId?: string | null;
  actorType?: string | null;
  staffName?: string | null;
  addedAt?: string | null;
  lastSeenAt?: string | null;
};

type TelegramState = {
  configured: boolean;
  botUsername: string | null;
  botLink: string | null;
  digestHourLocal?: number | null;
};

type TelegramInvite = { startUrl: string; startGroupUrl: string; token: string };


const reviewThresholdValues = [1, 2, 3, 4, 5];
const DEFAULT_DIGEST_HOUR = 9;

const formatTimeLabel = (hour?: number | null) => {
  const normalized = Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.round(Number(hour)))) : DEFAULT_DIGEST_HOUR;
  return `${String(normalized).padStart(2, "0")}:00`;
};

const normalizeUsername = (value?: string | null) => {
  if (!value) return "";
  return value.startsWith("@") ? value : `@${value}`;
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("ru-RU");
};

export default function TelegramSettingsPage() {
  const [state, setState] = React.useState<TelegramState | null>(null);
  const [invite, setInvite] = React.useState<TelegramInvite | null>(null);
  const [subs, setSubs] = React.useState<Subscriber[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [deactivatingId, setDeactivatingId] = React.useState<string | null>(null);
  const [err, setErr] = React.useState("");
  const [prefs, setPrefs] = React.useState({
    notifyOrders: true,
    notifyReviews: true,
    notifyReviewThreshold: 3,
    notifyDailyDigest: true,
    notifyFraud: true,
  });
  const [prefsSaving, setPrefsSaving] = React.useState(false);

  const loadAll = React.useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      const stateRes = await fetch("/api/portal/settings/telegram-notify/state");
      let s: any = null;
      try {
        s = await stateRes.json();
      } catch {}
      if (!stateRes.ok) {
        throw new Error(s?.message || "Не удалось загрузить состояние Telegram");
      }
      setState(s);

      if (s?.configured) {
        const inviteRes = await fetch("/api/portal/settings/telegram-notify/invite", { method: "POST" });
        let invitePayload: any = null;
        try {
          invitePayload = await inviteRes.json();
        } catch {}
        if (inviteRes.ok && invitePayload?.token) {
          setInvite(invitePayload as TelegramInvite);
        } else {
          setInvite(null);
          if (!inviteRes.ok) {
            setErr(invitePayload?.message || "Не удалось получить инвайт для Telegram");
          }
        }
      } else {
        setInvite(null);
      }

      const listRes = await fetch("/api/portal/settings/telegram-notify/subscribers");
      let list: any = null;
      try {
        list = await listRes.json();
      } catch {}
      if (!listRes.ok) {
        throw new Error((list && list.message) || "Не удалось загрузить список подключенных пользователей");
      }
      setSubs(Array.isArray(list) ? list : []);

      const prefRes = await fetch("/api/portal/settings/telegram-notify/preferences");
      let prefJson: any = null;
      try {
        prefJson = await prefRes.json();
      } catch {}
      if (prefRes.ok && prefJson && typeof prefJson === "object") {
        setPrefs({
          notifyOrders: !!prefJson.notifyOrders,
          notifyReviews: !!prefJson.notifyReviews,
          notifyReviewThreshold: Number.isFinite(prefJson.notifyReviewThreshold)
            ? Math.min(5, Math.max(1, Math.round(prefJson.notifyReviewThreshold)))
            : 3,
          notifyDailyDigest: !!prefJson.notifyDailyDigest,
          notifyFraud: prefJson.notifyFraud !== undefined ? !!prefJson.notifyFraud : true,
        });
      } else if (!prefRes.ok) {
        setErr((prefJson && prefJson.message) || "Не удалось загрузить настройки уведомлений");
      }

    } catch (e: any) {
      setErr(normalizeErrorMessage(e, "Не удалось загрузить настройки"));
      setState(null);
      setInvite(null);
      setSubs(null);
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  const generateNewToken = async () => {
    try {
      setBusy(true);
      setErr("");
      const res = await fetch("/api/portal/settings/telegram-notify/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceNew: true }),
      });
      let payload: any = null;
      try {
        payload = await res.json();
      } catch {}
      if (!res.ok || !payload?.token) {
        setInvite(null);
        if (!res.ok) setErr(payload?.message || "Не удалось сгенерировать новый инвайт");
      } else {
        setInvite(payload as TelegramInvite);
      }
    } catch (e: any) {
      setErr(normalizeErrorMessage(e, "Не удалось сгенерировать новый инвайт"));
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      setErr("");
      setDeactivatingId(id);
      const res = await fetch(`/api/portal/settings/telegram-notify/subscribers/${encodeURIComponent(id)}/deactivate`, {
        method: "POST",
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        let message = raw;
        try {
          const parsed = JSON.parse(raw);
          message = parsed?.message || parsed?.error || raw;
        } catch {}
        throw new Error(message || "Не удалось отключить уведомления");
      }
      setSubs((prev) => (Array.isArray(prev) ? prev.filter((item) => item.id !== id) : prev));
    } catch (e: any) {
      setErr(normalizeErrorMessage(e, "Не удалось отключить уведомления"));
    } finally {
      setDeactivatingId(null);
    }
  };

  const updatePreference = async (field: keyof typeof prefs, value: boolean | number) => {
    const previous = prefs[field] as any;
    setErr("");
    setPrefs((prevState) => ({ ...prevState, [field]: value } as typeof prefs));
    try {
      setPrefsSaving(true);
      const res = await fetch("/api/portal/settings/telegram-notify/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      let next: any = null;
      try {
        next = await res.json();
      } catch {}
      if (!res.ok) {
        throw new Error((next && next.message) || "Не удалось сохранить настройки уведомлений");
      }
    } catch (e: any) {
      setErr(normalizeErrorMessage(e, "Не удалось сохранить настройки уведомлений"));
      setPrefs((prevState) => ({ ...prevState, [field]: previous }));
    } finally {
      setPrefsSaving(false);
    }
  };

  const botUsername = state?.botUsername ? state.botUsername.replace("@", "") : "";
  const startUrl = invite?.startUrl || (state?.botLink ? `${state.botLink}?start=...` : "#");
  const startGroupUrl = invite?.startGroupUrl || (state?.botLink ? `${state.botLink}?startgroup=...` : "#");
  const dailyReportTime = formatTimeLabel(state?.digestHourLocal);

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-8 ">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Уведомления в Telegram</h2>
        <p className="text-gray-500 mt-1">Настройка оповещений о важных событиях в мессенджер.</p>
      </div>

      {err && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-lg">{err}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
            <h3 className="font-bold text-gray-900 text-lg">Подключение</h3>
            <div className="grid grid-cols-2 gap-4">
              <a
                href={startUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center space-x-2 py-3 rounded-lg font-medium transition-colors ${
                  invite ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-gray-100 text-gray-400 pointer-events-none"
                }`}
              >
                <Send size={18} />
                <span>Начать чат</span>
              </a>
              <button
                type="button"
                onClick={() => startGroupUrl && startGroupUrl !== "#" && window.open(startGroupUrl, "_blank")}
                className={`flex items-center justify-center space-x-2 py-3 rounded-lg font-medium transition-colors border ${
                  invite ? "bg-white border-gray-200 hover:bg-gray-50 text-gray-700" : "bg-gray-100 border-gray-100 text-gray-400"
                }`}
                disabled={!invite}
              >
                <Users size={18} />
                <span>В группу</span>
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-4">
            <h3 className="font-bold text-gray-900">Ручная настройка</h3>
            <ol className="list-decimal list-inside space-y-3 text-sm text-gray-600">
              <li>
                Откройте Telegram и найдите бота{" "}
                <span className="font-bold text-blue-600 bg-blue-50 px-1 rounded">@{botUsername || "bot"}</span>
              </li>
              <li>Нажмите кнопку <strong>Запустить</strong> или отправьте команду:</li>
            </ol>

            <div className="bg-gray-100 p-4 rounded-lg flex items-center justify-between group">
              <code className="text-gray-800 font-mono text-sm">/start {invite?.token || "..."}</code>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!invite?.token) return;
                    try {
                      await navigator.clipboard.writeText(`/start ${invite.token}`);
                    } catch {}
                  }}
                  className="p-1.5 bg-white rounded shadow-sm text-gray-500 hover:text-blue-600 transition-colors"
                  title="Копировать"
                  disabled={!invite?.token}
                >
                  <Copy size={16} />
                </button>
                <button
                  type="button"
                  onClick={generateNewToken}
                  className="p-1.5 bg-white rounded shadow-sm text-gray-500 hover:text-green-600 transition-colors"
                  title="Сгенерировать новый токен"
                  disabled={!state?.configured || busy}
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400">Токен является уникальным ключом сотрудника. Не передавайте его третьим лицам.</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
          <h3 className="font-bold text-gray-900 text-lg">Настройки уведомлений</h3>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                <Bell size={20} />
              </div>
              <div>
                <span className="block font-medium text-gray-900">Оповещать о новых заказах</span>
                <span className="text-xs text-gray-500">Уведомления при создании заказа</span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.notifyOrders}
                onChange={(e) => updatePreference("notifyOrders", e.target.checked)}
                className="sr-only peer"
                disabled={prefsSaving}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-yellow-50 text-yellow-600 rounded-lg">
                  <MessageCircle size={20} />
                </div>
                <div>
                  <span className="block font-medium text-gray-900">Оповещать о новых отзывах</span>
                  <span className="text-xs text-gray-500">Мгновенные уведомления об оценках</span>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.notifyReviews}
                  onChange={(e) => updatePreference("notifyReviews", e.target.checked)}
                  className="sr-only peer"
                  disabled={prefsSaving}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {prefs.notifyReviews && (
              <div className="pl-12 ">
                <label className="block text-sm font-medium text-gray-700 mb-2">Порог оценки (включительно и ниже)</label>
                <div className="flex gap-2">
                  {reviewThresholdValues.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => updatePreference("notifyReviewThreshold", val)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border flex items-center transition-colors ${
                        prefs.notifyReviewThreshold === val
                          ? "bg-yellow-50 border-yellow-200 text-yellow-700"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                      disabled={prefsSaving}
                    >
                      {val} <Star size={12} className="ml-1 fill-current" />
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Вы будете получать уведомления только об отзывах с оценкой <strong>{prefs.notifyReviewThreshold} и ниже</strong>.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                <FileText size={20} />
              </div>
              <div>
                <span className="block font-medium text-gray-900">Ежедневная сводка</span>
                <span className="text-xs text-gray-500">Отчет по показателям в {dailyReportTime}</span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.notifyDailyDigest}
                onChange={(e) => updatePreference("notifyDailyDigest", e.target.checked)}
                className="sr-only peer"
                disabled={prefsSaving}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                <AlertTriangle size={20} />
              </div>
              <div>
                <span className="block font-medium text-gray-900">Подозрительные действия</span>
                <span className="text-xs text-gray-500">Оповещения о нестандартной активности</span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.notifyFraud}
                onChange={(e) => updatePreference("notifyFraud", e.target.checked)}
                className="sr-only peer"
                disabled={prefsSaving}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="bg-gray-50 p-3 rounded-lg text-xs text-gray-500 flex items-start space-x-2">
            <ExternalLink size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              Настроить параметры определения подозрительной активности можно в разделе{" "}
              <a href="/loyalty/antifraud" className="text-blue-600 hover:underline ml-1">
                Защита от мошенничества
              </a>
              .
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Подключенные пользователи</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-semibold">Сотрудник / Название</th>
                <th className="px-6 py-4 font-semibold">Логин Telegram</th>
                <th className="px-6 py-4 font-semibold">Тип</th>
                <th className="px-6 py-4 font-semibold text-right">Подключен</th>
                <th className="px-6 py-4 font-semibold text-right">Отключить</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {Array.isArray(subs) && subs.length ? (
                subs.map((account) => {
                  const isGroup =
                    account.actorType === "GROUP" ||
                    account.chatType.includes("group") ||
                    account.chatType.includes("channel");
                  const displayName = isGroup
                    ? account.title || "Группа"
                    : account.staffName || "—";
                  const username = normalizeUsername(account.username);
                  return (
                    <tr key={account.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">{displayName}</td>
                      <td className="px-6 py-4 text-blue-600">{username || "—"}</td>
                      <td className="px-6 py-4">
                        {isGroup ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            <Users size={12} className="mr-1" /> группа
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            <User size={12} className="mr-1" /> личный
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-gray-500">{formatDate(account.addedAt)}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeactivate(account.id)}
                          className="inline-flex items-center text-xs font-medium text-red-600 hover:text-red-700 disabled:text-gray-300"
                          disabled={deactivatingId === account.id}
                        >
                          Отключить
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : subs === null ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                    Список недоступен
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                    Нет подключенных пользователей
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
