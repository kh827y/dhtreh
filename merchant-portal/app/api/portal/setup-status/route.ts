import { NextRequest, NextResponse } from "next/server";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");

async function fetchJson(url: string, headers: Record<string, string>, label: string) {
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Не удалось загрузить ${label}`);
  }
  return res.json();
}

async function fetchJsonSafe(url: string, headers: Record<string, string>) {
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
      return { ok: false, status: res.status, data: null };
    }
    const data = await res.json().catch(() => null);
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("portal_jwt")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!API_BASE) {
      return NextResponse.json(
        { error: "Server misconfiguration: NEXT_PUBLIC_API_BASE is not set" },
        { status: 500 },
      );
    }

    const headers = { authorization: `Bearer ${token}` };

    const [tiers, outlets, staff] = await Promise.all([
      fetchJson(`${API_BASE}/portal/loyalty/tiers`, headers, "уровни лояльности"),
      fetchJson(`${API_BASE}/portal/outlets`, headers, "торговые точки"),
      fetchJson(`${API_BASE}/portal/staff`, headers, "сотрудников"),
    ]);

    const tiersList = Array.isArray(tiers)
      ? tiers
      : Array.isArray((tiers as any)?.items)
        ? (tiers as any).items
        : [];
    const hasLoyaltySettings = tiersList.length > 0;

    // Check if outlets exist
    let hasOutlets = false;
    let outletsCount = 0;
    const outletList = Array.isArray(outlets)
      ? outlets
      : (outlets as any)?.items || [];
    hasOutlets = outletList.length > 0;
    outletsCount = outletList.length;

    // Check if staff exists
    let hasStaff = false;
    let staffCount = 0;
    const staffList = Array.isArray(staff)
      ? staff
      : (staff as any)?.items || [];
    hasStaff = staffList.length > 0;
    staffCount = staffList.length;

    const [bonusRes, nameRes, timezoneRes, supportRes, telegramRes] = await Promise.all([
      fetchJsonSafe(`${API_BASE}/portal/loyalty/redeem-limits`, headers),
      fetchJsonSafe(`${API_BASE}/portal/settings/name`, headers),
      fetchJsonSafe(`${API_BASE}/portal/settings/timezone`, headers),
      fetchJsonSafe(`${API_BASE}/portal/settings/support`, headers),
      fetchJsonSafe(`${API_BASE}/portal/integrations/telegram-mini-app`, headers),
    ]);

    const bonusData = bonusRes.ok ? bonusRes.data : null;
    const ttlDays = Number(bonusData?.ttlDays ?? 0) || 0;
    const ttlEnabled = Boolean(bonusData?.ttlEnabled && ttlDays > 0);
    const delayDays = Number(bonusData?.delayDays ?? 0) || 0;
    const delayEnabled = Boolean(bonusData?.delayEnabled && delayDays > 0);
    const allowSameReceipt = Boolean(bonusData?.allowSameReceipt);
    const hasBonusSettings = Boolean(ttlEnabled || delayEnabled || allowSameReceipt);

    const nameValue =
      typeof nameRes.data?.name === "string" ? nameRes.data.name.trim() : "";
    const timezoneCode =
      typeof timezoneRes.data?.timezone?.code === "string"
        ? timezoneRes.data.timezone.code.trim()
        : "";
    const supportValue =
      typeof supportRes.data?.supportTelegram === "string"
        ? supportRes.data.supportTelegram.trim()
        : "";
    const hasSystemSettings = Boolean(nameValue || timezoneCode || supportValue);

    const telegramData = telegramRes.ok ? telegramRes.data : null;
    const hasTelegramMiniApp = Boolean(telegramData?.enabled);

    return NextResponse.json({
      hasLoyaltySettings,
      hasOutlets,
      hasStaff,
      hasBonusSettings,
      hasSystemSettings,
      hasTelegramMiniApp,
      outletsCount,
      staffCount,
      bonusTtlDays: ttlDays,
      bonusTtlEnabled: ttlEnabled,
    });
  } catch (err) {
    console.error("Setup status error:", err);
    return NextResponse.json(
      { error: "Не удалось загрузить статус настройки" },
      { status: 502 },
    );
  }
}
