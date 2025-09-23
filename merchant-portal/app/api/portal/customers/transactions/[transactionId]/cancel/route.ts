import { NextRequest } from "next/server";
import { portalFetch } from "../../../../_lib";

export async function POST(req: NextRequest, { params }: { params: { transactionId: string } }) {
  const transactionId = encodeURIComponent(params.transactionId);
  const body = await req.json();
  return portalFetch(req, `/portal/customers/transactions/${transactionId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
