import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { BodyError, json, readJson, requireDevice } from "../../../../lib/api";
import { liveClock } from "../../../../lib/db";
import { revokeDevice } from "../../../../lib/db/devices";
import { isManager } from "../../../../lib/db/pin";

export const prerender = false;

const Schema = z.object({ deviceId: z.string().min(1).max(64) });

/**
 * Revokes one device's key (a lost or stolen phone) without touching the shop's other
 * devices. Manager only (once a PIN exists). A device cannot revoke itself — that would
 * just lock the person out mid-action; walking away from a device is enough on its own.
 */
export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const who = await requireDevice(request, env);
  if (who instanceof Response) return who;

  let body: unknown;
  try {
    body = await readJson(request, 500);
  } catch (e) {
    return json({ error: "bad_request" }, e instanceof BodyError ? e.status : 400);
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid" }, 400);

  const clock = liveClock();
  const { shop, device } = who.auth;
  if (shop.pinHash) {
    const unlocked = await isManager(who.db, device, request.headers.get("x-manager-token"), clock.now);
    if (!unlocked) return json({ error: "manager_required" }, 403);
  }
  if (parsed.data.deviceId === device.id) return json({ error: "cannot_revoke_self" }, 400);

  const ok = await revokeDevice(who.db, shop.id, parsed.data.deviceId, clock.now);
  return ok ? json({ ok: true }) : json({ error: "not_found" }, 404);
};
