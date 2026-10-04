import { describe, expect, it } from "vitest";
import { expectedAmount } from "./pricing";
import { buildCheckoutParams, createCheckoutSession, interpretEvent, signPayload, StripeError, verifyStripeSignature } from "./stripe";
import { SignupInputSchema, suggestSlug } from "../validations/signup";

const input = { signupId: "sg1", email: "a@b.co", slug: "baan-mali", customisation: false, locale: "th", origin: "https://pos.example", expiresAt: 1_790_003_600 };

describe("pricing", () => {
  it("499 THB, or 798 THB with the customisation add-on (in satang)", () => {
    expect(expectedAmount(false)).toBe(49_900);
    expect(expectedAmount(true)).toBe(79_800);
  });
});

describe("checkout request", () => {
  it("builds a THB one-time payment with the signup in the metadata", () => {
    const p = buildCheckoutParams(input);
    expect(p.get("mode")).toBe("payment");
    expect(p.get("line_items[0][price_data][currency]")).toBe("thb");
    expect(p.get("line_items[0][price_data][unit_amount]")).toBe("49900");
    expect(p.get("line_items[1][price_data][unit_amount]")).toBeNull();
    expect(p.get("metadata[signup_id]")).toBe("sg1");
    expect(p.get("client_reference_id")).toBe("sg1");
    expect(p.get("locale")).toBe("th");
    expect(p.get("expires_at")).toBe("1790003600");
    expect(p.get("success_url")).toBe("https://pos.example/th/welcome?session_id={CHECKOUT_SESSION_ID}");
  });
  it("adds the add-on as a second line", () => {
    const p = buildCheckoutParams({ ...input, customisation: true });
    expect(p.get("line_items[1][price_data][unit_amount]")).toBe("29900");
  });
  it("sends the secret key and an idempotency key, and returns the session", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const s = await createCheckoutSession("sk_test_x", buildCheckoutParams(input), "sg1", fake);
    expect(s).toEqual({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    const h = seen?.init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer sk_test_x");
    expect(h["Idempotency-Key"]).toBe("sg1");
    expect(seen?.url).toBe("https://api.stripe.com/v1/checkout/sessions");
  });
  it("turns a Stripe error into a StripeError", async () => {
    const fake = (async () => new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), { status: 401 })) as unknown as typeof fetch;
    await expect(createCheckoutSession("bad", buildCheckoutParams(input), "k", fake)).rejects.toBeInstanceOf(StripeError);
  });
});

describe("webhook signature", () => {
  const secret = "whsec_test_123";
  const body = '{"id":"evt_1","type":"checkout.session.completed"}';
  const t = 1_790_000_000;

  it("accepts a correct signature", async () => {
    const sig = await signPayload(secret, t, body);
    expect(await verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, t + 10)).toBe(true);
  });
  it("accepts when one of several v1 signatures matches (secret rotation)", async () => {
    const sig = await signPayload(secret, t, body);
    expect(await verifyStripeSignature(body, `t=${t},v1=${"0".repeat(64)},v1=${sig}`, secret, t)).toBe(true);
  });
  it("rejects a changed body, wrong secret, missing header, bad timestamp", async () => {
    const sig = await signPayload(secret, t, body);
    expect(await verifyStripeSignature(body + " ", `t=${t},v1=${sig}`, secret, t)).toBe(false);
    expect(await verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_other", t)).toBe(false);
    expect(await verifyStripeSignature(body, null, secret, t)).toBe(false);
    expect(await verifyStripeSignature(body, `t=abc,v1=${sig}`, secret, t)).toBe(false);
    expect(await verifyStripeSignature(body, `t=${t}`, secret, t)).toBe(false);
  });
  it("rejects a replayed old request", async () => {
    const sig = await signPayload(secret, t, body);
    expect(await verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, t + 301)).toBe(false);
    expect(await verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, t + 299)).toBe(true);
  });
});

describe("events", () => {
  const obj = (o: object) => ({ id: "evt", data: { object: { id: "cs_1", ...o } } });
  it("a paid completed session provisions", () => {
    expect(interpretEvent({ ...obj({ payment_status: "paid", amount_total: 49900, currency: "THB", payment_intent: "pi_1" }), type: "checkout.session.completed" })).toEqual({
      kind: "paid", sessionId: "cs_1", paymentIntent: "pi_1", amountTotal: 49900, currency: "thb",
    });
  });
  it("an unpaid completed session (PromptPay still pending) does not", () => {
    expect(interpretEvent({ ...obj({ payment_status: "unpaid" }), type: "checkout.session.completed" }).kind).toBe("ignored");
  });
  it("an async payment that succeeds later does", () => {
    expect(interpretEvent({ ...obj({ payment_status: "paid", amount_total: 1, currency: "thb" }), type: "checkout.session.async_payment_succeeded" }).kind).toBe("paid");
  });
  it("a refund is passed on with the amounts", () => {
    expect(interpretEvent({ id: "evt", type: "charge.refunded", data: { object: { id: "ch_1", payment_intent: "pi_9", amount: 49900, amount_refunded: 49900 } } })).toEqual({ kind: "refunded", paymentIntent: "pi_9", amount: 49900, amountRefunded: 49900 });
    expect(interpretEvent({ id: "evt", type: "charge.refunded", data: { object: { id: "ch_1", payment_intent: null } } }).kind).toBe("ignored");
  });
  it("expired / failed releases the reservation; other events are ignored", () => {
    expect(interpretEvent({ ...obj({}), type: "checkout.session.expired" }).kind).toBe("expired");
    expect(interpretEvent({ ...obj({}), type: "checkout.session.async_payment_failed" }).kind).toBe("expired");
    expect(interpretEvent({ ...obj({}), type: "charge.refunded" }).kind).toBe("ignored");
  });
});

describe("signup input", () => {
  const ok = { shopName: "Baan Mali", slug: "Baan-Mali", email: " Owner@Example.COM ", customisation: true, locale: "de" };
  it("normalises address and email", () => {
    const r = SignupInputSchema.parse(ok);
    expect(r.slug).toBe("baan-mali");
    expect(r.email).toBe("owner@example.com");
  });
  it("rejects reserved, too short, double-hyphen and path-like addresses", () => {
    for (const slug of ["admin", "ab", "a--b", "../x", "-abc", "abc-", "has space"]) {
      expect(SignupInputSchema.safeParse({ ...ok, slug }).success, slug).toBe(false);
    }
  });
  it("rejects a bad email and an unknown language", () => {
    expect(SignupInputSchema.safeParse({ ...ok, email: "nope" }).success).toBe(false);
    expect(SignupInputSchema.safeParse({ ...ok, locale: "es" }).success).toBe(false);
  });
  it("suggests an address from a Latin name, nothing for Thai-only names", () => {
    expect(suggestSlug("Café de Paris & Co.")).toBe("cafe-de-paris-co");
    expect(suggestSlug("ร้านบ้านมะลิ")).toBe("");
  });
});
