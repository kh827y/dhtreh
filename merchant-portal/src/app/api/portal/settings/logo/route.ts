import { NextRequest, NextResponse } from "next/server";
import { portalFetch } from "../../_lib";
import {
  applyNoStoreHeaders,
  upstreamFetch,
  withRequestId,
} from "../../../_shared/upstream";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");

async function doUpload(
  req: NextRequest,
  access: string,
  file: Blob,
  fileName: string,
) {
  const body = new FormData();
  body.append("file", file, fileName);
  return upstreamFetch(`${API_BASE}/portal/settings/logo`, {
    req,
    method: "POST",
    headers: withRequestId({ authorization: `Bearer ${access}` }, req),
    body,
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

export async function GET(req: NextRequest) {
  return portalFetch(req, "/portal/settings/logo", { method: "GET" });
}

export async function DELETE(req: NextRequest) {
  return portalFetch(req, "/portal/settings/logo", { method: "DELETE" });
}

export async function POST(req: NextRequest) {
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

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return new Response(
      JSON.stringify({ error: "BadRequest", message: "Файл не найден" }),
      {
        status: 400,
        headers: applyNoStoreHeaders({ "Content-Type": "application/json" }),
      },
    );
  }
  const fileName =
    "name" in file && typeof (file as File).name === "string" && (file as File).name.trim()
      ? (file as File).name
      : "logo";

  let res = await doUpload(req, access, file, fileName);
  let nextTokens: { token: string; refresh: string } | null = null;
  if (res.status === 401 && refresh) {
    nextTokens = await refreshTokens(req, refresh);
    if (nextTokens?.token) {
      res = await doUpload(req, nextTokens.token, file, fileName);
    }
  }

  const text = await res.text();
  const outHeaders = applyNoStoreHeaders({
    "Content-Type": res.headers.get("content-type") || "application/json",
  });
  const response = new NextResponse(text, { status: res.status, headers: outHeaders });
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
