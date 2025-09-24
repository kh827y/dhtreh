import { NextRequest } from "next/server";
import { portalFetch } from "../_lib";

function sanitizeNumber(value: string | null, fallback?: number) {
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = sanitizeNumber(url.searchParams.get("limit"));
  const offset = sanitizeNumber(url.searchParams.get("offset"));
  const minVisits = sanitizeNumber(url.searchParams.get("minVisits"));
  const maxVisits = sanitizeNumber(url.searchParams.get("maxVisits"));

  const qs = new URLSearchParams();
  if (typeof limit === "number") qs.set("limit", String(Math.max(1, Math.min(limit, 200))));
  if (typeof offset === "number") qs.set("offset", String(Math.max(0, offset)));
  const search = url.searchParams.get("search");
  if (search) qs.set("search", search);
  const segmentId = url.searchParams.get("segmentId");
  if (segmentId) qs.set("segmentId", segmentId);
  const tags = url.searchParams.get("tags");
  if (tags) qs.set("tags", tags);
  const gender = url.searchParams.get("gender");
  if (gender) qs.set("gender", gender);
  const rfmClasses = url.searchParams.get("rfmClasses");
  if (rfmClasses) qs.set("rfmClasses", rfmClasses);
  if (typeof minVisits === "number") qs.set("minVisits", String(Math.max(0, Math.floor(minVisits))));
  if (typeof maxVisits === "number") qs.set("maxVisits", String(Math.max(0, Math.floor(maxVisits))));

  const query = qs.toString();
  const path = `/portal/customers${query ? `?${query}` : ""}`;
  return portalFetch(req, path, { method: "GET" });
}

export async function POST(req: NextRequest) {
  const payload = await req.json();
  return portalFetch(req, "/portal/customers", {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
    headers: { "Content-Type": "application/json" },
  });
}
