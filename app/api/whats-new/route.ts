import { jsonWithCors, optionsWithCors } from "@/lib/api-cors";
import { validateWhatsNewDocument } from "@/lib/whats-new";
import whatsNewPayload from "@/public/whats-new.json";

export async function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function GET(request: Request) {
  const document = validateWhatsNewDocument(whatsNewPayload);
  return jsonWithCors(request, document);
}
