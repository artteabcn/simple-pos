import { CURRENCY, PRICE_CUSTOMISATION, PRICE_SETUP } from "./pricing";

/** Stripe's Checkout supports exactly these languages among ours. */
const STRIPE_LOCALES = new Set(["en", "th", "fr", "de"]);

export type CheckoutInput = {
  signupId: string;
  email: string;
  slug: string;
  customisation: boolean;
  locale: string;
  origin: string;
  /** Unix seconds when the Checkout page stops accepting payment (Stripe allows 30 min to 24 h). */
  expiresAt: number;
};

/** Form body for POST /v1/checkout/sessions (Stripe takes form-encoded, not JSON). */
export function buildCheckoutParams(i: CheckoutInput): URLSearchParams {
  const p = new URLSearchParams();
  p.set("mode", "payment");
  p.set("client_reference_id", i.signupId);
  p.set("customer_email", i.email);
  p.set("expires_at", String(i.expiresAt));
  p.set("locale", STRIPE_LOCALES.has(i.locale) ? i.locale : "en");
  p.set("success_url", `${i.origin}/${i.locale}/welcome?session_id={CHECKOUT_SESSION_ID}`);
  p.set("cancel_url", `${i.origin}/${i.locale}/start?cancelled=1`);
  p.set("metadata[signup_id]", i.signupId);
  p.set("metadata[slug]", i.slug);
  const lines: [string, number][] = [["Simple POS - one-time setup", PRICE_SETUP]];
  if (i.customisation) lines.push(["Curated customisation", PRICE_CUSTOMISATION]);
  lines.forEach(([name, amount], n) => {
    p.set(`line_items[${n}][quantity]`, "1");
    p.set(`line_items[${n}][price_data][currency]`, CURRENCY);
    p.set(`line_items[${n}][price_data][unit_amount]`, String(amount));
    p.set(`line_items[${n}][price_data][product_data][name]`, name);
  });
  return p;
}

export type CheckoutSession = { id: string; url: string };

export class StripeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function createCheckoutSession(
  secretKey: string,
  params: URLSearchParams,
  idempotencyKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<CheckoutSession> {
  const res = await fetchFn("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
    },
    body: params,
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !body.id || !body.url) throw new StripeError(body.error?.message ?? "Stripe request failed", res.status);
  return { id: body.id, url: body.url };
}

// ---------- webhook signature ----------

const enc = new TextEncoder();

const toHex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Constant-time string comparison (equal length hex strings). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signPayload(secret: string, timestamp: number, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${payload}`)));
}

/**
 * Checks the `Stripe-Signature` header: `t=<unix time>,v1=<hmac>[,v1=<hmac>...]`.
 * The payload must be the exact raw request body. Rejects anything older than the tolerance (replay).
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): Promise<boolean> {
  if (!header || !secret) return false;
  let t = 0;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") t = Number(v);
    else if (k === "v1" && v) sigs.push(v);
  }
  if (!Number.isFinite(t) || t <= 0 || sigs.length === 0) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = await signPayload(secret, t, payload);
  return sigs.some((s) => safeEqual(s, expected));
}

// ---------- events ----------

export type PaidSession = {
  kind: "paid";
  sessionId: string;
  paymentIntent: string | null;
  amountTotal: number;
  currency: string;
};
export type ExpiredSession = { kind: "expired"; sessionId: string };
export type IgnoredEvent = { kind: "ignored" };

type StripeEvent = {
  id: string;
  type: string;
  data?: { object?: { id?: string; payment_status?: string; payment_intent?: string | null; amount_total?: number; currency?: string } };
};

/** Reduces a Stripe event to what the shop provisioning cares about. */
export function interpretEvent(e: StripeEvent): PaidSession | ExpiredSession | IgnoredEvent {
  const o = e.data?.object;
  if (!o?.id) return { kind: "ignored" };
  const paid =
    e.type === "checkout.session.async_payment_succeeded" ||
    (e.type === "checkout.session.completed" && o.payment_status === "paid");
  if (paid) {
    return {
      kind: "paid",
      sessionId: o.id,
      paymentIntent: o.payment_intent ?? null,
      amountTotal: o.amount_total ?? 0,
      currency: (o.currency ?? "").toLowerCase(),
    };
  }
  if (e.type === "checkout.session.expired" || e.type === "checkout.session.async_payment_failed") {
    return { kind: "expired", sessionId: o.id };
  }
  return { kind: "ignored" };
}
