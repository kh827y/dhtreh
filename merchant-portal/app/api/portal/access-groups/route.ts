import { NextRequest } from "next/server";
import { portalFetch } from "../_lib";

export async function GET(req: NextRequest) {
  const direct = await portalFetch(req, "/portal/access-groups", { method: "GET" });
  if (direct.status !== 404) return direct;

  return new Response(JSON.stringify({ items: [], meta: { total: 0 } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  return portalFetch(req, "/portal/access-groups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

// PUT/DELETE реализованы в [id]/route.ts
