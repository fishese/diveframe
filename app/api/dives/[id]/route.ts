import { getDive, updateDiveSite } from "@/lib/storage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const result = await getDive(id);
  if (!result) {
    return Response.json({ error: "Dive not found." }, { status: 404 });
  }
  return Response.json(result);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!(await getDive(id))) {
    return Response.json({ error: "Dive not found." }, { status: 404 });
  }
  const body = (await request.json()) as { site?: unknown };
  if (typeof body.site !== "string") {
    return Response.json({ error: "Enter a dive-site name." }, { status: 400 });
  }
  const site = body.site.trim();
  if (!site || site.length > 120) {
    return Response.json(
      { error: "Dive-site names must be between 1 and 120 characters." },
      { status: 400 },
    );
  }
  return Response.json(await updateDiveSite(id, site));
}
