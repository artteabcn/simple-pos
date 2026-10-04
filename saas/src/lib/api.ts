/** Small helpers shared by the API routes. */
import { liveClock, makeDb, type Db } from "./db";
import { authenticateDevice, type Authenticated } from "./db/devices";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export class BodyError extends Error {
  constructor(readonly status: 400 | 413) {
    super(status === 413 ? "Request too large" : "Invalid JSON");
  }
}

/** Reads a JSON body, refusing anything bigger than `maxBytes` (checked on the real bytes, not just the header). */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new BodyError(413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new BodyError(413);
  try {
    return JSON.parse(text);
  } catch {
    throw new BodyError(400);
  }
}

/** The device behind a request's key, or a ready-made 401 response. */
export async function requireDevice(request: Request, env: { DB: Parameters<typeof makeDb>[0] }): Promise<{ db: Db; auth: Authenticated } | Response> {
  const token = bearer(request);
  if (!token) return json({ error: "unauthorized" }, 401);
  const db = makeDb(env.DB);
  const auth = await authenticateDevice(db, token, liveClock().now);
  return auth ? { db, auth } : json({ error: "unauthorized" }, 401);
}

/** Where links in emails should point: the configured public address, else the address of this request. */
export const siteOrigin = (request: Request, configured?: string): string => {
  try {
    if (configured) return new URL(configured).origin;
  } catch {
    /* fall through to the request's own origin */
  }
  return new URL(request.url).origin;
};

/** `Authorization: Bearer <token>` -> token, or null. */
export function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer (\S{1,200})$/.exec(h);
  return m?.[1] ?? null;
}
