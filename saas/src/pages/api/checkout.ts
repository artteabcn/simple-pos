import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { json, BodyError, readJson } from "../../lib/api";
import { RESERVATION_MS } from "../../lib/billing/pricing";
import { buildCheckoutParams, createCheckoutSession } from "../../lib/billing/stripe";
import { liveClock, makeDb } from "../../lib/db";
import { attachStripeSession, expireSignup, reserveSignup } from "../../lib/db/signups";
import { SignupInputSchema } from "../../lib/validations/signup";

export const prerender = false;

/** Starts a payment: holds the web address, then asks Stripe for a Checkout page. */
export const POST: APIRoute = async ({ request }): Promise<Response> => {
  let body: unknown;
  try {
    body = await readJson(request, 10_000);
  } catch (e) {
    return json({ error: "bad_request" }, e instanceof BodyError ? e.status : 400);
  }
  const parsed = SignupInputSchema.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "")))];
    return json({ error: "invalid", fields }, 400);
  }

  const db = makeDb(env.DB);
  const clock = liveClock();
  const reserved = await reserveSignup(db, parsed.data, clock);
  if (!reserved.ok) return json({ error: "slug_taken" }, 409);

  try {
    const params = buildCheckoutParams({
      signupId: reserved.signupId,
      email: parsed.data.email,
      slug: parsed.data.slug,
      customisation: parsed.data.customisation,
      locale: parsed.data.locale,
      origin: new URL(request.url).origin,
      expiresAt: Math.floor((clock.now.getTime() + RESERVATION_MS) / 1000),
    });
    const session = await createCheckoutSession(env.STRIPE_SECRET_KEY, params, reserved.signupId);
    await attachStripeSession(db, reserved.signupId, session.id, clock.now);
    return json({ url: session.url });
  } catch (e) {
    console.error("checkout failed", e instanceof Error ? e.message : e);
    await expireSignup(db, reserved.signupId, clock.now);
    return json({ error: "payment_unavailable" }, 502);
  }
};
