"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Smartphone,
  Copy,
  Check,
  Save,
  RefreshCw,
  Bot,
} from "lucide-react";
import { normalizeErrorMessage } from "lib/portal-errors";
import { useActionGuard, useLatestRequest } from "lib/async-guards";
import { readPortalApiCache } from "lib/cache";

type TelegramState = {
  enabled: boolean;
  botUsername: string | null;
  botLink: string | null;
  miniappUrl: string | null;
  connectionHealthy: boolean;
  tokenMask: string | null;
  message?: string | null;
};

type FetchResponse = TelegramState & { message?: string | null };

export default function TelegramMiniAppPage() {
  const router = useRouter();
  const [state, setState] = React.useState<TelegramState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [token, setToken] = React.useState("");
  const [actionPending, setActionPending] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [copiedLink, setCopiedLink] = React.useState(false);
  const [editingToken, setEditingToken] = React.useState(false);
  const { start: startLoad, isLatest } = useLatestRequest();
  const runAction = useActionGuard();

  React.useEffect(() => {
    const cached = readPortalApiCache<TelegramState>("/api/portal/integrations/telegram-mini-app");
    if (!cached || typeof cached !== "object") return;
    setState(cached);
    setMessage(cached.message || "");
  }, []);

  const load = React.useCallback(async () => {
    const requestId = startLoad();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/portal/integrations/telegram-mini-app");
      const data = await res.json().catch(() => null);
      if (!isLatest(requestId)) return;
      if (!res.ok) {
        setState(null);
        setError(
          (data && typeof data?.message === "string" && data.message) ||
            "Не удалось получить состояние интеграции",
        );
      } else {
        setState(data ?? null);
        setMessage((data && typeof data?.message === "string" && data.message) || "");
      }
    } catch (e: any) {
      if (!isLatest(requestId)) return;
      setState(null);
      setError(normalizeErrorMessage(e, "Ошибка"));
    } finally {
      if (isLatest(requestId)) setLoading(false);
    }
  }, [isLatest, startLoad]);

  React.useEffect(() => {
    load();
  }, [load]);

  const isEnabled = Boolean(state?.enabled);
  const isHealthy = Boolean(state?.connectionHealthy);
  const isConnected = isEnabled && isHealthy;
  const miniappLink = state?.miniappUrl || "";
  const botUsername = state?.botUsername || "";

  const connect = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Введите токен Telegram-бота");
      return;
    }
    await runAction(async () => {
      setActionPending(true);
      setError("");
      setMessage("");
      try {
        const res = await fetch("/api/portal/integrations/telegram-mini-app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: trimmed }),
        });
        const data: FetchResponse = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          throw new Error(
            (data && typeof data?.message === "string" && data.message) ||
              "Не удалось подключить бота",
          );
        }
        setState(data);
        setToken("");
        setEditingToken(false);
        setMessage(data?.message || "Telegram Mini App подключена");
      } catch (e: any) {
        setError(normalizeErrorMessage(e, "Ошибка"));
      } finally {
        setActionPending(false);
      }
    });
  };

  const disconnect = async () => {
    if (!confirm("Отключить бота? Ваше приложение в Telegram перестанет работать.")) {
      return;
    }
    await runAction(async () => {
      setActionPending(true);
      setError("");
      setMessage("");
      try {
        const res = await fetch("/api/portal/integrations/telegram-mini-app", {
          method: "DELETE",
        });
        const data: FetchResponse = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          throw new Error(
            (data && typeof data?.message === "string" && data.message) ||
              "Не удалось отключить интеграцию",
          );
        }
        setState(data);
        setToken("");
        setEditingToken(false);
        setMessage(data?.message || "Интеграция отключена");
      } catch (e: any) {
        setError(normalizeErrorMessage(e, "Ошибка"));
      } finally {
        setActionPending(false);
      }
    });
  };

  const checkConnection = async () => {
    await runAction(async () => {
      setChecking(true);
      setError("");
      try {
        const res = await fetch("/api/portal/integrations/telegram-mini-app/check", {
          method: "POST",
        });
        const data: FetchResponse = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          throw new Error(
            (data && typeof data?.message === "string" && data.message) ||
              "Не удалось проверить подключение",
          );
        }
        setState(data);
        setMessage(
          data?.message ||
            (data.connectionHealthy
              ? "Подключение к боту работает"
              : "Подключение к боту не удалось"),
        );
      } catch (e: any) {
        setError(normalizeErrorMessage(e, "Ошибка"));
      } finally {
        setChecking(false);
      }
    });
  };

  const handleCopyLink = () => {
    if (!miniappLink) return;
    navigator.clipboard.writeText(miniappLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-8 ">
      <div className="flex items-center space-x-4 mb-8">
        <button
          onClick={() => router.push("/settings/integrations")}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Telegram Miniapp</h2>
          <p className="text-gray-500 mt-1">
            Подключение собственного приложения лояльности внутри Telegram.
          </p>
        </div>
      </div>

      {(message || error) && (
        <div className="space-y-1">
          {message && <div className="text-sm text-green-600">{message}</div>}
          {error && <div className="text-sm text-orange-600">{error}</div>}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
        <div className="space-y-8">
          <div className="bg-gray-50 rounded-2xl border border-gray-100 p-8 flex flex-col items-center justify-center min-h-[500px]">
            <h3 className="text-lg font-semibold text-gray-700 mb-6">
              Как это выглядит у клиента
            </h3>

            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/screenshots/telegram-miniapp-1.png"
                alt="Экран мини-приложения Telegram"
                className="w-[260px] h-auto drop-shadow-2xl"
              />

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/screenshots/telegram-miniapp-2.png"
                alt="Экран QR-кода мини-приложения Telegram"
                className="w-[260px] h-auto drop-shadow-2xl hidden sm:block sm:mt-12"
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-2">Преимущества</h3>
            <ul className="space-y-2">
              <li className="flex items-start space-x-3 text-sm text-gray-600">
                <Check size={16} className="text-green-500 mt-0.5" />
                <span>
                  Клиент может зарегистрироваться в вашей программе лояльности
                  по QR-коду.
                </span>
              </li>
              <li className="flex items-start space-x-3 text-sm text-gray-600">
                <Check size={16} className="text-green-500 mt-0.5" />
                <span>
                  Клиент сможет использовать бот для списания и начисления
                  баллов.
                </span>
              </li>
              <li className="flex items-start space-x-3 text-sm text-gray-600">
                <Check size={16} className="text-green-500 mt-0.5" />
                <span>Рассылки, включая текст и изображения.</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">
                Настройка подключения
              </h3>
            </div>

            <div className="p-6 space-y-6">
              {isConnected && !editingToken ? (
                <div className="bg-green-50 border border-green-100 rounded-xl p-5 ">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="bg-green-100 p-3 rounded-full text-green-600">
                        <Bot size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-green-900">
                          Бот успешно подключен
                        </h4>
                        {botUsername && (
                          <p className="text-green-700 font-medium">
                            {botUsername}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={checkConnection}
                      disabled={checking || actionPending || loading}
                      className="text-gray-500 hover:text-green-700 p-2 rounded-full hover:bg-green-100 transition-colors disabled:opacity-60"
                      title="Проверить подключение"
                    >
                      <RefreshCw
                        size={18}
                        className={checking ? "animate-spin" : ""}
                      />
                    </button>
                  </div>

                  <div className="mt-6 pt-4 border-t border-green-100 flex items-center justify-between">
                    <button
                      onClick={() => setEditingToken(true)}
                      className="text-sm font-medium text-green-800 hover:underline"
                    >
                      Заменить токен
                    </button>
                    <button
                      onClick={disconnect}
                      disabled={actionPending}
                      className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-60"
                    >
                      Отключить
                    </button>
                  </div>
                </div>
              ) : isEnabled && !isHealthy && !editingToken ? (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 ">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="bg-amber-100 p-3 rounded-full text-amber-600">
                        <Bot size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-amber-900">
                          Бот подключен, но связь не работает
                        </h4>
                        {botUsername && (
                          <p className="text-amber-700 font-medium">
                            {botUsername}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={checkConnection}
                      disabled={checking || actionPending || loading}
                      className="text-gray-500 hover:text-amber-700 p-2 rounded-full hover:bg-amber-100 transition-colors disabled:opacity-60"
                      title="Проверить подключение"
                    >
                      <RefreshCw
                        size={18}
                        className={checking ? "animate-spin" : ""}
                      />
                    </button>
                  </div>

                  <div className="mt-6 pt-4 border-t border-amber-100 flex items-center justify-between">
                    <button
                      onClick={() => setEditingToken(true)}
                      className="text-sm font-medium text-amber-800 hover:underline"
                    >
                      Заменить токен
                    </button>
                    <button
                      onClick={disconnect}
                      disabled={actionPending}
                      className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-60"
                    >
                      Отключить
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Токен бота из BotFather
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all font-mono text-sm"
                        placeholder="123456789:ABCdefGhIJKlmNoPQRstuVWxyz"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <Smartphone size={18} />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Создайте нового бота в{" "}
                      <a
                        href="https://t.me/BotFather"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        @BotFather
                      </a>{" "}
                      и скопируйте полученный API Token.
                    </p>
                  </div>

                  <button
                    onClick={connect}
                    disabled={actionPending || loading}
                    className="w-full flex items-center justify-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-70 disabled:cursor-wait"
                  >
                    {actionPending ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        <span>Проверка...</span>
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        <span>Сохранить и подключить</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6">
            <h3 className="font-bold text-gray-900 text-lg">
              Настройка кнопки в Telegram
            </h3>

            <div className="space-y-4">
              {!miniappLink && (
                <p className="text-xs text-amber-600">
                  Ссылка на Mini App не настроена. Проверьте MINIAPP_BASE_URL.
                </p>
              )}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <label className="block text-xs font-bold text-blue-800 uppercase tracking-wide mb-1">
                  Ссылка на ваше приложение (Main App)
                </label>
                <div className="flex items-center space-x-2">
                  <code className="flex-1 bg-white border border-blue-200 rounded px-3 py-2 text-sm text-gray-700 font-mono truncate">
                    {miniappLink}
                  </code>
                  <button
                    onClick={handleCopyLink}
                    disabled={!miniappLink}
                    className={`p-2 rounded-lg transition-colors ${
                      copiedLink
                        ? "bg-green-500 text-white"
                        : "bg-white border border-blue-200 text-blue-600 hover:bg-blue-100"
                    } disabled:opacity-60`}
                  >
                    {copiedLink ? <Check size={18} /> : <Copy size={18} />}
                  </button>
                </div>
              </div>

              <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                <p>Для запуска приложения внутри бота выполните следующие действия:</p>
                <ol className="list-decimal list-inside space-y-2 ml-1">
                  <li>
                    В{" "}
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 font-medium"
                    >
                      BotFather
                    </a>{" "}
                    напишите команду{" "}
                    <code className="bg-gray-100 px-1 py-0.5 rounded">
                      /mybots
                    </code>
                    .
                  </li>
                  <li>Выберите вашего бота из списка.</li>
                  <li>
                    Перейдите в <strong>Bot Settings</strong> &rarr;{" "}
                    <strong>Configure Mini App</strong>.
                  </li>
                  <li>Нажмите <strong>Enable Mini App</strong>.</li>
                  <li>Вставьте вашу ссылку (скопируйте выше) и отправьте её боту.</li>
                </ol>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Не требуется устанавливать Menu Button - это делается
                  автоматически после подключения токена бота. Если кнопка
                  не добавилась автоматически, можно поставить её вручную в
                  BotFather.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
