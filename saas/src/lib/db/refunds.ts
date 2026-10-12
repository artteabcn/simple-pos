import { eq } from "drizzle-orm";
import type { ShopRow } from "../../db/schema";
import { schema, type Db } from "./index";

const { payments, shops, signups } = schema;

export type RefundResult =
  | { status: "unknown_payment" }
  | { status: "partial"; shop: ShopRow }
  | { status: "suspended"; shop: ShopRow };

/**
 * A refund in Stripe. A full refund returns the customer's money, so the till is switched off
 * (every device key and every sign-in link stops working). A partial refund changes nothing
 * but the team is told. Safe to run twice for the same refund.
 */
export async function applyRefund(db: Db, paymentIntent: string, amountRefunded: number, now: Date): Promise<RefundResult> {
  const row = await db
    .select({ amount: payments.amountTotal, shop: shops })
    .from(payments)
    .innerJoin(shops, eq(payments.shopId, shops.id))
    .where(eq(payments.stripePaymentIntent, paymentIntent))
    .get();
  if (!row) return { status: "unknown_payment" };
  if (amountRefunded < row.amount) return { status: "partial", shop: row.shop };
  await db.update(shops).set({ status: "suspended", updatedAt: now.toISOString() }).where(eq(shops.id, row.shop.id));
  return { status: "suspended", shop: { ...row.shop, status: "suspended" } };
}

/** The language the owner used when signing up (for emails), English if unknown. */
export async function ownerLocale(db: Db, shop: ShopRow): Promise<"en" | "th" | "fr" | "de"> {
  const s = await db.select({ locale: signups.locale }).from(signups).where(eq(signups.slug, shop.slug)).get();
  return s?.locale === "th" || s?.locale === "fr" || s?.locale === "de" ? s.locale : "en";
}
