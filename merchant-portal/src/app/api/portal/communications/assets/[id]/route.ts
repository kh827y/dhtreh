import { NextRequest, NextResponse } from "next/server";
import {
  applyNoStoreHeaders,
  upstreamFetch,
  withRequestId,
} from "../../../../_shared/upstream";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");

async function doFetch(req: NextRequest, access: string, assetId: string) {
  return upstreamFetch(`${API_BASE}/portal/communications/assets/${encodeURIComponent(assetId)}`, {
    req,
    headers: withRequestId({ authorization: `Bearer ${access}` }, req),
  });
}

async function refreshTokens(req: NextRequest, refreshToken: string) {
  const res = await upstreamFetch(`${API_BASE}/portal/auth/refresh`, {
    req,
    method: "POST",
    headers: withRequestId({ "Content-Type": "application/json" }, req),
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const token = typeof data?.token === "string" ? data.token : "";
  const refresh = typeof data?.refreshToken === "string" ? data.refreshToken : "";
  if (!token) return null;
  return { token, refresh };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = req.cookies.get("portal_jwt")?.value || "";
  const refresh = req.cookies.get("portal_refresh")?.value || "";
  if (!access) {
    return new Response("Unauthorized", {
      status: 401,
      headers: applyNoStoreHeaders(),
    });
  }
  if (!API_BASE) {
    return new Response("Server misconfiguration: NEXT_PUBLIC_API_BASE is not set", {
      status: 500,
      headers: applyNoStoreHeaders(),
    });
  }

  let res = await doFetch(req, access, id);
  let nextTokens: { token: string; refresh: string } | null = null;
  if (res.status === 401 && refresh) {
    nextTokens = await refreshTokens(req, refresh);
    if (nextTokens?.token) {
      res = await doFetch(req, nextTokens.token, id);
    }
  }

  const buffer = await res.arrayBuffer();
  const outHeaders = applyNoStoreHeaders({
    "Content-Type": res.headers.get("content-type") || "application/octet-stream",
  });
  const contentLength = res.headers.get("content-length");
  if (contentLength) outHeaders.set("Content-Length", contentLength);

  const response = new NextResponse(buffer, { status: res.status, headers: outHeaders });
  if (nextTokens?.token) {
    const secure = process.env.NODE_ENV === "production";
    response.cookies.set({
      name: "portal_jwt",
      value: nextTokens.token,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 24 * 60 * 60,
    });
    if (nextTokens.refresh) {
      response.cookies.set({
        name: "portal_refresh",
        value: nextTokens.refresh,
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      });
    }
  }
  return response;
}
