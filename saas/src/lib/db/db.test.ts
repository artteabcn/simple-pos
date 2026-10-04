import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, testClock } from "../../test/d1";
import type { Db } from "./index";
import { claimShop, markEventSeen, provisionPaidSession, shopByToken } from "./provision";
import { attachStripeSession, expireBySession, isSlugAvailable, reserveSignup } from "./signups";
import { storedConfig, syncShop } from "./sync";
import { schema } from "./index";
import type { SyncRequest } from "../validations/sync";
import { eq } from "drizzle-orm";

let db: Db;
let clock: ReturnType<typeof testClock>;
beforeEach(() => {
  db = createTestDb().db;
  clock = testClock();
});

const signup = { shopName: "Baan Mali", slug: "baan-mali", email: "mali@example.com", customisation: false, locale: "en" as const };

/** Reserve + attach a Stripe session, as the checkout endpoint does. */
async function startCheckout(over: Partial<typeof signup> = {}, session = "cs_1") {
  const r = await reserveSignup(db, { ...signup, ...over }, clock);
  if (!r.ok) throw new Error("slug taken");
  await attachStripeSession(db, r.signupId, session, clock.now);
  return r.signupId;
}
const paid = (session = "cs_1", amount = 49_900) => ({ sessionId: session, paymentIntent: "pi_1", amountTotal: amount, currency: "thb" });

async function newShop() {
  await startCheckout();
  const p = await provisionPaidSession(db, paid(), clock);
  if (p.status !== "created") throw new Error("not created");
  const c = await claimShop(db, "cs_1", clock);
  if (c.status !== "ok") throw new Error("not claimed");
  const shop = await shopByToken(db, c.token);
  if (!shop) throw new Error("no shop");
  return { shop, token: c.token };
}

describe("reserving an address", () => {
  it("is free at first, then held for someone else while unpaid", async () => {
    expect(await isSlugAvailable(db, "baan-mali", "a@x.co", clock.now)).toBe(true);
    await reserveSignup(db, signup, clock);
    expect(await isSlugAvailable(db, "baan-mali", "other@x.co", clock.now)).toBe(false);
    expect(await isSlugAvailable(db, "baan-mali", signup.email, clock.now)).toBe(true); // same person retrying
  });
  it("is released after an hour", async () => {
    await reserveSignup(db, signup, clock);
    clock.advance(61 * 60 * 1000);
    expect(await isSlugAvailable(db, "baan-mali", "other@x.co", clock.now)).toBe(true);
  });
  it("is released when the checkout expires", async () => {
    await startCheckout();
    await expireBySession(db, "cs_1", clock.now);
    expect(await isSlugAvailable(db, "baan-mali", "other@x.co", clock.now)).toBe(true);
  });
  it("is taken for good once a shop exists", async () => {
    await newShop();
    expect(await isSlugAvailable(db, "baan-mali", signup.email, clock.now)).toBe(false);
    expect(await reserveSignup(db, signup, clock)).toEqual({ ok: false, reason: "slug_taken" });
  });
  it("records the amount for the add-on", async () => {
    await reserveSignup(db, { ...signup, customisation: true }, clock);
    const row = await db.select().from(schema.signups).get();
    expect(row?.amountExpected).toBe(79_800);
  });
});

describe("payment provisioning", () => {
  it("creates the shop and the payment record", async () => {
    await startCheckout();
    const r = await provisionPaidSession(db, paid(), clock);
    expect(r).toMatchObject({ status: "created", slug: "baan-mali" });
    const shops = await db.select().from(schema.shops);
    expect(shops).toHaveLength(1);
    expect(shops[0]).toMatchObject({ name: "Baan Mali", ownerEmail: "mali@example.com", status: "active", tokenHash: null });
    expect((await db.select().from(schema.payments))[0]).toMatchObject({ amountTotal: 49_900, currency: "thb" });
    expect((await db.select().from(schema.signups).get())?.status).toBe("paid");
  });
  it("is idempotent: the same payment twice makes one shop", async () => {
    await startCheckout();
    await provisionPaidSession(db, paid(), clock);
    expect((await provisionPaidSession(db, paid(), clock)).status).toBe("duplicate");
    expect(await db.select().from(schema.shops)).toHaveLength(1);
    expect(await db.select().from(schema.payments)).toHaveLength(1);
  });
  it("ignores a session it never started", async () => {
    expect((await provisionPaidSession(db, paid("cs_unknown"), clock)).status).toBe("unknown_session");
    expect(await db.select().from(schema.shops)).toHaveLength(0);
  });
  it("refuses a payment of the wrong amount", async () => {
    await startCheckout();
    expect((await provisionPaidSession(db, paid("cs_1", 100), clock)).status).toBe("amount_mismatch");
    expect(await db.select().from(schema.shops)).toHaveLength(0);
  });
  it("honours a payment that arrives after the hold lapsed, picking a free address if needed", async () => {
    await startCheckout();
    clock.advance(2 * 60 * 60 * 1000); // hold lapsed
    // someone else pays for the same address in the meantime
    await startCheckout({ email: "other@example.com" }, "cs_2");
    await provisionPaidSession(db, paid("cs_2"), clock);
    const late = await provisionPaidSession(db, paid("cs_1"), clock);
    expect(late).toMatchObject({ status: "created", slug: "baan-mali-2" });
  });
  it("remembers handled Stripe events", async () => {
    expect(await markEventSeen(db, "evt_1", "x", clock.now)).toBe(true);
    expect(await markEventSeen(db, "evt_1", "x", clock.now)).toBe(false);
  });
});

describe("claiming the till key", () => {
  it("waits until the payment has been recorded", async () => {
    expect((await claimShop(db, "cs_1", clock)).status).toBe("pending");
  });
  it("gives a working key; the database only holds its hash", async () => {
    await startCheckout();
    await provisionPaidSession(db, paid(), clock);
    const c = await claimShop(db, "cs_1", clock);
    if (c.status !== "ok") throw new Error("claim");
    expect(c.token.startsWith("tk_")).toBe(true);
    expect((await shopByToken(db, c.token))?.slug).toBe("baan-mali");
    const row = await db.select().from(schema.shops).get();
    expect(JSON.stringify(row)).not.toContain(c.token);
  });
  it("lets the owner claim again (new key) until the till has synced, then insists on sign-in", async () => {
    const { shop, token } = await newShop();
    const again = await claimShop(db, "cs_1", clock);
    if (again.status !== "ok") throw new Error("reclaim");
    expect(again.token).not.toBe(token);
    expect(await shopByToken(db, token)).toBeNull(); // old key stopped working
    await syncShop(db, shop, { saved: [], paid: [], since: null }, clock);
    expect((await claimShop(db, "cs_1", clock)).status).toBe("already_claimed");
  });
  it("rejects unknown, malformed and suspended keys", async () => {
    const { shop, token } = await newShop();
    expect(await shopByToken(db, "tk_nope")).toBeNull();
    expect(await shopByToken(db, "x".repeat(300))).toBeNull();
    await db.update(schema.shops).set({ status: "suspended" }).where(eq(schema.shops.id, shop.id));
    expect(await shopByToken(db, token)).toBeNull();
  });
});

const bill = (id: string, sec: number, over: object = {}) => ({
  id, updatedAt: new Date(Date.UTC(2026, 9, 4, 12, 0, sec)).toISOString(), label: id, lines: [], discountPct: 0, servicePct: 0,
  vatMode: "inclusive" as const, subtotal: sec, discount: 0, service: 0, vat: 0, total: sec, method: "cash" as const,
  paidAt: new Date(Date.UTC(2026, 9, 4, 12, 0, sec)).toISOString(), ...over,
});
const tomb = (id: string, sec: number) => ({ id, deleted: true as const, updatedAt: new Date(Date.UTC(2026, 9, 4, 12, 0, sec)).toISOString() });
const req = (over: Partial<SyncRequest> = {}): SyncRequest => ({ saved: [], paid: [], since: null, ...over });

describe("till sync", () => {
  it("keeps bills from two tills", async () => {
    const { shop } = await newShop();
    await syncShop(db, shop, req({ paid: [bill("a", 1)] }), clock);
    clock.advance(1000);
    const r = await syncShop(db, shop, req({ paid: [bill("b", 2)] }), clock);
    expect(r.paid.map((x) => x.id).sort()).toEqual(["a", "b"]); // first sync of the second till gets everything
  });
  it("a delete beats a stale copy from a till that was offline", async () => {
    const { shop } = await newShop();
    await syncShop(db, shop, req({ paid: [bill("a", 1)] }), clock);
    clock.advance(1000);
    await syncShop(db, shop, req({ paid: [tomb("a", 30)] }), clock);
    clock.advance(1000);
    const r = await syncShop(db, shop, req({ paid: [bill("a", 1)] }), clock); // stale re-upload
    const a = r.paid.find((x) => x.id === "a");
    expect(a?.deleted).toBe(true);
  });
  it("returns only what changed since the last sync (with a small overlap)", async () => {
    const { shop } = await newShop();
    const first = await syncShop(db, shop, req({ paid: [bill("a", 1)] }), clock);
    clock.advance(60_000);
    const second = await syncShop(db, shop, req({ paid: [bill("b", 2)], since: first.serverTime }), clock);
    expect(second.paid.map((x) => x.id).sort()).toEqual(["a", "b"]); // "a" is inside the 5 s overlap: harmless re-delivery
    clock.advance(60_000);
    const third = await syncShop(db, shop, req({ since: second.serverTime }), clock);
    expect(third.paid.map((x) => x.id)).toEqual(["b"]); // "a" is older than the cursor, "b" inside the overlap
  });
  it("totals and records survive the round trip exactly", async () => {
    const { shop } = await newShop();
    const r = await syncShop(db, shop, req({ paid: [bill("a", 1, { total: 2400 })] }), clock);
    expect(r.paid[0]).toMatchObject({ id: "a", total: 2400, method: "cash" });
    const row = await db.select().from(schema.records).get();
    expect(row).toMatchObject({ kind: "paid", total: 2400, deleted: false });
  });
  it("saves the settings: newest edit wins, a second till receives them", async () => {
    const { shop } = await newShop();
    const cfg = (name: string, at: string) => ({
      profile: { name, taxId: "", tel: "", address: "", currency: "฿", logo: "", promptpay: "0812345678", vatMode: "inclusive" as const },
      menu: [{ id: "m1", nameEN: "Tea", nameTH: "ชา", price: 35 }],
      updatedAt: at,
    });
    await syncShop(db, shop, req({ config: cfg("New name", "2026-10-04T11:00:00.000Z") }), clock);
    const fresh = (await db.select().from(schema.shops).get())!;
    expect(fresh.name).toBe("New name");
    // an older edit from another till loses and is told so
    const stale = await syncShop(db, fresh, req({ config: cfg("Old name", "2026-10-04T09:00:00.000Z") }), clock);
    expect(stale.config?.profile.name).toBe("New name");
    // a till with no settings at all receives the stored ones
    const empty = await syncShop(db, (await db.select().from(schema.shops).get())!, req(), clock);
    expect(empty.config?.menu).toHaveLength(1);
    expect(storedConfig((await db.select().from(schema.shops).get())!)?.profile.promptpay).toBe("0812345678");
  });
  it("does not hand out settings before the owner has saved any", async () => {
    const { shop } = await newShop();
    expect((await syncShop(db, shop, req(), clock)).config).toBeUndefined();
  });
  it("forgets old delete markers after a month", async () => {
    const { shop } = await newShop();
    await syncShop(db, shop, req({ paid: [tomb("a", 5)] }), clock);
    clock.advance(31 * 24 * 60 * 60 * 1000);
    await syncShop(db, shop, req(), clock);
    expect(await db.select().from(schema.records)).toHaveLength(0);
  });
  it("one shop can never see or change another shop's bills", async () => {
    const a = await newShop();
    await syncShop(db, a.shop, req({ paid: [bill("secret", 1)] }), clock);
    // second shop
    await startCheckout({ slug: "other-shop", email: "o@x.co" }, "cs_9");
    await provisionPaidSession(db, paid("cs_9"), clock);
    const c = await claimShop(db, "cs_9", clock);
    if (c.status !== "ok") throw new Error("claim");
    const shopB = (await shopByToken(db, c.token))!;
    const r = await syncShop(db, shopB, req({ paid: [tomb("secret", 99)] }), clock);
    expect(r.paid.find((x) => x.id === "secret" && !x.deleted)).toBeUndefined();
    const rowsA = await db.select().from(schema.records).where(eq(schema.records.shopId, a.shop.id));
    expect(rowsA[0]?.deleted).toBe(false); // untouched
  });
});
