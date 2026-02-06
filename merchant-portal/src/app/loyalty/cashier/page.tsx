"use client";
import React from "react";
import {
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  RefreshCw,
  Shield,
  Store,
  X,
} from "lucide-react";
import { readApiError, readErrorMessage } from "lib/portal-errors";
import { useActionGuard, useLatestRequest } from "lib/async-guards";

type CashierCreds = {
  login: string;
};

type CashierPin = {
  id: string;
  staffId: string;
  staffName: string | null;
  outletId: string;
  outletName: string | null;
  pinCode: string | null;
  status: string | null;
  updatedAt: string | null;
};

type CashierActivationCode = {
  id: string;
  tokenHint: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  status: string;
};

type CashierDeviceSession = {
  id: string;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  status: string;
};

function extractInitials(source: string) {
  const parts = String(source || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "—";
  return parts
    .map((part) => part[0]?.toUpperCase?.() || "")
    .join("");
}

function shouldDisplayPinStatus(status: string | null) {
  const normalized = String(status || "")
    .trim()
    .toUpperCase();
  return normalized !== "REVOKED";
}

function formatDateTime(value: string) {
  try {
    const date = new Date(value);
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return value;
  }
}

function formatDateTimeOptional(value?: string | null) {
  if (!value) return "—";
  return formatDateTime(value);
}

function mapActivationStatus(status: string) {
  const normalized = String(status || "")
    .trim()
    .toUpperCase();
  switch (normalized) {
    case "ACTIVE":
      return {
        label: "Активен",
        className: "bg-green-50 text-green-700 border border-green-100",
      };
    case "USED":
      return {
        label: "Использован",
        className: "bg-gray-50 text-gray-700 border border-gray-100",
      };
    case "EXPIRED":
      return {
        label: "Истёк",
        className: "bg-amber-50 text-amber-700 border border-amber-100",
      };
    case "REVOKED":
      return {
        label: "Отозван",
        className: "bg-red-50 text-red-700 border border-red-100",
      };
    default:
      return {
        label: "—",
        className: "bg-gray-50 text-gray-700 border border-gray-100",
      };
  }
}

export default function CashierPanelPage() {
  const [loading, setLoading] = React.useState(true);
  const [busyIssue, setBusyIssue] = React.useState(false);
  const [busyRevokeId, setBusyRevokeId] = React.useState<string | null>(null);
  const [busyRevokeSessionId, setBusyRevokeSessionId] = React.useState<string | null>(null);
  const { start: startLoad, isLatest: isLatestLoad } = useLatestRequest();
  const runAction = useActionGuard();

  const [appLogin, setAppLogin] = React.useState("");
  const [issueCount, setIssueCount] = React.useState(6);
  const [issuedCodes, setIssuedCodes] = React.useState<string[]>([]);
  const [issuedExpiresAt, setIssuedExpiresAt] = React.useState<string | null>(
    null,
  );
  const [activationCodes, setActivationCodes] = React.useState<
    CashierActivationCode[]
  >([]);

  const [staffPins, setStaffPins] = React.useState<CashierPin[]>([]);
  const [visiblePins, setVisiblePins] = React.useState<Record<string, boolean>>(
    {},
  );
  const [deviceSessions, setDeviceSessions] = React.useState<CashierDeviceSession[]>([]);

  const loadCreds = React.useCallback(async (): Promise<CashierCreds | null> => {
    const response = await fetch("/api/portal/cashier", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Не удалось загрузить доступы кассира"),
      );
    }
    const data = (await response.json().catch(() => null)) as any;
    return {
      login: typeof data?.login === "string" ? data.login : "",
    };
  }, []);

  const loadActivationCodes = React.useCallback(async () => {
    const response = await fetch("/api/portal/cashier/activation-codes", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(
          response,
          "Не удалось загрузить коды активации",
        ),
      );
    }
    const data = (await response.json().catch(() => null)) as any;
    if (!Array.isArray(data)) return [] as CashierActivationCode[];
    return data.map((item: any) => ({
      id: String(item?.id ?? ""),
      tokenHint: typeof item?.tokenHint === "string" ? item.tokenHint : null,
      createdAt: typeof item?.createdAt === "string" ? item.createdAt : "",
      expiresAt: typeof item?.expiresAt === "string" ? item.expiresAt : "",
      usedAt: typeof item?.usedAt === "string" ? item.usedAt : null,
      revokedAt: typeof item?.revokedAt === "string" ? item.revokedAt : null,
      status: typeof item?.status === "string" ? item.status : "",
    }));
  }, []);

  const loadPins = React.useCallback(async (): Promise<CashierPin[]> => {
    const response = await fetch("/api/portal/cashier/pins", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Не удалось загрузить PIN-коды сотрудников"),
      );
    }
    const data = (await response.json().catch(() => null)) as any;
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      id: String(item?.id ?? ""),
      staffId: String(item?.staffId ?? ""),
      staffName: typeof item?.staffName === "string" ? item.staffName : null,
      outletId: String(item?.outletId ?? ""),
      outletName: typeof item?.outletName === "string" ? item.outletName : null,
      pinCode: typeof item?.pinCode === "string" ? item.pinCode : null,
      status: typeof item?.status === "string" ? item.status : null,
      updatedAt: typeof item?.updatedAt === "string" ? item.updatedAt : null,
    }));
  }, []);

  const loadDeviceSessions = React.useCallback(async () => {
    const response = await fetch("/api/portal/cashier/device-sessions", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(
          response,
          "Не удалось загрузить активные устройства кассы",
        ),
      );
    }
    const data = (await response.json().catch(() => null)) as any;
    if (!Array.isArray(data)) return [] as CashierDeviceSession[];
    return data.map((item: any) => ({
      id: String(item?.id ?? ""),
      createdAt: typeof item?.createdAt === "string" ? item.createdAt : "",
      lastSeenAt: typeof item?.lastSeenAt === "string" ? item.lastSeenAt : null,
      expiresAt: typeof item?.expiresAt === "string" ? item.expiresAt : "",
      ipAddress: typeof item?.ipAddress === "string" ? item.ipAddress : null,
      userAgent: typeof item?.userAgent === "string" ? item.userAgent : null,
      status: typeof item?.status === "string" ? item.status : "",
    }));
  }, []);

  const reload = React.useCallback(async () => {
    const requestId = startLoad();
    setLoading(true);
    try {
      const [nextCreds, nextPins, nextCodes, nextSessions] = await Promise.all([
        loadCreds(),
        loadPins(),
        loadActivationCodes(),
        loadDeviceSessions(),
      ]);
      if (!isLatestLoad(requestId)) return;
      setAppLogin(nextCreds?.login ?? "");
      setStaffPins(nextPins);
      setActivationCodes(nextCodes);
      setDeviceSessions(nextSessions);
    } catch (error) {
      if (!isLatestLoad(requestId)) return;
      const message = error instanceof Error ? error.message : String(error || "");
      alert(readApiError(message) || "Не удалось загрузить данные панели кассира");
      setStaffPins([]);
      setActivationCodes([]);
      setDeviceSessions([]);
    } finally {
      if (isLatestLoad(requestId)) setLoading(false);
    }
  }, [loadActivationCodes, loadCreds, loadPins, loadDeviceSessions, isLatestLoad, startLoad]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const copyToClipboard = React.useCallback(async (text: string) => {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      alert("Не удалось скопировать в буфер обмена");
    }
  }, []);

  const issueActivationCodes = React.useCallback(() => {
    void runAction(async () => {
      if (busyIssue) return;
      setBusyIssue(true);
      try {
        const response = await fetch("/api/portal/cashier/activation-codes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: issueCount }),
        });
        if (!response.ok) {
          throw new Error(
            await readErrorMessage(
              response,
              "Не удалось выпустить коды активации",
            ),
          );
        }
        const data = (await response.json().catch(() => null)) as any;
        const codes = Array.isArray(data?.codes) ? data.codes : [];
        setIssuedCodes(codes.map((code: any) => String(code ?? "")).filter(Boolean));
        setIssuedExpiresAt(typeof data?.expiresAt === "string" ? data.expiresAt : null);
        await reload();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "");
        alert(readApiError(message) || "Не удалось выпустить коды активации");
      } finally {
        setBusyIssue(false);
      }
    });
  }, [busyIssue, issueCount, reload, runAction]);

  const revokeActivationCode = React.useCallback(
    (id: string) => {
      void runAction(async () => {
        const codeId = String(id || "").trim();
        if (!codeId || busyRevokeId) return;
        setBusyRevokeId(codeId);
        try {
          const response = await fetch(
            "/api/portal/cashier/activation-codes/revoke",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: codeId }),
            },
          );
          if (!response.ok) {
            throw new Error(
              await readErrorMessage(response, "Не удалось отозвать код"),
            );
          }
          await reload();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error || "");
          alert(readApiError(message) || "Не удалось отозвать код");
        } finally {
          setBusyRevokeId(null);
        }
      });
    },
    [busyRevokeId, reload, runAction],
  );

  const revokeDeviceSession = React.useCallback(
    (id: string) => {
      void runAction(async () => {
        const sessionId = String(id || "").trim();
        if (!sessionId || busyRevokeSessionId) return;
        if (!confirm("Отозвать доступ у выбранного устройства?")) return;
        setBusyRevokeSessionId(sessionId);
        try {
          const response = await fetch(
            "/api/portal/cashier/device-sessions/revoke",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: sessionId }),
            },
          );
          if (!response.ok) {
            throw new Error(
              await readErrorMessage(response, "Не удалось отозвать устройство"),
            );
          }
          await reload();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error || "");
          alert(readApiError(message) || "Не удалось отозвать устройство");
        } finally {
          setBusyRevokeSessionId(null);
        }
      });
    },
    [busyRevokeSessionId, reload, runAction],
  );

  const filteredPins = React.useMemo(
    () => staffPins.filter((pin) => shouldDisplayPinStatus(pin.status)),
    [staffPins],
  );

  const togglePinVisibility = React.useCallback((id: string) => {
    setVisiblePins((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-8 ">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Панель кассира</h2>
        <p className="text-gray-500 mt-1">
          Настройка доступов к терминалу и управление PIN-кодами сотрудников.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Col: App Credentials */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center space-x-2 border-b border-gray-100 pb-4">
              <MonitorSmartphone className="text-purple-600" size={20} />
              <h3 className="text-lg font-bold text-gray-900">Доступ к приложению</h3>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 leading-relaxed">
              Логин общий для всех сотрудников. Пароли создаются одноразовые (истекут через 3 дня, если не использовать).
            </div>

            <div className="space-y-[14px]">
              {/* Login Field */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Логин
                </label>
                <div className="flex items-center space-x-2 mt-[7px]">
                  <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 font-mono text-sm">
                    {appLogin}
                  </code>
                  <button
                    type="button"
                    disabled={!appLogin}
                    onClick={() => copyToClipboard(appLogin)}
                    className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                    title="Копировать"
                  >
                    <Copy size={18} />
                  </button>
                </div>
              </div>

              {/* Activation codes */}
              <div className="pt-1 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Одноразовые пароли
                  </label>
                  <div className="flex items-center space-x-2 mt-[7px]">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={50}
                    value={issueCount}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!Number.isFinite(next)) return;
                      setIssueCount(Math.max(1, Math.min(50, Math.trunc(next))));
                    }}
                    className="w-24 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none"
                    aria-label="Количество кодов"
                  />
                  <button
                    type="button"
                    aria-busy={busyIssue}
                    aria-disabled={busyIssue || loading}
                    onClick={issueActivationCodes}
                    className="flex-1 flex items-center justify-center space-x-2 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    <RefreshCw size={16} />
                    <span>Выпустить пароли</span>
                  </button>
                </div>
                  <p className="text-xs text-gray-400 mt-[3px]">
                    После выпуска коды показываются один раз.
                  </p>
                </div>

              {issuedCodes.length ? (
                <div className="space-y-3">
                  <div className="text-xs text-gray-500">
                    Новые коды до{" "}
                    <span className="font-medium text-gray-700">
                      {issuedExpiresAt ? formatDateTime(issuedExpiresAt) : "—"}
                    </span>
                  </div>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {issuedCodes.map((code) => (
                      <div key={code} className="flex items-center space-x-2">
                        <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-900 font-mono text-sm">
                          {code}
                        </code>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(code)}
                          className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="Копировать"
                        >
                          <Copy size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Выпущенные пароли
                  </div>
                  <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                    {loading ? (
                      <div className="flex items-center justify-center py-6 text-sm text-gray-500">
                        <Loader2 size={16} className="animate-spin mr-2" />
                        <span>Загружаем коды…</span>
                      </div>
                    ) : activationCodes.map((code) => {
                      const badge = mapActivationStatus(code.status);
                      const isActive =
                        String(code.status || "").trim().toUpperCase() ===
                        "ACTIVE";
                      return (
                        <div
                          key={code.id}
                          className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center space-x-2">
                              <code className="font-mono text-sm text-gray-900">
                                •••{code.tokenHint || "—"}
                              </code>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              До{" "}
                              {code.expiresAt
                                ? formatDateTime(code.expiresAt)
                                : "—"}
                            </div>
                          </div>
                          <div className="flex items-center space-x-1">
                            {isActive ? (
                              <button
                                type="button"
                                disabled={Boolean(busyRevokeId)}
                                onClick={() => revokeActivationCode(code.id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Отозвать код"
                              >
                                <X size={16} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    {!loading && activationCodes.length === 0 ? (
                      <div className="text-sm text-gray-500">
                        Код активации ещё не выпускался.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Staff PINs */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
              <div className="flex items-center space-x-2">
                <KeyRound className="text-purple-600" size={20} />
                <h3 className="text-lg font-bold text-gray-900">PIN-коды сотрудников</h3>
              </div>
              <a
                href="/settings/staff"
                className="flex items-center space-x-1 text-sm text-gray-400 font-medium transition-colors"
                title="Управление сотрудниками"
              >
                <span>Управление сотрудниками</span>
                <ExternalLink size={14} />
              </a>
            </div>

            <div className="p-6 bg-gray-50/50 border-b border-gray-100">
              <div className="flex items-start space-x-3 text-sm text-gray-600">
                <Shield size={18} className="text-purple-600 mt-0.5 flex-shrink-0" />
                <p>
                  Индивидуальные 4-значные PIN-коды для каждого сотрудника,
                  запрашиваемые для доступа к операциям с баллами в панели кассира.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[420px]">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Сотрудник</th>
                    <th className="px-6 py-4 font-semibold">Торговая точка</th>
                    <th className="px-6 py-4 font-semibold w-40">PIN-код</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr>
                      <td className="px-6 py-6 text-center text-gray-500" colSpan={3}>
                        <span className="inline-flex items-center">
                          <Loader2 size={16} className="animate-spin mr-2" />
                          Загружаем PIN-коды…
                        </span>
                      </td>
                    </tr>
                  ) : filteredPins.map((pin) => {
                    const name = String(pin.staffName || "").trim();
                    const outlet = String(pin.outletName || "").trim();
                    const initials = extractInitials(name);
                    const pinValue = String(pin.pinCode || "").trim();
                    const isVisible = Boolean(visiblePins[pin.id]);
                    return (
                      <tr key={pin.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-xs">
                              {initials}
                            </div>
                            <span>{name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          <div className="flex items-center space-x-2">
                            <Store size={14} className="text-gray-400" />
                            <span>{outlet}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-1.5 w-32">
                            <span
                              className={`font-mono font-bold text-lg ${isVisible ? "text-gray-900" : "text-gray-400"}`}
                            >
                              {pinValue ? (isVisible ? pinValue : "••••") : "—"}
                            </span>
                            <button
                              type="button"
                              disabled={!pinValue}
                              onClick={() => togglePinVisibility(pin.id)}
                              className="text-gray-400 hover:text-purple-600 transition-colors"
                              title={isVisible ? "Скрыть PIN" : "Показать PIN"}
                            >
                              {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && filteredPins.length === 0 ? (
                    <tr>
                      <td className="px-6 py-6 text-gray-500" colSpan={3}>
                        PIN-коды ещё не выданы. Добавьте доступы в карточке сотрудника.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center space-x-2">
              <MonitorSmartphone className="text-purple-600" size={20} />
              <h3 className="text-lg font-bold text-gray-900">Активные устройства кассы</h3>
            </div>
            <div className="p-6 space-y-3">
              {loading ? (
                <div className="text-sm text-gray-500 inline-flex items-center">
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Загружаем устройства…
                </div>
              ) : deviceSessions.length ? (
                deviceSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gray-50 border border-gray-100 rounded-lg px-4 py-3"
                  >
                    <div className="space-y-1 text-sm text-gray-600">
                      <div>
                        <span className="text-gray-500">Последняя активность:</span>{" "}
                        <span className="text-gray-800">
                          {formatDateTimeOptional(session.lastSeenAt || session.createdAt)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Истекает:</span>{" "}
                        <span className="text-gray-800">{formatDateTimeOptional(session.expiresAt)}</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {session.ipAddress || "IP —"} · {session.userAgent || "устройство —"}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(busyRevokeSessionId)}
                      onClick={() => revokeDeviceSession(session.id)}
                      className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Отозвать
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">Активных устройств нет.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
