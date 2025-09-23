import { NextRequest } from "next/server";
import { portalFetch } from "../../../_lib";

export async function POST(req: NextRequest, { params }: { params: { customerId: string } }) {
  const customerId = encodeURIComponent(params.customerId);
  const body = await req.json();
  return portalFetch(req, `/portal/customers/${customerId}/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
