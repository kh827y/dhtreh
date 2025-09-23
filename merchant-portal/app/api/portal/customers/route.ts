import { NextRequest } from "next/server";
import { portalFetch } from "../_lib";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = url.search ? url.search : "";
  return portalFetch(req, `/portal/customers${qs}`, { method: "GET" });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return portalFetch(req, "/portal/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
