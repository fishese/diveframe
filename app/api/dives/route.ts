import { listDives } from "@/lib/storage";

export async function GET() {
  try {
    return Response.json({ dives: await listDives() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load dives.";
    return Response.json({ error: message }, { status: 500 });
  }
}
