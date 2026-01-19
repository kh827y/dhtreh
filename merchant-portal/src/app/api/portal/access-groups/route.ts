import { NextRequest } from "next/server";
import { portalFetch } from "../_lib";

export async function GET(req: NextRequest) {
  const search = req.nextUrl.search || "";
  const path = search ? `/portal/access-groups${search}` : "/portal/access-groups";
  return portalFetch(req, path, { method: "GET" });
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
