import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { BodyError, json, readJson, requireManager } from "../../../../lib/api";
import { liveClock } from "../../../../lib/db";
import { deactivateStaff } from "../../../../lib/db/staff";

export const prerender = false;

const Schema = z.object({ staffId: z.string().min(1).max(64) });

/** Deactivates a staff member (kept, never deleted, so their name stays on past sales). Manager only. */
export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const who = await requireManager(request, env);
  if (who instanceof Response) return who;

  let body: unknown;
  try {
    body = await readJson(request, 500);
  } catch (e) {
    return json({ error: "bad_request" }, e instanceof BodyError ? e.status : 400);
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid" }, 400);

  const ok = await deactivateStaff(who.db, who.auth.shop.id, parsed.data.staffId, liveClock().now);
  return ok ? json({ ok: true }) : json({ error: "not_found" }, 404);
};
