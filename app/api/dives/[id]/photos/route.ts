import { env } from "cloudflare:workers";
import { addAttachment, getDive } from "@/lib/storage";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: diveId } = await context.params;
  if (!(await getDive(diveId))) {
    return Response.json({ error: "Dive not found." }, { status: 404 });
  }

  const formData = await request.formData();
  const files = formData
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return Response.json({ error: "Choose at least one photo." }, { status: 400 });
  }
  if (files.length > 12) {
    return Response.json(
      { error: "Upload up to 12 photos at a time." },
      { status: 400 },
    );
  }

  const uploaded = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return Response.json(
        { error: `${file.name} is not an image.` },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: `${file.name} is larger than 20 MB.` },
        { status: 400 },
      );
    }

    const attachmentId = crypto.randomUUID();
    const extension = extensionFor(file);
    const objectKey = `dives/${diveId}/${attachmentId}.${extension}`;
    await env.PHOTOS.put(objectKey, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    const attachment = {
      id: attachmentId,
      diveId,
      objectKey,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      caption: null,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
    };
    await addAttachment(attachment);
    uploaded.push(attachment);
  }

  return Response.json({ attachments: uploaded }, { status: 201 });
}

function extensionFor(file: File) {
  const original = file.name.split(".").pop()?.toLowerCase();
  if (original && /^[a-z0-9]{2,5}$/.test(original)) return original;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/heic") return "heic";
  return "jpg";
}
