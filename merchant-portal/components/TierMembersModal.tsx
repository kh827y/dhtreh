"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, Icons, Skeleton } from "@loyalty/ui";

type TierSummary = {
  id: string;
  name: string;
  customersCount: number;
};

type TierMember = {
  merchantCustomerId: string | null;
  customerId: string;
  name: string | null;
  phone: string | null;
  assignedAt: string;
  source: string | null;
};

type TierMembersResponse = {
  tierId: string;
  total: number;
  items: TierMember[];
  nextCursor: string | null;
};

export function TierMembersModal({
  tier,
  open,
  onClose,
}: {
  tier: TierSummary | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
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
        if (!res.ok) throw new Error((await res.text()) || res.statusText);
        const payload = mapResponse(await res.json().catch(() => null));
        const normalized = payload.items.map((item) => ({
          merchantCustomerId: item?.merchantCustomerId ?? null,
          customerId: item?.customerId ?? "",
          name: item?.name ?? null,
          phone: item?.phone ?? null,
          assignedAt: item?.assignedAt ?? "",
          source: item?.source ?? null,
        }));
        setNextCursor(payload.nextCursor ?? null);
        setTotal(payload.total ?? normalized.length);
        setMembers((prev) =>
          append ? [...prev, ...normalized] : normalized,
        );
      } catch (e: any) {
        if (!append) {
          setMembers([]);
          setNextCursor(null);
          setTotal(0);
        }
        setError(String(e?.message || e || "Не удалось загрузить клиентов"));
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
    if (!member.merchantCustomerId) return;
    onClose();
    router.push(`/customers/${member.merchantCustomerId}`);
  };

  const showModal = open && tier;
  const { Search, X } = Icons;

  if (!showModal) return null;

  const formatDateTime = (value: string) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.74)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 120,
      }}
    >
      <div
        style={{
          width: "min(720px, 96vw)",
          maxHeight: "94vh",
          overflow: "hidden",
          background: "rgba(12,16,26,0.96)",
          borderRadius: 22,
          border: "1px solid rgba(148,163,184,0.16)",
          boxShadow: "0 28px 80px rgba(2,6,23,0.5)",
          display: "grid",
          gridTemplateRows: "auto 1fr",
        }}
      >
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid rgba(148,163,184,0.16)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{tier?.name}</div>
            <div style={{ fontSize: 13, opacity: 0.65 }}>
              {total || tier?.customersCount || 0} клиентов
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 24, display: "grid", gap: 16 }}>
          {error && (
            <div
              style={{
                borderRadius: 10,
                border: "1px solid rgba(248,113,113,.35)",
                padding: "8px 12px",
                color: "#f87171",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ position: "relative" }}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по телефону или имени"
              style={{
                width: "100%",
                padding: "10px 36px 10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.2)",
                background: "rgba(15,23,42,0.5)",
              }}
            />
            <Search
              size={16}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                opacity: 0.6,
              }}
            />
          </div>

          {loading && !members.length ? (
            <Skeleton height={220} />
          ) : filteredMembers.length ? (
            <div
              style={{
                display: "grid",
                gap: 10,
                maxHeight: "52vh",
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {filteredMembers.map((member) => {
                const clickable = Boolean(member.merchantCustomerId);
                return (
                  <button
                    key={`${member.customerId}:${member.assignedAt}`}
                    onClick={() => clickable && handleMemberClick(member)}
                    className="btn btn-ghost"
                    disabled={!clickable}
                    style={{
                      justifyContent: "space-between",
                      textAlign: "left",
                      padding: "12px 16px",
                      borderRadius: 14,
                      border: "1px solid rgba(148,163,184,0.18)",
                      opacity: clickable ? 1 : 0.65,
                      cursor: clickable ? "pointer" : "not-allowed",
                    }}
                  >
                    <div style={{ display: "grid", gap: 4 }}>
                      <div style={{ fontWeight: 600 }}>
                        {member.name || member.phone || member.customerId}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {member.phone || "Телефон не указан"}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.6, textAlign: "right" }}>
                      Назначен: {formatDateTime(member.assignedAt)}
                      {member.source ? (
                        <div style={{ fontSize: 11, opacity: 0.7 }}>
                          Источник: {member.source}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: 12, opacity: 0.7 }}>Клиенты не найдены</div>
          )}

          {nextCursor ? (
            <div>
              <Button
                variant="secondary"
                onClick={() => loadMembers(nextCursor, true)}
                disabled={loading}
              >
                {loading ? "Загружаем…" : "Загрузить ещё"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
