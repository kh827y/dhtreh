import { NextRequest, NextResponse } from "next/server";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");

async function fetchJson(url: string, headers: Record<string, string>, label: string) {
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Не удалось загрузить ${label}`);
  }
  return res.json();
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

    const [tiers, outlets, staff, mechanics] = await Promise.all([
      fetchJson(`${API_BASE}/portal/loyalty/tiers`, headers, "уровни лояльности"),
      fetchJson(`${API_BASE}/portal/outlets`, headers, "торговые точки"),
      fetchJson(`${API_BASE}/portal/staff`, headers, "сотрудников"),
      fetchJson(`${API_BASE}/portal/loyalty/mechanics`, headers, "механики"),
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

    // Check if any mechanics are enabled
    let hasMechanics = false;
    if (Array.isArray(mechanics)) {
      hasMechanics = mechanics.some((item: any) =>
        item?.status === "ACTIVE" || item?.enabled === true
      );
    } else if (mechanics && typeof mechanics === "object") {
      hasMechanics = Boolean(
        (mechanics as any)?.birthday?.enabled ||
        (mechanics as any)?.referral?.enabled ||
        (mechanics as any)?.autoReturn?.enabled ||
        (mechanics as any)?.welcome?.enabled
      );
    }

    return NextResponse.json({
      hasLoyaltySettings,
      hasOutlets,
      hasStaff,
      hasMechanics,
      outletsCount,
      staffCount,
      hasWallet: false,
      hasPush: false,
    });
  } catch (err) {
    console.error("Setup status error:", err);
    return NextResponse.json(
      { error: "Не удалось загрузить статус настройки" },
      { status: 502 },
    );
  }
}
