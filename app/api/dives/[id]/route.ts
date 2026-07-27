import { getDive } from "@/lib/storage";

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
