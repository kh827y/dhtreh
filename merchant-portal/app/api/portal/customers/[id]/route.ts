import { NextRequest } from "next/server";
import { portalFetch } from "../../_lib";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!id) {
    return new Response(JSON.stringify({ message: "Customer id is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  return portalFetch(req, `/portal/customers/${id}`, { method: "GET" });
}
