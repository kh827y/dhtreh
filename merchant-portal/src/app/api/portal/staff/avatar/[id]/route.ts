import { NextRequest, NextResponse } from "next/server";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");

async function doFetch(access: string, assetId: string) {
  return fetch(`${API_BASE}/portal/staff/avatar/${encodeURIComponent(assetId)}`, {
    headers: { authorization: `Bearer ${access}` },
  });
}

async function refreshTokens(refreshToken: string) {
  const res = await fetch(`${API_BASE}/portal/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  if (!access) return new Response("Unauthorized", { status: 401 });
  if (!API_BASE) {
    return new Response("Server misconfiguration: NEXT_PUBLIC_API_BASE is not set", { status: 500 });
  }

  let res = await doFetch(access, id);
  let nextTokens: { token: string; refresh: string } | null = null;
  if (res.status === 401 && refresh) {
    nextTokens = await refreshTokens(refresh);
    if (nextTokens?.token) {
      res = await doFetch(nextTokens.token, id);
    }
  }

  const buffer = await res.arrayBuffer();
  const outHeaders: Record<string, string> = {
    "Content-Type": res.headers.get("content-type") || "application/octet-stream",
  };
  const contentLength = res.headers.get("content-length");
  if (contentLength) outHeaders["Content-Length"] = contentLength;

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
