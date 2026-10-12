import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, testClock } from "../../test/d1";
import { createPaidShop } from "../../test/fixtures";
import { loginMail, sendMail, welcomeMail } from "../email";
import { LOCALES } from "../../i18n/utils";
import { authenticateDevice, createDevice, listDevices, revokeAllDevices } from "./devices";
import { schema, type Db } from "./index";
import { issueLoginLinks, MAX_LINKS_PER_HOUR, redeemLoginLink } from "./login";
import { hashPin, isManager, MANAGER_SESSION_MS, MAX_PIN_FAILURES, PIN_LOCK_MS, setPin, unlockWithPin } from "./pin";
import { syncShop } from "./sync";
import type { SyncConfig, SyncRequest } from "../validations/sync";

let db: Db;
let clock: ReturnType<typeof testClock>;
const SECRET = "test-app-secret-not-real";

beforeEach(() => {
  db = createTestDb().db;
  clock = testClock();
});

describe("devices", () => {
  it("each device has its own key and one can be switched off alone", async () => {
    const { shop, token } = await createPaidShop(db, clock);
    const second = await createDevice(db, shop.id, "Back counter", clock);
    expect((await authenticateDevice(db, token, clock.now))?.shop.id).toBe(shop.id);
    expect((await authenticateDevice(db, second.token, clock.now))?.shop.id).toBe(shop.id);
    await db.update(schema.devices).set({ revokedAt: clock.now.toISOString() }).where(eq(schema.devices.id, second.deviceId));
    expect(await authenticateDevice(db, second.token, clock.now)).toBeNull();
    expect(await authenticateDevice(db, token, clock.now)).not.toBeNull();
    expect(await listDevices(db, shop.id)).toHaveLength(1);
  });
  it("revoking all devices stops every key", async () => {
    const { shop, token } = await createPaidShop(db, clock);
    await revokeAllDevices(db, shop.id, clock.now);
    expect(await authenticateDevice(db, token, clock.now)).toBeNull();
  });
  it("never stores the key itself", async () => {
    const { token } = await createPaidShop(db, clock);
    expect(JSON.stringify(await db.select().from(schema.devices))).not.toContain(token);
  });
  it("records last-seen but not on every request", async () => {
    const { device, token } = await createPaidShop(db, clock);
    await authenticateDevice(db, token, clock.now);
    const first = (await db.select().from(schema.devices).where(eq(schema.devices.id, device.id)).get())?.lastSeenAt;
    clock.advance(60_000);
    await authenticateDevice(db, token, clock.now);
    expect((await db.select().from(schema.devices).where(eq(schema.devices.id, device.id)).get())?.lastSeenAt).toBe(first);
    clock.advance(11 * 60_000);
    await authenticateDevice(db, token, clock.now);
    expect((await db.select().from(schema.devices).where(eq(schema.devices.id, device.id)).get())?.lastSeenAt).not.toBe(first);
  });
});

describe("email sign-in links", () => {
  it("an unknown address gets nothing (and the caller answers the same either way)", async () => {
    await createPaidShop(db, clock);
    expect(await issueLoginLinks(db, "stranger@example.com", clock)).toEqual([]);
  });
  it("a link opens the shop on a new device, once", async () => {
    const { shop } = await createPaidShop(db, clock);
    const [link] = await issueLoginLinks(db, "mali@example.com", clock);
    expect(link?.shopId).toBe(shop.id);
    const first = await redeemLoginLink(db, link!.token, "Phone", clock);
    expect(first).toMatchObject({ slug: "baan-mali", name: "Baan Mali" });
    expect((await authenticateDevice(db, first!.token, clock.now))?.shop.id).toBe(shop.id);
    expect(await redeemLoginLink(db, link!.token, "Phone", clock)).toBeNull(); // single use
  });
  it("expires after 15 minutes", async () => {
    await createPaidShop(db, clock);
    const [link] = await issueLoginLinks(db, "mali@example.com", clock);
    clock.advance(16 * 60_000);
    expect(await redeemLoginLink(db, link!.token, "Phone", clock)).toBeNull();
  });
  it("only the hash is stored, and wrong or malformed tokens fail", async () => {
    await createPaidShop(db, clock);
    const [link] = await issueLoginLinks(db, "mali@example.com", clock);
    expect(JSON.stringify(await db.select().from(schema.loginLinks))).not.toContain(link!.token);
    expect(await redeemLoginLink(db, "ll_wrong", "x", clock)).toBeNull();
    expect(await redeemLoginLink(db, "tk_" + link!.token.slice(3), "x", clock)).toBeNull(); // a device key is not a link
    expect(await redeemLoginLink(db, "x".repeat(300), "x", clock)).toBeNull();
  });
  it("an owner of two shops gets one link per shop, each opening its own shop", async () => {
    await createPaidShop(db, clock, { slug: "shop-one", name: "One", session: "cs_1" });
    await createPaidShop(db, clock, { slug: "shop-two", name: "Two", session: "cs_2" });
    const links = await issueLoginLinks(db, "mali@example.com", clock);
    expect(links.map((l) => l.shopName).sort()).toEqual(["One", "Two"]);
    const a = await redeemLoginLink(db, links[0]!.token, "x", clock);
    expect(a?.name).toBe(links[0]!.shopName);
  });
  it("is rate-limited per address", async () => {
    await createPaidShop(db, clock);
    let got = 0;
    for (let i = 0; i < MAX_LINKS_PER_HOUR + 3; i++) got += (await issueLoginLinks(db, "mali@example.com", clock)).length;
    expect(got).toBe(MAX_LINKS_PER_HOUR);
    clock.advance(61 * 60_000);
    expect(await issueLoginLinks(db, "mali@example.com", clock)).toHaveLength(1);
  });
  it("a suspended shop gets no link", async () => {
    const { shop } = await createPaidShop(db, clock);
    await db.update(schema.shops).set({ status: "suspended" }).where(eq(schema.shops.id, shop.id));
    expect(await issueLoginLinks(db, "mali@example.com", clock)).toEqual([]);
  });
});

describe("manager PIN", () => {
  it("unlocks only the device that entered it, for 30 minutes", async () => {
    const { shop, device } = await createPaidShop(db, clock);
    const other = await createDevice(db, shop.id, "Other", clock);
    await setPin(db, shop, "4821", SECRET, clock.now);
    const r = await unlockWithPin(db, shop, device, "4821", SECRET, clock);
    if (!r.ok) throw new Error("unlock");
    expect(await isManager(db, device, r.token, clock.now)).toBe(true);
    const otherAuth = (await authenticateDevice(db, other.token, clock.now))!;
    expect(await isManager(db, otherAuth.device, r.token, clock.now)).toBe(false); // a stolen proof is useless elsewhere
    expect(await isManager(db, device, null, clock.now)).toBe(false);
    expect(await isManager(db, device, "mg_wrong", clock.now)).toBe(false);
    clock.advance(MANAGER_SESSION_MS + 1000);
    expect(await isManager(db, device, r.token, clock.now)).toBe(false);
  });
  it("five wrong tries lock it for 15 minutes, even for the right PIN", async () => {
    const { shop, device } = await createPaidShop(db, clock);
    await setPin(db, shop, "4821", SECRET, clock.now);
    for (let i = 1; i < MAX_PIN_FAILURES; i++) {
      const r = await unlockWithPin(db, shop, device, "0000", SECRET, clock);
      expect(r).toEqual({ ok: false, reason: "wrong", attemptsLeft: MAX_PIN_FAILURES - i });
    }
    const locking = await unlockWithPin(db, shop, device, "0000", SECRET, clock);
    expect(locking).toMatchObject({ ok: false, reason: "locked" });
    expect(await unlockWithPin(db, shop, device, "4821", SECRET, clock)).toMatchObject({ ok: false, reason: "locked" });
    clock.advance(PIN_LOCK_MS + 1000);
    expect((await unlockWithPin(db, shop, device, "4821", SECRET, clock)).ok).toBe(true);
  });
  it("a right PIN resets the failure count", async () => {
    const { shop, device } = await createPaidShop(db, clock);
    await setPin(db, shop, "4821", SECRET, clock.now);
    await unlockWithPin(db, shop, device, "1111", SECRET, clock);
    await unlockWithPin(db, shop, device, "4821", SECRET, clock);
    expect(await unlockWithPin(db, shop, device, "1111", SECRET, clock)).toMatchObject({ reason: "wrong", attemptsLeft: MAX_PIN_FAILURES - 1 });
  });
  it("reports when no PIN is set, and rejects malformed PINs without leaking", async () => {
    const { shop, device } = await createPaidShop(db, clock);
    expect(await unlockWithPin(db, shop, device, "4821", SECRET, clock)).toEqual({ ok: false, reason: "no_pin" });
    await setPin(db, shop, "4821", SECRET, clock.now);
    expect(await unlockWithPin(db, shop, device, "abcd", SECRET, clock)).toMatchObject({ ok: false, reason: "wrong" });
  });
  it("stores a keyed hash, never the PIN, and the same PIN differs per shop and per secret", async () => {
    const { shop } = await createPaidShop(db, clock);
    await setPin(db, shop, "4821", SECRET, clock.now);
    const row = await db.select().from(schema.shops).where(eq(schema.shops.id, shop.id)).get();
    expect(JSON.stringify(row)).not.toContain("4821");
    expect(row?.pinHash).toBe(await hashPin(SECRET, shop.id, "4821"));
    expect(await hashPin(SECRET, "other-shop", "4821")).not.toBe(row?.pinHash);
    expect(await hashPin("another-secret", shop.id, "4821")).not.toBe(row?.pinHash);
  });
});

describe("the PIN protects settings, not sales", () => {
  const cfg = (name: string, at: string): SyncConfig => ({
    profile: { name, taxId: "", tel: "", address: "", currency: "฿", logo: "", promptpay: "", vatMode: "inclusive" },
    menu: [{ id: "m1", nameEN: "Tea", nameTH: "ชา", price: 35 }],
    updatedAt: at,
  });
  const bill = (id: string) => ({
    id, updatedAt: "2026-10-04T10:05:00.000Z", label: id, lines: [], discountPct: 0, servicePct: 0, vatMode: "none" as const,
    subtotal: 10, discount: 0, service: 0, vat: 0, total: 10, method: "cash" as const, paidAt: "2026-10-04T10:05:00.000Z",
  });
  const req = (over: Partial<SyncRequest> = {}): SyncRequest => ({ saved: [], paid: [], since: null, ...over });

  it("without a PIN anyone with a device may edit settings", async () => {
    const { shop } = await createPaidShop(db, clock);
    const r = await syncShop(db, shop, req({ config: cfg("A", "2026-10-04T10:01:00.000Z") }), clock, false);
    expect(r.configRejected).toBeUndefined();
    expect(r.pinSet).toBe(false);
  });
  it("with a PIN, staff can sell and sync bills but cannot change prices or the menu", async () => {
    const { shop } = await createPaidShop(db, clock);
    await syncShop(db, shop, req({ config: cfg("Original", "2026-10-04T10:01:00.000Z") }), clock, false);
    await setPin(db, (await db.select().from(schema.shops).get())!, "4821", SECRET, clock.now);
    const locked = (await db.select().from(schema.shops).get())!;

    const staff = await syncShop(db, locked, req({ config: cfg("Hacked", "2026-10-04T11:00:00.000Z"), paid: [bill("b1")] }), clock, false);
    expect(staff.pinSet).toBe(true);
    expect(staff.configRejected).toBe(true);
    expect(staff.config?.profile.name).toBe("Original"); // the till is handed the real settings back
    expect(staff.paid.map((x) => x.id)).toEqual(["b1"]); // the sale was still saved
    expect((await db.select().from(schema.shops).get())?.name).toBe("Original");

    const boss = await syncShop(db, locked, req({ config: cfg("Renamed", "2026-10-04T11:00:00.000Z") }), clock, true);
    expect(boss.configRejected).toBeUndefined();
    expect((await db.select().from(schema.shops).get())?.name).toBe("Renamed");
  });
});

describe("emails", () => {
  it("every language has a subject, the link and the shop name", () => {
    for (const l of LOCALES) {
      const m = loginMail("a@b.co", l, [{ name: "Baan Mali", url: "https://pos.example/x#token=ll_abc" }]);
      expect(m.subject.length, l).toBeGreaterThan(3);
      expect(m.html).toContain("https://pos.example/x#token=ll_abc");
      expect(m.html).toContain("Baan Mali");
      expect(welcomeMail("a@b.co", l, "https://pos.example/y").html).toContain("https://pos.example/y");
    }
  });
  it("escapes shop names so an email cannot carry markup", () => {
    const m = loginMail("a@b.co", "en", [{ name: '<img src=x onerror=alert(1)>"', url: "https://pos.example/x" }]);
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("&lt;img");
  });
  it("does nothing without an API key, and never throws when Resend fails", async () => {
    let calls = 0;
    const spy = (async () => { calls++; return new Response("{}", { status: 500 }); }) as unknown as typeof fetch;
    expect(await sendMail({}, loginMail("a@b.co", "en", []), spy)).toEqual({ sent: false });
    expect(calls).toBe(0);
    expect(await sendMail({ RESEND_API_KEY: "re_x", EMAIL_FROM: "Simple POS <no-reply@example.com>" }, loginMail("a@b.co", "en", []), spy)).toEqual({ sent: false });
    expect(calls).toBe(1);
    const boom = (async () => { throw new Error("network"); }) as unknown as typeof fetch;
    expect(await sendMail({ RESEND_API_KEY: "re_x", EMAIL_FROM: "x" }, loginMail("a@b.co", "en", []), boom)).toEqual({ sent: false });
  });
  it("sends the right fields to Resend", async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    const ok = (async (url: string, init: RequestInit) => { sent = { url, init }; return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
    const r = await sendMail({ RESEND_API_KEY: "re_x", EMAIL_FROM: "Simple POS <no-reply@example.com>", EMAIL_REPLY_TO: "hello@example.com" }, welcomeMail("owner@x.co", "de", "https://pos.example/z"), ok);
    expect(r.sent).toBe(true);
    const body = JSON.parse(String(sent?.init.body));
    expect(body).toMatchObject({ from: "Simple POS <no-reply@example.com>", to: ["owner@x.co"], reply_to: "hello@example.com" });
    expect((sent?.init.headers as Record<string, string>).Authorization).toBe("Bearer re_x");
    expect(sent?.url).toBe("https://api.resend.com/emails");
  });
});
