import { and, eq, gt, ne } from "drizzle-orm";
import { expectedAmount, RESERVATION_MS } from "../billing/pricing";
import { TERMS_VERSION } from "../../content/legal";
import type { SignupInput } from "../validations/signup";
import { schema, type Clock, type Db } from "./index";

const { shops, signups } = schema;

export type ReserveResult = { ok: true; signupId: string } | { ok: false; reason: "slug_taken" };

/** Is the address free? Taken by a shop, or held by someone else's unpaid checkout that has not expired. */
export async function isSlugAvailable(db: Db, slug: string, email: string, now: Date): Promise<boolean> {
  const shop = await db.select({ id: shops.id }).from(shops).where(eq(shops.slug, slug)).get();
  if (shop) return false;
  const held = await db
    .select({ id: signups.id })
    .from(signups)
    .where(and(eq(signups.slug, slug), eq(signups.status, "pending"), gt(signups.expiresAt, now.toISOString()), ne(signups.email, email)))
    .get();
  return !held;
}

/** Holds the address for an hour while the customer pays. The same person trying again just replaces their hold. */
export async function reserveSignup(db: Db, input: SignupInput, clock: Clock): Promise<ReserveResult> {
  if (!(await isSlugAvailable(db, input.slug, input.email, clock.now))) return { ok: false, reason: "slug_taken" };
  const signupId = clock.id();
  const nowIso = clock.now.toISOString();
  await db.batch([
    db
      .update(signups)
      .set({ status: "expired" })
      .where(and(eq(signups.slug, input.slug), eq(signups.email, input.email), eq(signups.status, "pending"))),
    db.insert(signups).values({
      id: signupId,
      slug: input.slug,
      shopName: input.shopName,
      email: input.email,
      customisation: input.customisation,
      locale: input.locale,
      amountExpected: expectedAmount(input.customisation),
      termsAcceptedAt: nowIso,
      termsVersion: TERMS_VERSION,
      expiresAt: new Date(clock.now.getTime() + RESERVATION_MS).toISOString(),
      createdAt: nowIso,
      updatedAt: nowIso,
    }),
  ]);
  return { ok: true, signupId };
}

export async function attachStripeSession(db: Db, signupId: string, sessionId: string, now: Date): Promise<void> {
  await db.update(signups).set({ stripeSessionId: sessionId, updatedAt: now.toISOString() }).where(eq(signups.id, signupId));
}

export async function expireSignup(db: Db, signupId: string, now: Date): Promise<void> {
  await db.update(signups).set({ status: "expired", updatedAt: now.toISOString() }).where(eq(signups.id, signupId));
}

export async function expireBySession(db: Db, sessionId: string, now: Date): Promise<void> {
  await db
    .update(signups)
    .set({ status: "expired", updatedAt: now.toISOString() })
    .where(and(eq(signups.stripeSessionId, sessionId), eq(signups.status, "pending")));
}
