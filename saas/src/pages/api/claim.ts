import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { BodyError, json, readJson } from "../../lib/api";
import { liveClock, makeDb } from "../../lib/db";
import { claimShop } from "../../lib/db/provision";

export const prerender = false;

const ClaimSchema = z.object({ sessionId: z.string().regex(/^cs_(test|live)_[A-Za-z0-9]{10,200}$/) });

/**
 * Called by the "thank you" page with the Stripe session id from the URL.
 * 202 = payment not recorded yet (try again), 200 = here is your till key (shown once), 409 = sign in instead.
 */
export const POST: APIRoute = async ({ request }): Promise<Response> => {
  let body: unknown;
  try {
    body = await readJson(request, 2_000);
  } catch (e) {
    return json({ error: "bad_request" }, e instanceof BodyError ? e.status : 400);
  }
  const parsed = ClaimSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid" }, 400);

  const r = await claimShop(makeDb(env.DB), parsed.data.sessionId, liveClock());
  if (r.status === "pending") return json({ status: "pending" }, 202);
  if (r.status === "already_claimed") return json({ status: "already_claimed" }, 409);
  return json(r);
};
