import { NextRequest } from "next/server";
import { portalFetch } from "../../_lib";

export async function GET(req: NextRequest) {
  return portalFetch(req, "/portal/cashier/activation-codes", { method: "GET" });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const count = Number(body?.count);
  return portalFetch(req, "/portal/cashier/activation-codes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: Number.isFinite(count) ? count : 1 }),
  });
}

