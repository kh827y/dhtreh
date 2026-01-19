import { NextRequest } from "next/server";
import { portalFetch } from "../../../_lib";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  return portalFetch(req, "/portal/cashier/activation-codes/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: String(body?.id || "") }),
  });
}

