import { NextRequest } from "next/server";
import { portalFetch } from "../../_lib";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  return portalFetch(req, "/portal/customers/import", {
    method: "POST",
    body: formData,
  });
}
