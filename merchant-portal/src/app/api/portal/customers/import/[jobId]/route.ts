import { NextRequest } from "next/server";
import { portalFetch } from "../../../_lib";

export async function GET(req: NextRequest, context: { params: { jobId: string } }) {
  const { jobId } = context.params;
  return portalFetch(req, `/portal/customers/import/${jobId}`, {
    method: "GET",
  });
}
