import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { BodyError, json, readJson, requireManager } from "../../../../lib/api";
import { liveClock } from "../../../../lib/db";
import { renameStaff } from "../../../../lib/db/staff";

export const prerender = false;

const Schema = z.object({ staffId: z.string().min(1).max(64), name: z.string().trim().min(1).max(60) });

/** Renames a staff member. Manager only. */
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

  const ok = await renameStaff(who.db, who.auth.shop.id, parsed.data.staffId, parsed.data.name, liveClock().now);
  return ok ? json({ ok: true }) : json({ error: "not_found" }, 404);
};
