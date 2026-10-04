import type { Clock, Db } from "../lib/db";
import { authenticateDevice } from "../lib/db/devices";
import { claimShop, provisionPaidSession } from "../lib/db/provision";
import { attachStripeSession, reserveSignup } from "../lib/db/signups";

/** A shop that has paid and claimed its first device, the way the real flow ends. */
export async function createPaidShop(
  db: Db,
  clock: Clock,
  o: { slug?: string; email?: string; name?: string; session?: string; paymentIntent?: string } = {},
) {
  const slug = o.slug ?? "baan-mali";
  const email = o.email ?? "mali@example.com";
  const session = o.session ?? `cs_${slug}`;
  const r = await reserveSignup(db, { shopName: o.name ?? "Baan Mali", slug, email, customisation: false, locale: "en" }, clock);
  if (!r.ok) throw new Error("slug taken");
  await attachStripeSession(db, r.signupId, session, clock.now);
  const p = await provisionPaidSession(db, { sessionId: session, paymentIntent: o.paymentIntent ?? `pi_${slug}`, amountTotal: 49_900, currency: "thb" }, clock);
  if (p.status !== "created") throw new Error(`not created: ${p.status}`);
  const c = await claimShop(db, session, clock);
  if (c.status !== "ok") throw new Error("claim failed");
  const auth = await authenticateDevice(db, c.token, clock.now);
  if (!auth) throw new Error("device not found");
  return { shop: auth.shop, device: auth.device, token: c.token };
}
