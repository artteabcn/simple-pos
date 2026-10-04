import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { BodyError, json, readJson, requireDevice } from "../../../../lib/api";
import { liveClock } from "../../../../lib/db";
import { unlockWithPin } from "../../../../lib/db/pin";

export const prerender = false;

const Schema = z.object({ pin: z.string().max(12) });

/** "Enter the manager PIN." Five wrong tries lock it for 15 minutes. Returns a 30 minute manager proof. */
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

  const r = await unlockWithPin(who.db, who.auth.shop, who.auth.device, parsed.data.pin, env.APP_SECRET, liveClock());
  if (r.ok) return json({ token: r.token, expiresAt: r.expiresAt });
  if (r.reason === "no_pin") return json({ error: "no_pin" }, 409);
  if (r.reason === "locked") return json({ error: "locked", retryAfterSec: r.retryAfterSec }, 429);
  return json({ error: "wrong_pin", attemptsLeft: r.attemptsLeft }, 401);
};
