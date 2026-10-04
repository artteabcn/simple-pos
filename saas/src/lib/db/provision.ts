import { eq } from "drizzle-orm";
import { CURRENCY } from "../billing/pricing";
import { schema, type Clock, type Db } from "./index";
import { createDevice, revokeAllDevices } from "./devices";

const { payments, shops, signups, stripeEvents } = schema;

/** Registers a Stripe event id. Returns false when it was seen before (Stripe retries deliveries). */
export async function markEventSeen(db: Db, eventId: string, type: string, now: Date): Promise<boolean> {
  const iso = now.toISOString();
  const res = await db
    .insert(stripeEvents)
    .values({ id: eventId, type, processedAt: iso, createdAt: iso, updatedAt: iso })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id });
  return res.length > 0;
}

/** Forget an event id so a failed run can be retried by Stripe's next delivery. */
export async function unmarkEvent(db: Db, eventId: string): Promise<void> {
  await db.delete(stripeEvents).where(eq(stripeEvents.id, eventId));
}

export type PaidInput = {
  sessionId: string;
  paymentIntent: string | null;
  amountTotal: number;
  currency: string;
};

export type ProvisionResult =
  | { status: "created"; shopId: string; slug: string; email: string; locale: string }
  | { status: "duplicate"; shopId: string }
  | { status: "unknown_session" }
  | { status: "amount_mismatch" };

/**
 * Turns a confirmed payment into a shop. Safe to call twice for the same payment:
 * the unique session id makes the second call a no-op.
 */
export async function provisionPaidSession(db: Db, input: PaidInput, clock: Clock): Promise<ProvisionResult> {
  const existing = await db.select({ shopId: payments.shopId }).from(payments).where(eq(payments.stripeSessionId, input.sessionId)).get();
  if (existing) return { status: "duplicate", shopId: existing.shopId };

  const signup = await db.select().from(signups).where(eq(signups.stripeSessionId, input.sessionId)).get();
  if (!signup) return { status: "unknown_session" };
  if (input.amountTotal !== signup.amountExpected || input.currency !== CURRENCY) return { status: "amount_mismatch" };

  // The address was held for the customer, but if the hold lapsed and someone else took it, still honour the payment.
  let slug = signup.slug;
  for (let n = 2; n < 12; n++) {
    const taken = await db.select({ id: shops.id }).from(shops).where(eq(shops.slug, slug)).get();
    if (!taken) break;
    slug = `${signup.slug}-${n}`.slice(0, 40);
  }

  const nowIso = clock.now.toISOString();
  const shopId = clock.id();
  await db.batch([
    db.insert(shops).values({
      id: shopId,
      slug,
      name: signup.shopName,
      ownerEmail: signup.email,
      customisation: signup.customisation,
      profileJson: JSON.stringify({ name: signup.shopName }),
      createdAt: nowIso,
      updatedAt: nowIso,
    }),
    db.insert(payments).values({
      id: clock.id(),
      shopId,
      stripeSessionId: input.sessionId,
      stripePaymentIntent: input.paymentIntent,
      amountTotal: input.amountTotal,
      currency: input.currency,
      paidAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    }),
    db.update(signups).set({ status: "paid", updatedAt: nowIso }).where(eq(signups.id, signup.id)),
  ]);
  return { status: "created", shopId, slug, email: signup.email, locale: signup.locale };
}

export type ClaimResult =
  | { status: "pending" }
  | { status: "already_claimed" }
  | { status: "ok"; slug: string; name: string; token: string };

/**
 * Hands the first device key to the person who just paid (they hold the Stripe session id).
 * The key is shown once. If they closed the page before saving it and the shop has never synced,
 * claiming again switches off the unused key and issues a fresh one; after the first sync the owner
 * signs in with the emailed link instead.
 */
export async function claimShop(db: Db, sessionId: string, clock: Clock): Promise<ClaimResult> {
  const row = await db
    .select({ shop: shops })
    .from(payments)
    .innerJoin(shops, eq(payments.shopId, shops.id))
    .where(eq(payments.stripeSessionId, sessionId))
    .get();
  if (!row) return { status: "pending" };
  const shop = row.shop;
  if (shop.lastSyncAt) return { status: "already_claimed" };

  await revokeAllDevices(db, shop.id, clock.now);
  const d = await createDevice(db, shop.id, "First device", clock);
  return { status: "ok", slug: shop.slug, name: shop.name, token: d.token };
}
