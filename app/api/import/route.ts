import { type ImportedDive, upsertDives } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { dives?: ImportedDive[] };
    if (!Array.isArray(body.dives) || body.dives.length === 0) {
      return Response.json({ error: "No dives were supplied." }, { status: 400 });
    }
    if (body.dives.length > 1000) {
      return Response.json(
        { error: "Import at most 1,000 dives at a time." },
        { status: 400 },
      );
    }
    const dives = body.dives.filter(
      (dive) =>
        typeof dive?.id === "string" &&
        dive.id.length > 0 &&
        (dive.source === "shearwater" || dive.source === "subsurface") &&
        typeof dive.sourceId === "string" &&
        dive.sourceId.length > 0,
    );
    if (dives.length !== body.dives.length) {
      return Response.json(
        { error: "One or more dive records are invalid." },
        { status: 400 },
      );
    }
    await upsertDives(dives);
    return Response.json({ imported: dives.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
