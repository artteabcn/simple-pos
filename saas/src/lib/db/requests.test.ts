import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, testClock } from "../../test/d1";
import { createPaidShop } from "../../test/fixtures";
import { LOCALES } from "../../i18n/utils";
import { LINE_URL } from "../site";
import { refundOwnerMail, requestConfirmMail, sendMail, teamMail, welcomeMail } from "../email";
import { CustomizationSchema, MAX_REQUESTS_PER_HOUR } from "../validations/customization";
import { authenticateDevice } from "./devices";
import { schema, type Db } from "./index";
import { issueLoginLinks } from "./login";
import { applyRefund, ownerLocale } from "./refunds";
import { createRequest } from "./requests";

let db: Db;
let clock: ReturnType<typeof testClock>;
beforeEach(() => {
  db = createTestDb().db;
  clock = testClock();
});

const form = { name: "Mali", email: " Mali@Example.com ", shopName: "Baan Mali", contact: "@mali", needs: ["menu", "receipt"], details: "About 40 items", locale: "th" };

describe("customisation form rules", () => {
  it("accepts a normal request and tidies the email", () => {
    const r = CustomizationSchema.parse(form);
    expect(r.email).toBe("mali@example.com");
    expect(r.needs).toEqual(["menu", "receipt"]);
  });
  it("needs a name, a real email, and something to say", () => {
    expect(CustomizationSchema.safeParse({ ...form, name: "" }).success).toBe(false);
    expect(CustomizationSchema.safeParse({ ...form, email: "nope" }).success).toBe(false);
    expect(CustomizationSchema.safeParse({ ...form, needs: [], details: "" }).success).toBe(false);
    expect(CustomizationSchema.safeParse({ ...form, needs: [], details: "just a note" }).success).toBe(true);
    expect(CustomizationSchema.safeParse({ ...form, details: "", needs: ["training"] }).success).toBe(true);
  });
  it("rejects unknown options and overlong text", () => {
    expect(CustomizationSchema.safeParse({ ...form, needs: ["hack"] }).success).toBe(false);
    expect(CustomizationSchema.safeParse({ ...form, details: "x".repeat(1001) }).success).toBe(false);
    expect(CustomizationSchema.safeParse({ ...form, locale: "es" }).success).toBe(false);
  });
});

describe("saving requests", () => {
  const input = () => CustomizationSchema.parse(form);
  it("stores the request exactly as asked", async () => {
    const r = await createRequest(db, input(), clock);
    expect(r.ok).toBe(true);
    const row = await db.select().from(schema.customizationRequests).get();
    expect(row).toMatchObject({ name: "Mali", email: "mali@example.com", shopName: "Baan Mali", contact: "@mali", details: "About 40 items", locale: "th", status: "new", shopId: null });
    expect(JSON.parse(row!.needsJson)).toEqual(["menu", "receipt"]);
  });
  it("links the request to the shop when the email belongs to a paying owner", async () => {
    const { shop } = await createPaidShop(db, clock, { email: "mali@example.com" });
    const r = await createRequest(db, { ...input(), shopName: "" }, clock);
    expect(r).toMatchObject({ ok: true, hasShop: true, shopName: "Baan Mali" });
    expect((await db.select().from(schema.customizationRequests).get())?.shopId).toBe(shop.id);
  });
  it(`allows ${MAX_REQUESTS_PER_HOUR} requests per address per hour, then asks to wait`, async () => {
    for (let i = 0; i < MAX_REQUESTS_PER_HOUR; i++) expect((await createRequest(db, input(), clock)).ok).toBe(true);
    expect(await createRequest(db, input(), clock)).toEqual({ ok: false, reason: "rate_limited" });
    expect((await createRequest(db, { ...input(), email: "other@example.com" }, clock)).ok).toBe(true); // other people are unaffected
    clock.advance(61 * 60_000);
    expect((await createRequest(db, input(), clock)).ok).toBe(true);
  });
});

describe("refunds", () => {
  it("a full refund switches the till off: keys, sign-in links and all", async () => {
    const { shop, token } = await createPaidShop(db, clock, { paymentIntent: "pi_full" });
    expect(await authenticateDevice(db, token, clock.now)).not.toBeNull();
    const r = await applyRefund(db, "pi_full", 49_900, clock.now);
    expect(r.status).toBe("suspended");
    expect(await authenticateDevice(db, token, clock.now)).toBeNull();
    expect(await issueLoginLinks(db, "mali@example.com", clock)).toEqual([]);
    expect((await db.select().from(schema.shops).where(eq(schema.shops.id, shop.id)).get())?.status).toBe("suspended");
  });
  it("a partial refund changes nothing", async () => {
    const { token } = await createPaidShop(db, clock, { paymentIntent: "pi_part" });
    expect((await applyRefund(db, "pi_part", 10_000, clock.now)).status).toBe("partial");
    expect(await authenticateDevice(db, token, clock.now)).not.toBeNull();
  });
  it("knows nothing about a payment that is not ours, and is safe to repeat", async () => {
    expect((await applyRefund(db, "pi_unknown", 49_900, clock.now)).status).toBe("unknown_payment");
    await createPaidShop(db, clock, { paymentIntent: "pi_rep" });
    await applyRefund(db, "pi_rep", 49_900, clock.now);
    expect((await applyRefund(db, "pi_rep", 49_900, clock.now)).status).toBe("suspended");
  });
  it("remembers the owner's language for the notice", async () => {
    const { shop } = await createPaidShop(db, clock);
    expect(await ownerLocale(db, shop)).toBe("en");
    await db.update(schema.signups).set({ locale: "de" }).where(eq(schema.signups.slug, shop.slug));
    expect(await ownerLocale(db, shop)).toBe("de");
  });
});

describe("request, refund and team emails", () => {
  it("every language: confirmation and refund notice carry the LINE link", () => {
    for (const l of LOCALES) {
      expect(requestConfirmMail("a@b.co", l, LINE_URL).html, l).toContain(LINE_URL);
      expect(refundOwnerMail("a@b.co", l, LINE_URL).html, l).toContain(LINE_URL);
      expect(requestConfirmMail("a@b.co", l, LINE_URL).subject.length).toBeGreaterThan(5);
    }
  });
  it("the welcome email adds the request and LINE buttons only for add-on buyers", () => {
    const plain = welcomeMail("a@b.co", "en", "https://x/y").html;
    const addon = welcomeMail("a@b.co", "en", "https://x/y", { customizeUrl: "https://x/en/customize/", lineUrl: LINE_URL }).html;
    expect(plain).not.toContain("customize");
    expect(addon).toContain("https://x/en/customize/");
    expect(addon).toContain(LINE_URL);
  });
  it("team emails escape what customers typed and reply goes to the customer", async () => {
    const m = teamMail("hello@arkadya.tech", "Customisation request", [["Details", '<script>alert("x")</script>'], ["Empty", ""]], "mali@example.com");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).not.toContain("Empty");
    let body: { reply_to?: string; to?: string[] } = {};
    const spy = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
    await sendMail({ RESEND_API_KEY: "re_x", EMAIL_FROM: "Simple POS <no-reply@arkadya.tech>", EMAIL_REPLY_TO: "hello@arkadya.tech" }, m, spy);
    expect(body.reply_to).toBe("mali@example.com");
    expect(body.to).toEqual(["hello@arkadya.tech"]);
  });
});
