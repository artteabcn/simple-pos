import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { BodyError, json, readJson, requireManager } from "../../../../lib/api";
import { liveClock } from "../../../../lib/db";
import { createStaff } from "../../../../lib/db/staff";

export const prerender = false;

const Schema = z.object({ name: z.string().trim().min(1).max(60), pin: z.string().max(12) });

/** Adds a staff member with their own PIN (one PIN per person, picked by the owner). Manager only. */
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

  const r = await createStaff(who.db, who.auth.shop.id, parsed.data.name, parsed.data.pin, env.APP_SECRET!, liveClock());
  if (!r.ok) return json({ error: r.reason }, r.reason === "limit" ? 409 : 400);
  return json({ ok: true, id: r.id });
};
