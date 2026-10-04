import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { BodyError, json, readJson, requireDevice } from "../../../../lib/api";
import { liveClock } from "../../../../lib/db";
import { isManager, isValidPin, setPin, unlockWithPin } from "../../../../lib/db/pin";

export const prerender = false;

const Schema = z.object({ pin: z.string().max(12), currentPin: z.string().max(12).optional() });

/**
 * Sets or changes the manager PIN (4 to 6 digits). When a PIN already exists, the caller must be
 * unlocked as manager or give the current PIN, so staff cannot replace it.
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
  if (!parsed.success || !isValidPin(parsed.data.pin)) return json({ error: "invalid" }, 400);

  const clock = liveClock();
  const { shop, device } = who.auth;
  if (shop.pinHash) {
    const unlocked = await isManager(who.db, device, request.headers.get("x-manager-token"), clock.now);
    if (!unlocked) {
      if (!parsed.data.currentPin) return json({ error: "manager_required" }, 403);
      const check = await unlockWithPin(who.db, shop, device, parsed.data.currentPin, env.APP_SECRET, clock);
      if (!check.ok) return json({ error: check.reason === "locked" ? "locked" : "wrong_pin" }, check.reason === "locked" ? 429 : 403);
    }
  }
  await setPin(who.db, shop, parsed.data.pin, env.APP_SECRET, clock.now);
  return json({ ok: true });
};
