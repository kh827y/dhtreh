"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { createPortal } from "react-dom";

type TierSummary = {
  id: string;
  name: string;
  customersCount: number;
};

type TierMember = {
  customerId: string;
  name: string | null;
  phone: string | null;
  assignedAt: string;
  source: string | null;
  totalSpent: number | null;
  firstSeenAt: string | null;
};

type TierMembersResponse = {
  tierId: string;
  total: number;
  items: TierMember[];
  nextCursor: string | null;
};

function humanError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU");
}

function formatMoney(value: number | null) {
  if (value == null) return "—";
  return `${value.toLocaleString("ru-RU")} ₽`;
}

export function TierMembersModal({
  tier,
  open,
  onClose,
}: {
  tier: TierSummary | null;
  open: boolean;
  onClose: () => void;
}) {
  let router: ReturnType<typeof useRouter> | null = null;
  try {
    router = useRouter();
  } catch {
    router = null;
  }
  const safeRouter =
    router ??
    ({
      push: () => {},
      replace: () => {},
      refresh: () => {},
    } as const);
  const [members, setMembers] = React.useState<TierMember[]>([]);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(0);

  const mapResponse = React.useCallback(
    (payload: TierMembersResponse | TierMember[] | null | undefined) => {
      if (!payload) return { items: [], total: 0, nextCursor: null };
      if (Array.isArray(payload)) {
        return {
          items: payload,
          total: payload.length,
          nextCursor: null,
        };
      }
      return {
        items: Array.isArray(payload.items) ? payload.items : [],
        total: Number(payload.total ?? 0) || 0,
        nextCursor: payload.nextCursor ?? null,
      };
    },
    [],
  );

  const loadMembers = React.useCallback(
    async (cursor?: string | null, append = false) => {
      if (!tier?.id) return;
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams({ limit: "100" });
        if (cursor) qs.set("cursor", cursor);
        const res = await fetch(
          `/api/portal/loyalty/tiers/${encodeURIComponent(tier.id)}/customers?${qs.toString()}`,
          { cache: "no-store" },
        );
        if (!res.ok)
          throw new Error(
            (await res.text().catch(() => "")) ||
              "Не удалось загрузить клиентов уровня",
          );
        const payload = mapResponse(await res.json().catch(() => null));
        const normalized = payload.items.map((item) => ({
          customerId: item?.customerId ?? (item as any)?.merchantCustomerId ?? "",
          name: item?.name ?? null,
          phone: item?.phone ?? null,
          assignedAt: item?.assignedAt ?? "",
          source: item?.source ?? null,
          totalSpent:
            item?.totalSpent != null ? Number(item.totalSpent) : null,
          firstSeenAt: item?.firstSeenAt ?? null,
        }));
        setNextCursor(payload.nextCursor ?? null);
        setTotal(payload.total ?? normalized.length);
        setMembers((prev) => (append ? [...prev, ...normalized] : normalized));
      } catch (e: any) {
        if (!append) {
          setMembers([]);
          setNextCursor(null);
          setTotal(0);
        }
        setError(humanError(e, "Не удалось загрузить клиентов"));
      } finally {
        setLoading(false);
      }
    },
    [tier?.id, mapResponse],
  );

  React.useEffect(() => {
    if (!open || !tier) return;
    setMembers([]);
    setSearch("");
    setError("");
    setNextCursor(null);
    setTotal(0);
    void loadMembers();
  }, [open, tier?.id, loadMembers]);

  const filteredMembers = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter((member) => {
      const phone = member.phone?.toLowerCase() ?? "";
      const name = member.name?.toLowerCase() ?? "";
      return (
        phone.includes(term) ||
        name.includes(term) ||
        member.customerId.toLowerCase().includes(term)
      );
    });
  }, [members, search]);

  const handleMemberClick = (member: TierMember) => {
    if (!member.customerId) return;
    onClose();
    safeRouter.push(`/customers/${member.customerId}`);
  };

  if (!open || !tier) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl sticky top-0 z-10">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              Участники уровня <span className="text-purple-600">{tier.name}</span>
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Всего участников: {total || tier.customersCount}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
            aria-label="Закрыть модалку состава"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-4 border-b border-gray-100 bg-white space-y-3">
          {error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
              {error}
            </div>
          ) : null}
          <div className="relative max-w-md">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени или телефону..."
              className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-3 font-semibold bg-gray-50">Имя</th>
                <th className="px-6 py-3 font-semibold bg-gray-50">Телефон</th>
                <th className="px-6 py-3 font-semibold bg-gray-50 text-right">
                  Потрачено
                </th>
                <th className="px-6 py-3 font-semibold bg-gray-50 text-right">
                  Дата рег.
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && !members.length ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
                    <div className="flex items-center justify-center space-x-2">
                      <Loader2 className="animate-spin" size={18} />
                      <span>Загружаем участников…</span>
                    </div>
                  </td>
                </tr>
              ) : filteredMembers.length > 0 ? (
                filteredMembers.map((member) => (
                  <tr
                    key={`${member.customerId}:${member.assignedAt}`}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => handleMemberClick(member)}
                  >
                    <td className="px-6 py-3 font-medium text-gray-900">
                      {member.name || member.phone || member.customerId}
                    </td>
                    <td className="px-6 py-3 text-gray-600 font-mono text-xs">
                      {member.phone || "—"}
                    </td>
                    <td className="px-6 py-3 text-right font-medium">
                      {formatMoney(member.totalSpent)}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-500">
                      {formatDate(member.firstSeenAt)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
                    Участники не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-gray-50 rounded-b-xl flex justify-end space-x-3 border-t border-gray-100">
          {nextCursor ? (
            <button
              type="button"
              onClick={() => loadMembers(nextCursor, true)}
              disabled={loading}
              className="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-60 flex items-center space-x-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              <span>{loading ? "Загружаем…" : "Загрузить ещё"}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
