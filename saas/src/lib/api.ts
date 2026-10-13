/** Small helpers shared by the API routes. */
import { liveClock, makeDb, type Clock, type Db } from "./db";
import { authenticateDevice, type Authenticated } from "./db/devices";
import { isManager, safeEqual } from "./db/pin";

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

/**
 * Same as requireDevice, but also requires this device to be unlocked as manager (the `X-Manager-Token`
 * header), matching the "staff can sell, only the manager changes settings" rule: before any manager PIN
 * is ever set there is nothing to protect yet, so any device of the shop is let through.
 */
export async function requireManager(
  request: Request,
  env: { DB: Parameters<typeof makeDb>[0]; APP_SECRET?: string },
  clock: Clock = liveClock(),
): Promise<{ db: Db; auth: Authenticated } | Response> {
  const who = await requireDevice(request, env);
  if (who instanceof Response) return who;
  if (!who.auth.shop.pinHash) return who;
  if (!env.APP_SECRET) return json({ error: "pin_unavailable" }, 503);
  const unlocked = await isManager(who.db, who.auth.device, request.headers.get("x-manager-token"), clock.now);
  return unlocked ? who : json({ error: "manager_required" }, 403);
}

/**
 * Gate for the team's admin screen (customization requests) — a different audience from shop/till auth,
 * so it is not device- or shop-scoped. A single shared secret (`ADMIN_TOKEN`, a Cloudflare secret like
 * APP_SECRET) compared in constant time; never stored anywhere, so there is nothing in D1 to leak it.
 */
export function requireAdmin(request: Request, env: { ADMIN_TOKEN?: string }): Response | null {
  if (!env.ADMIN_TOKEN) return json({ error: "admin_unavailable" }, 503);
  const token = bearer(request);
  return token && safeEqual(token, env.ADMIN_TOKEN) ? null : json({ error: "unauthorized" }, 401);
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
