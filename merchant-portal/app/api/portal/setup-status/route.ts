import { NextRequest, NextResponse } from "next/server";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");

// Helper to safely fetch and parse JSON, returning null on error
async function safeFetch(url: string, headers: Record<string, string>) {
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
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

    // Fetch multiple endpoints in parallel - gracefully handle missing endpoints
    const [settings, outlets, staff, mechanics] = await Promise.all([
      safeFetch(`${API_BASE}/portal/settings/system`, headers),
      safeFetch(`${API_BASE}/portal/outlets`, headers),
      safeFetch(`${API_BASE}/portal/staff`, headers),
      safeFetch(`${API_BASE}/portal/loyalty/mechanics`, headers),
    ]);

    // Check if loyalty settings are configured (levels with earnBps/redeemBps)
    let hasLoyaltySettings = false;
    if (settings) {
      // Check if any levels have earn/redeem configured
      const levels = settings.levels || settings.tiers || [];
      if (Array.isArray(levels) && levels.length > 0) {
        hasLoyaltySettings = levels.some((lvl: { earnBps?: number; redeemBps?: number }) => 
          (lvl.earnBps && lvl.earnBps > 0) || (lvl.redeemBps && lvl.redeemBps > 0)
        );
      } else {
        hasLoyaltySettings = (settings.earnBps && settings.earnBps > 0) || 
                            (settings.redeemBps && settings.redeemBps > 0);
      }
    }

    // Check if outlets exist
    let hasOutlets = false;
    let outletsCount = 0;
    if (outlets) {
      const outletList = Array.isArray(outlets) ? outlets : outlets?.items || [];
      hasOutlets = outletList.length > 0;
      outletsCount = outletList.length;
    }

    // Check if staff exists
    let hasStaff = false;
    let staffCount = 0;
    if (staff) {
      const staffList = Array.isArray(staff) ? staff : staff?.items || [];
      hasStaff = staffList.length > 0;
      staffCount = staffList.length;
    }

    // Check if any mechanics are enabled
    let hasMechanics = false;
    if (mechanics) {
      hasMechanics = mechanics.birthday?.enabled ||
                     mechanics.referral?.enabled ||
                     mechanics.autoReturn?.enabled ||
                     mechanics.welcome?.enabled;
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
