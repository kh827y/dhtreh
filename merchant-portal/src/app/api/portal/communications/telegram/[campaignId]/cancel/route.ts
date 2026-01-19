import { NextRequest } from "next/server";
import { portalFetch } from "../../../../../portal/_lib";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  const body = await req.text();
  return portalFetch(
    req,
    `/portal/telegram-campaigns/${encodeURIComponent(campaignId)}/cancel`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    },
  );
}
