import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("portal_jwt")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const headers = { authorization: `Bearer ${token}` };

    // Fetch multiple endpoints in parallel to check setup status
    const [settingsRes, outletsRes, staffRes, mechanicsRes] = await Promise.all([
      fetch(`${API_BASE}/portal/settings/system`, { headers }).catch(() => null),
      fetch(`${API_BASE}/portal/outlets`, { headers }).catch(() => null),
      fetch(`${API_BASE}/portal/staff`, { headers }).catch(() => null),
      fetch(`${API_BASE}/portal/loyalty/mechanics`, { headers }).catch(() => null),
    ]);

    // Check if loyalty settings are configured
    let hasLoyaltySettings = false;
    if (settingsRes?.ok) {
      const settings = await settingsRes.json().catch(() => null);
      hasLoyaltySettings = settings?.earnBps > 0 || settings?.redeemBps > 0;
    }

    // Check if outlets exist
    let hasOutlets = false;
    if (outletsRes?.ok) {
      const outlets = await outletsRes.json().catch(() => null);
      const outletList = Array.isArray(outlets) ? outlets : outlets?.items || [];
      hasOutlets = outletList.length > 0;
    }

    // Check if staff exists
    let hasStaff = false;
    if (staffRes?.ok) {
      const staff = await staffRes.json().catch(() => null);
      const staffList = Array.isArray(staff) ? staff : staff?.items || [];
      hasStaff = staffList.length > 0;
    }

    // Check if any mechanics are enabled
    let hasMechanics = false;
    if (mechanicsRes?.ok) {
      const mechanics = await mechanicsRes.json().catch(() => null);
      if (mechanics) {
        hasMechanics = mechanics.birthday?.enabled || 
                       mechanics.referral?.enabled || 
                       mechanics.autoReturn?.enabled ||
                       mechanics.welcome?.enabled;
      }
    }

    return NextResponse.json({
      hasLoyaltySettings,
      hasOutlets,
      hasStaff,
      hasMechanics,
      hasWallet: false, // Will be checked separately if wallet API exists
      hasPush: false, // Will be checked separately if push API exists
    });
  } catch (err) {
    console.error("Setup status error:", err);
    return NextResponse.json({
      hasLoyaltySettings: false,
      hasOutlets: false,
      hasStaff: false,
      hasMechanics: false,
      hasWallet: false,
      hasPush: false,
    });
  }
}
