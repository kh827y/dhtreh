"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Check,
  RefreshCw,
  Server,
  FileText,
  Code,
  ExternalLink,
  Eye,
  EyeOff,
  Terminal,
} from "lucide-react";
import { normalizeErrorMessage } from "lib/portal-errors";
import { useActionGuard, useLatestRequest } from "lib/async-guards";
import { readPortalApiCache } from "lib/cache";

type RateLimit = { limit?: number; ttl?: number };
type RateLimits = {
  code?: RateLimit;
  calculate?: RateLimit;
  bonus?: RateLimit;
  refund?: RateLimit;
  operations?: RateLimit;
  outlets?: RateLimit;
  devices?: RateLimit;
  clientMigrate?: RateLimit;
};

type RestApiState = {
  enabled: boolean;
  status?: string;
  integrationId: string | null;
  apiKeyMask: string | null;
  baseUrl: string | null;
  rateLimits?: RateLimits;
  issuedAt: string | null;
  availableEndpoints?: string[];
  message?: string | null;
};

type IssueResponse = RestApiState & { apiKey?: string | null; message?: string | null };

const endpoints = [
  {
    method: "POST",
    url: "code",
    title: "Расшифровка кода",
    description:
      "Получение информации о клиенте по QR-коду из приложения. Возвращает баланс, уровень лояльности, % начисления и списания и прочую информацию.",
  },
  {
    method: "POST",
    url: "calculate/action",
    title: "Применение акций",
    description:
      "Рассчитать количество подарочных позиций, повышенных баллов за товары, акционные цены на товары в корзине и тд согласно активным акциям.",
  },
  {
    method: "POST",
    url: "calculate/bonus",
    title: "Предрасчёт бонусов",
    description:
      "Расчёт количества максимальных баллов для начисления/списания по чеку с учетом акций без фиксации операции.",
  },
  {
    method: "POST",
    url: "bonus",
    title: "Фиксация покупки",
    description: "Применение списания/начисления баллов с переданными значениями.",
  },
  {
    method: "POST",
    url: "refund",
    title: "Возврат",
    description:
      "Отмена операции. Возвращает списанные баллы клиенту и аннулирует начисленные за этот чек.",
  },
];

export default function RestApiIntegrationPage() {
  const router = useRouter();
  const [state, setState] = React.useState<RestApiState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [issuedKey, setIssuedKey] = React.useState<string | null>(null);
  const [showKey, setShowKey] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState(false);
  const [copiedUrl, setCopiedUrl] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [disablePending, setDisablePending] = React.useState(false);
  const { start: startLoad, isLatest } = useLatestRequest();
  const runAction = useActionGuard();

  React.useEffect(() => {
    const cached = readPortalApiCache<RestApiState>("/api/portal/integrations/rest-api");
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
      const res = await fetch("/api/portal/integrations/rest-api");
      const data: RestApiState = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(
          (data && (data as any)?.message) ||
            "Не удалось получить состояние REST API",
        );
      }
      if (!isLatest(requestId)) return;
      setState(data || null);
      setMessage((data && data.message) || "");
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

  const baseUrl = React.useMemo(() => {
    const base = (state?.baseUrl || "").replace(/\/$/, "");
    if (!base) return "/api/integrations";
    return `${base}/api/integrations`;
  }, [state?.baseUrl]);

  const apiKeyValue = issuedKey ?? state?.apiKeyMask ?? "";

  const keyPreview = apiKeyValue
    ? `${apiKeyValue.substring(0, 12)}...`
    : "rk_****";

  const handleCopy = (text: string, setCopied: (value: boolean) => void) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateKey = async () => {
    if (
      !confirm(
        "Вы уверены? Старый ключ перестанет работать, что может нарушить работу интеграции.",
      )
    ) {
      return;
    }
    await runAction(async () => {
      setPending(true);
      setError("");
      setMessage("");
      try {
        const res = await fetch("/api/portal/integrations/rest-api/issue", {
          method: "POST",
        });
        const data: IssueResponse = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          throw new Error((data && data.message) || "Не удалось сгенерировать ключ");
        }
        setState(data || null);
        setIssuedKey(data?.apiKey || null);
        setMessage(data?.message || "API-ключ обновлён");
      } catch (e: any) {
        setError(normalizeErrorMessage(e, "Ошибка"));
      } finally {
        setPending(false);
      }
    });
  };

  const handleDisable = async () => {
    if (!state?.enabled) return;
    if (!confirm("Отключить REST API? Доступ по ключу будет закрыт.")) {
      return;
    }
    await runAction(async () => {
      setDisablePending(true);
      setError("");
      setMessage("");
      try {
        const res = await fetch("/api/portal/integrations/rest-api", {
          method: "DELETE",
        });
        const data: RestApiState = await res.json().catch(() => ({} as any));
        if (!res.ok) {
          throw new Error(
            (data && (data as any)?.message) || "Не удалось отключить интеграцию",
          );
        }
        setState(data || null);
        setIssuedKey(null);
        setMessage(data?.message || "Интеграция отключена");
      } catch (e: any) {
        setError(normalizeErrorMessage(e, "Ошибка"));
      } finally {
        setDisablePending(false);
      }
    });
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
          <h2 className="text-2xl font-bold text-gray-900">REST API</h2>
          <p className="text-gray-500 mt-1">
            Интеграция с кассовым ПО и внешними системами.
          </p>
        </div>
      </div>

      {(message || error) && (
        <div className="space-y-1">
          {message && <div className="text-sm text-green-600">{message}</div>}
          {error && <div className="text-sm text-orange-600">{error}</div>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center space-x-2 border-b border-gray-100 pb-4">
              <Server size={20} className="text-blue-600" />
              <h3 className="font-bold text-gray-900">Параметры подключения</h3>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Base URL
              </label>
              <div className="flex items-center space-x-2">
                <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 font-mono text-sm truncate">
                  {baseUrl}
                </code>
                <button
                  onClick={() => handleCopy(baseUrl, setCopiedUrl)}
                  className={`p-2 rounded-lg transition-colors ${
                    copiedUrl
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  }`}
                  title="Копировать URL"
                >
                  {copiedUrl ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                API Token
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKeyValue}
                  readOnly
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-20 py-2 text-gray-800 font-mono text-sm focus:outline-none"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex space-x-1">
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button
                    onClick={() => handleCopy(apiKeyValue, setCopiedKey)}
                    className={`p-1.5 rounded transition-colors ${
                      copiedKey
                        ? "text-green-600"
                        : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    {copiedKey ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Передавайте этот ключ в заголовке{" "}
                <code className="bg-gray-100 px-1 rounded text-gray-600">
                  X-Api-Key: TOKEN
                </code>
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={handleRegenerateKey}
                disabled={pending || loading}
                className="w-full flex items-center justify-center space-x-2 border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-70 disabled:cursor-wait"
              >
                <RefreshCw size={14} />
                <span>Сгенерировать новый ключ</span>
              </button>
            </div>
            {state?.enabled ? (
              <div className="pt-2">
                <button
                  onClick={handleDisable}
                  disabled={disablePending || loading}
                  className="w-full flex items-center justify-center space-x-2 border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-70 disabled:cursor-wait"
                >
                  <RefreshCw size={14} />
                  <span>Отключить интеграцию</span>
                </button>
              </div>
            ) : null}
          </div>

          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-xl shadow-md text-white">
            <div className="flex items-center space-x-3 mb-4">
              <FileText size={24} className="text-blue-100" />
              <h3 className="font-bold text-lg">Документация</h3>
            </div>
            <p className="text-blue-100 text-sm mb-6 leading-relaxed">
              Полное описание методов, форматов запросов и кодов ошибок доступно
              в нашей базе знаний.
            </p>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                alert("Переход на https://docs.api.link");
              }}
              className="flex items-center justify-between w-full bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-4 py-3 transition-colors group"
            >
              <span className="font-medium text-sm">Перейти к документации</span>
              <ExternalLink
                size={16}
                className="group-hover:translate-x-1 transition-transform"
              />
            </a>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <h3 className="text-xl font-bold text-gray-900 flex items-center">
            <Code size={24} className="text-purple-600 mr-2" />
            Основные методы
          </h3>

          <div className="space-y-4">
            {endpoints.map((ep, idx) => (
              <div
                key={idx}
                className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow group"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
                  <div className="flex items-center space-x-3 mb-2 sm:mb-0">
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold font-mono">
                      {ep.method}
                    </span>
                    <span className="font-mono text-sm text-gray-600 bg-gray-50 px-2 py-1 rounded">
                      .../{ep.url}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-gray-900">{ep.title}</span>
                </div>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                  {ep.description}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-gray-900 rounded-xl p-6 shadow-md border border-gray-800">
            <div className="flex items-center space-x-2 text-gray-400 mb-4 border-b border-gray-800 pb-3">
              <Terminal size={18} />
              <span className="text-xs font-mono">Пример запроса (cURL)</span>
            </div>
            <div className="font-mono text-xs text-gray-300 leading-relaxed overflow-x-auto">
              <p>
                <span className="text-purple-400">curl</span> -X POST \\
              </p>
              <p className="pl-4">{`'${baseUrl}/calculate/bonus' \\\\`}</p>
              <p className="pl-4">{`-H 'X-Api-Key: ${keyPreview}' \\\\`}</p>
              <p className="pl-4">{`-H 'Content-Type: application/json' \\\\`}</p>
              <p className="pl-4">{`-d '{`}</p>
              <p className="pl-8">{`"user_token": "qr_123456",`}</p>
              <p className="pl-8">{`"outlet_id": "OUT-1",`}</p>
              <p className="pl-8">{`"items": [{"id_product": "SKU-1", "qty": 2, "price": 450}]`}</p>
              <p className="pl-4">{`}'`}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
