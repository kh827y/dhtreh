import { NextRequest, NextResponse } from "next/server";
import {
  applyNoStoreHeaders,
  upstreamFetch,
  withRequestId,
} from "../../_shared/upstream";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");

async function fetchJson(
  req: NextRequest,
  url: string,
  headers: Record<string, string>,
  label: string,
) {
  const res = await upstreamFetch(url, {
    req,
    headers: withRequestId(headers, req),
  });
  if (!res.ok) {
    throw new Error(`Не удалось загрузить ${label}`);
  }
  return res.json();
}

async function fetchJsonSafe(
  req: NextRequest,
  url: string,
  headers: Record<string, string>,
) {
  try {
    const res = await upstreamFetch(url, {
      req,
      headers: withRequestId(headers, req),
    });
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
    const outletsUrl = `${API_BASE}/portal/outlets?page=1&pageSize=1&status=all`;
    const staffUrl = `${API_BASE}/portal/staff?page=1&pageSize=1`;

    const [tiers, outlets, staff] = await Promise.all([
      fetchJson(req, `${API_BASE}/portal/loyalty/tiers`, headers, "уровни лояльности"),
      fetchJson(req, outletsUrl, headers, "торговые точки"),
      fetchJson(req, staffUrl, headers, "сотрудников"),
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
    const outletsTotal =
      Number((outlets as any)?.total ?? (outlets as any)?.meta?.total ?? outletList.length) ||
      outletList.length;
    hasOutlets = outletsTotal > 0;
    outletsCount = outletsTotal;

    // Check if staff exists
    let hasStaff = false;
    let staffCount = 0;
    const staffList = Array.isArray(staff)
      ? staff
      : (staff as any)?.items || [];
    const staffTotal =
      Number((staff as any)?.meta?.total ?? staffList.length) || staffList.length;
    hasStaff = staffTotal > 0;
    staffCount = staffTotal;

    const [bonusRes, nameRes, timezoneRes, supportRes, telegramRes] = await Promise.all([
      fetchJsonSafe(req, `${API_BASE}/portal/loyalty/redeem-limits`, headers),
      fetchJsonSafe(req, `${API_BASE}/portal/settings/name`, headers),
      fetchJsonSafe(req, `${API_BASE}/portal/settings/timezone`, headers),
      fetchJsonSafe(req, `${API_BASE}/portal/settings/support`, headers),
      fetchJsonSafe(req, `${API_BASE}/portal/integrations/telegram-mini-app`, headers),
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

    return NextResponse.json(
      {
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
      },
      { headers: applyNoStoreHeaders() },
    );
  } catch (err) {
    console.error("Setup status error:", err);
    return NextResponse.json(
      { error: "Не удалось загрузить статус настройки" },
      { status: 502, headers: applyNoStoreHeaders() },
    );
  }
}
