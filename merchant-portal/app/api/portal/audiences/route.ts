import { NextRequest } from "next/server";
import { portalFetch } from "../_lib";

export async function GET(req: NextRequest) {
  return portalFetch(req, "/portal/audiences", { method: "GET" });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  return portalFetch(req, "/portal/audiences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
