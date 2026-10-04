import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { json } from "../../../lib/api";
import { interpretEvent, verifyStripeSignature } from "../../../lib/billing/stripe";
import { liveClock, makeDb } from "../../../lib/db";
import { markEventSeen, provisionPaidSession, unmarkEvent } from "../../../lib/db/provision";
import { expireBySession } from "../../../lib/db/signups";

export const prerender = false;

/** Stripe calls this after a payment. Only a correctly signed request is believed. */
export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const raw = await request.text();
  if (raw.length > 200_000) return json({ error: "too_large" }, 413);
  if (!(await verifyStripeSignature(raw, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: "bad_signature" }, 400);
  }

  let event: { id?: string; type?: string; data?: { object?: { id?: string } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  if (!event.id || !event.type) return json({ error: "bad_event" }, 400);

  const db = makeDb(env.DB);
  const clock = liveClock();
  // Stripe re-sends events; handle each one only once.
  if (!(await markEventSeen(db, event.id, event.type, clock.now))) return json({ received: true, duplicate: true });

  try {
    const what = interpretEvent(event as Parameters<typeof interpretEvent>[0]);
    if (what.kind === "paid") {
      const r = await provisionPaidSession(db, what, clock);
      // unknown sessions and wrong amounts are logged and acknowledged: retrying would not change the answer
      if (r.status === "unknown_session" || r.status === "amount_mismatch") console.error("payment not provisioned", r.status, what.sessionId);
      return json({ received: true, result: r.status });
    }
    if (what.kind === "expired") await expireBySession(db, what.sessionId, clock.now);
    return json({ received: true });
  } catch (e) {
    // let Stripe try again later: forget the event id so the retry is not skipped as a duplicate
    await unmarkEvent(db, event.id).catch(() => undefined);
    console.error("webhook failed", e instanceof Error ? e.message : e);
    return json({ error: "server_error" }, 500);
  }
};
