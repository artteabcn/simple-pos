import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { BodyError, json, readJson, requireManager } from "../../../../lib/api";
import { liveClock } from "../../../../lib/db";
import { setStaffPin } from "../../../../lib/db/staff";

export const prerender = false;

const Schema = z.object({ staffId: z.string().min(1).max(64), pin: z.string().max(12) });

/** Sets or changes a staff member's PIN. The owner picks it; staff cannot change their own. Manager only. */
export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const who = await requireManager(request, env);
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

  const r = await setStaffPin(who.db, who.auth.shop.id, parsed.data.staffId, parsed.data.pin, env.APP_SECRET, liveClock().now);
  return r.ok ? json({ ok: true }) : json({ error: r.reason }, 400);
};
