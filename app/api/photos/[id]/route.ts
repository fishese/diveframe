import { env } from "cloudflare:workers";
import { getAttachment } from "@/lib/storage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const attachment = await getAttachment(id);
  if (!attachment) {
    return Response.json({ error: "Photo not found." }, { status: 404 });
  }
  const object = await env.PHOTOS.get(attachment.objectKey);
  if (!object) {
    return Response.json({ error: "Photo data is unavailable." }, { status: 404 });
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("Content-Disposition", `inline; filename="${safeName(attachment.fileName)}"`);
  return new Response(object.body, { headers });
}

function safeName(value: string) {
  return value.replace(/["\r\n]/g, "_");
}
