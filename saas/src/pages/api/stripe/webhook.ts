import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { json, siteOrigin } from "../../../lib/api";
import { interpretEvent, verifyStripeSignature } from "../../../lib/billing/stripe";
import { liveClock, makeDb, type Db } from "../../../lib/db";
import { issueLoginLinkForShop } from "../../../lib/db/login";
import { markEventSeen, provisionPaidSession, unmarkEvent, type ProvisionResult } from "../../../lib/db/provision";
import { applyRefund, ownerLocale } from "../../../lib/db/refunds";
import { expireBySession } from "../../../lib/db/signups";
import { refundOwnerMail, sendMail, teamMail, welcomeMail } from "../../../lib/email";
import { isLocale } from "../../../i18n/utils";
import type { ShopRow } from "../../../db/schema";
import { DEFAULT_TEAM_EMAIL, LINE_URL } from "../../../lib/site";

export const prerender = false;

const teamAddress = (): string => env.TEAM_EMAIL || DEFAULT_TEAM_EMAIL;
const baht = (satang: number): string => `THB ${(satang / 100).toLocaleString("en-US")}`;

/** Stripe calls this after a payment or a refund. Only a correctly signed request is believed. */
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
      if (r.status === "created") await afterPayment(db, r, what.amountTotal, request, clock);
      return json({ received: true, result: r.status });
    }
    if (what.kind === "refunded") {
      const r = await applyRefund(db, what.paymentIntent, what.amountRefunded, clock.now);
      if (r.status !== "unknown_payment") await afterRefund(db, r.status, r.shop, what.amountRefunded, what.amount);
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

/** After a payment: a first sign-in link for the owner, and a note to the team. A mail problem never fails the webhook. */
async function afterPayment(db: Db, r: Extract<ProvisionResult, { status: "created" }>, amount: number, request: Request, clock: ReturnType<typeof liveClock>): Promise<void> {
  try {
    const locale = isLocale(r.locale) ? r.locale : "en";
    const origin = siteOrigin(request, env.PUBLIC_SITE_URL);
    const link = await issueLoginLinkForShop(db, r.shopId, "", r.email, clock);
    await sendMail(
      env,
      welcomeMail(r.email, locale, `${origin}/${locale}/login/verify#token=${link.token}`, r.customisation ? { customizeUrl: `${origin}/${locale}/customize/`, lineUrl: LINE_URL } : {}),
    );
    await sendMail(
      env,
      teamMail(teamAddress(), `New shop: ${r.shopName}`, [
        ["Shop", r.shopName],
        ["Address", r.slug],
        ["Owner email", r.email],
        ["Paid", baht(amount)],
        ["Customisation add-on", r.customisation ? "YES - expect a request on /customize or LINE" : "no"],
        ["Language", r.locale],
      ], r.email),
    );
  } catch (e) {
    console.error("payment emails failed", e instanceof Error ? e.message : e);
  }
}

/** After a refund: tell the team; after a full refund also tell the owner their till is off. */
async function afterRefund(db: Db, status: "partial" | "suspended", shop: ShopRow, refunded: number, total: number): Promise<void> {
  try {
    await sendMail(
      env,
      teamMail(teamAddress(), status === "suspended" ? `Refund: till switched off for ${shop.name}` : `Partial refund: ${shop.name}`, [
        ["Shop", shop.name],
        ["Address", shop.slug],
        ["Owner email", shop.ownerEmail],
        ["Refunded", `${baht(refunded)} of ${baht(total)}`],
        ["What happened", status === "suspended" ? "Full refund: the till and all sign-in links were switched off automatically." : "Partial refund: nothing was switched off."],
      ]),
    );
    if (status === "suspended") await sendMail(env, refundOwnerMail(shop.ownerEmail, await ownerLocale(db, shop), LINE_URL));
  } catch (e) {
    console.error("refund emails failed", e instanceof Error ? e.message : e);
  }
}
