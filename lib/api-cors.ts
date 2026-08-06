import { DIVEFRAME_HOSTED_WEB_ORIGINS } from "./diveframe-origins";

const CAPACITOR_ORIGINS = new Set([
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
  "ionic://localhost",
]);

const ALLOWED_ORIGINS = new Set([
  ...CAPACITOR_ORIGINS,
  ...DIVEFRAME_HOSTED_WEB_ORIGINS,
]);

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function jsonWithCors(
  request: Request,
  body: unknown,
  init?: ResponseInit,
) {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    headers.set(key, value);
  }
  return Response.json(body, { ...init, headers });
}

export function optionsWithCors(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}
