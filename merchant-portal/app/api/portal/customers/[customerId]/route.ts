import { NextRequest } from "next/server";
import { portalFetch } from "../../_lib";

export async function GET(req: NextRequest, { params }: { params: { customerId: string } }) {
  const customerId = encodeURIComponent(params.customerId);
  return portalFetch(req, `/portal/customers/${customerId}`, { method: "GET" });
}

export async function PUT(req: NextRequest, { params }: { params: { customerId: string } }) {
  const customerId = encodeURIComponent(params.customerId);
  const body = await req.json();
  return portalFetch(req, `/portal/customers/${customerId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
