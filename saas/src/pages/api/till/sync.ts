import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { bearer, BodyError, json, readJson } from "../../../lib/api";
import { liveClock, makeDb } from "../../../lib/db";
import { shopByToken } from "../../../lib/db/provision";
import { syncShop } from "../../../lib/db/sync";
import { MAX_SYNC_BODY_BYTES, SyncRequestSchema } from "../../../lib/validations/sync";

export const prerender = false;

/** A till (a phone or tablet holding the shop's key) sends its changes and receives everyone else's. */
export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const token = bearer(request);
  if (!token) return json({ error: "unauthorized" }, 401);
  const db = makeDb(env.DB);
  const shop = await shopByToken(db, token);
  if (!shop) return json({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = await readJson(request, MAX_SYNC_BODY_BYTES);
  } catch (e) {
    return json({ error: "bad_request" }, e instanceof BodyError ? e.status : 400);
  }
  const parsed = SyncRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid" }, 400);

  return json(await syncShop(db, shop, parsed.data, liveClock()));
};
