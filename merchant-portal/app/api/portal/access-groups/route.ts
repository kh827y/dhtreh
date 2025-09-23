import { NextRequest } from "next/server";
import { portalFetch } from "../_lib";

const FALLBACK_GROUPS = [
  { id: "MERCHANT", name: "Владелец", membersCount: 0 },
  { id: "MANAGER", name: "Менеджер", membersCount: 0 },
  { id: "ANALYST", name: "Аналитик", membersCount: 0 },
  { id: "CASHIER", name: "Кассир", membersCount: 0 },
];

function roleLabel(role: string) {
  const upper = role.toUpperCase();
  if (upper === "MERCHANT") return "Владелец";
  if (upper === "MANAGER") return "Менеджер";
  if (upper === "ANALYST") return "Аналитик";
  if (upper === "CASHIER") return "Кассир";
  return upper;
}

export async function GET(req: NextRequest) {
  try {
    const direct = await portalFetch(req, "/portal/access-groups", { method: "GET" });
    if (direct.status !== 404) return direct;
  } catch {}

  try {
    const staffRes = await portalFetch(req, "/portal/staff", { method: "GET" });
    if (!staffRes.ok) return Response.json(FALLBACK_GROUPS, { status: 200 });
    const staff = await staffRes.json();
    if (!Array.isArray(staff)) return Response.json(FALLBACK_GROUPS, { status: 200 });
    const map = new Map<string, { id: string; name: string; membersCount: number }>();
    for (const row of staff) {
      const role = (row?.role || "CASHIER").toString().toUpperCase();
      const record = map.get(role) || { id: role, name: roleLabel(role), membersCount: 0 };
      record.membersCount += 1;
      map.set(role, record);
    }
    return Response.json(Array.from(map.values()), { status: 200 });
  } catch {
    return Response.json(FALLBACK_GROUPS, { status: 200 });
  }
}

export async function POST() {
  return Response.json({ error: "NotImplemented" }, { status: 501 });
}

export async function PUT() {
  return Response.json({ error: "NotImplemented" }, { status: 501 });
}

export async function DELETE() {
  return Response.json({ error: "NotImplemented" }, { status: 501 });
}
