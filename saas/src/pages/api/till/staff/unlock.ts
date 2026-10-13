import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { BodyError, json, readJson, requireDevice } from "../../../../lib/api";
import { liveClock } from "../../../../lib/db";
import { unlockWithStaffPin } from "../../../../lib/db/staff";

export const prerender = false;

const Schema = z.object({ pin: z.string().max(12) });

/**
 * "Who's selling?" Checks a PIN against every active staff member of the shop — the PIN alone says who it
 * is, no name picker needed. Any device may call this (it is how staff identify themselves in the first
 * place); five wrong tries lock staff PIN attempts for 15 minutes, separate from the manager PIN's lockout.
 */
export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const who = await requireDevice(request, env);
  if (who instanceof Response) return who;
  if (!env.APP_SECRET) return json({ error: "pin_unavailable" }, 503);

  let body: unknown;
  try {
    body = await readJson(request, 500);
  } catch (e) {
    return json({ error: "bad_request" }, e instanceof BodyError ? e.status : 400);
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid" }, 400);

  const r = await unlockWithStaffPin(who.db, who.auth.shop, who.auth.device, parsed.data.pin, env.APP_SECRET, liveClock());
  if (r.ok) return json({ token: r.token, expiresAt: r.expiresAt, staffId: r.staffId, staffName: r.staffName });
  if (r.reason === "locked") return json({ error: "locked", retryAfterSec: r.retryAfterSec }, 429);
  return json({ error: "wrong_pin" }, 401);
};
