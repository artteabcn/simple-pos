import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { BodyError, json, readJson, requireDevice } from "../../../lib/api";
import { liveClock } from "../../../lib/db";
import { isManager } from "../../../lib/db/pin";
import { syncShop } from "../../../lib/db/sync";
import { MAX_SYNC_BODY_BYTES, SyncRequestSchema } from "../../../lib/validations/sync";

export const prerender = false;

/** A till (a phone or tablet holding its own key) sends its changes and receives everyone else's. */
export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const who = await requireDevice(request, env);
  if (who instanceof Response) return who;

  let body: unknown;
  try {
    body = await readJson(request, MAX_SYNC_BODY_BYTES);
  } catch (e) {
    return json({ error: "bad_request" }, e instanceof BodyError ? e.status : 400);
  }
  const parsed = SyncRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid" }, 400);

  const clock = liveClock();
  // With a manager PIN set, only a device that has just entered it may change settings (prices, menu).
  const manager = await isManager(who.db, who.auth.device, request.headers.get("x-manager-token"), clock.now);
  return json(await syncShop(who.db, who.auth.shop, parsed.data, clock, manager));
};
