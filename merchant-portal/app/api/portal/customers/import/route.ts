import { NextRequest } from "next/server";
import { portalFetch } from "../../_lib";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return new Response("Файл не найден", { status: 400 });
  }
  const upload = new FormData();
  upload.set("file", file);
  return portalFetch(req, "/portal/customers/import", {
    method: "POST",
    body: upload,
  });
}
