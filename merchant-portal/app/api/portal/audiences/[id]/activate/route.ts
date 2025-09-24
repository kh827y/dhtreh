import { NextRequest } from "next/server";
import { portalFetch } from "../../../_lib";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!id) {
    return new Response(JSON.stringify({ message: "Audience id is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const body = await req.text();
  return portalFetch(req, `/portal/audiences/${id}/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}
