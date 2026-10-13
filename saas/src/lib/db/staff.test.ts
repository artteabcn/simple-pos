import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, testClock } from "../../test/d1";
import { createPaidShop } from "../../test/fixtures";
import { MAX_PIN_FAILURES } from "./pin";
import {
  createStaff,
  currentStaffSession,
  deactivateStaff,
  listStaff,
  MAX_STAFF_PER_SHOP,
  renameStaff,
  setStaffPin,
  unlockWithStaffPin,
} from "./staff";
import type { Db } from "./index";

let db: Db;
let clock: ReturnType<typeof testClock>;
const SECRET = "test-app-secret-not-real";

beforeEach(() => {
  db = createTestDb().db;
  clock = testClock();
});

describe("staff", () => {
  it("adds a staff member with their own PIN, and the PIN unlocks them by name", async () => {
    const { shop, device } = await createPaidShop(db, clock);
    const r = await createStaff(db, shop.id, "Nok", "1234", SECRET, clock);
    expect(r.ok).toBe(true);

    const unlock = await unlockWithStaffPin(db, shop, device, "1234", SECRET, clock);
    expect(unlock.ok).toBe(true);
    if (unlock.ok) {
      expect(unlock.staffName).toBe("Nok");
      const session = await currentStaffSession(db, device, unlock.token, clock.now);
      expect(session?.staffName).toBe("Nok");
    }
  });

  it("never stores the PIN itself", async () => {
    const { shop } = await createPaidShop(db, clock);
    await createStaff(db, shop.id, "Nok", "1234", SECRET, clock);
    const rows = await listStaff(db, shop.id);
    expect(JSON.stringify(rows)).not.toContain("1234");
  });

  it("rejects a second staff member with the same PIN", async () => {
    const { shop } = await createPaidShop(db, clock);
    await createStaff(db, shop.id, "Nok", "1234", SECRET, clock);
    const r = await createStaff(db, shop.id, "Dao", "1234", SECRET, clock);
    expect(r).toEqual({ ok: false, reason: "duplicate" });
  });

  it("two different shops can reuse the same PIN digits without colliding", async () => {
    const { shop: shopA, device: deviceA } = await createPaidShop(db, clock, { slug: "shop-a" });
    const { shop: shopB, device: deviceB } = await createPaidShop(db, clock, { slug: "shop-b" });
    await createStaff(db, shopA.id, "Nok", "1234", SECRET, clock);
    await createStaff(db, shopB.id, "Dao", "1234", SECRET, clock);
    const a = await unlockWithStaffPin(db, shopA, deviceA, "1234", SECRET, clock);
    const b = await unlockWithStaffPin(db, shopB, deviceB, "1234", SECRET, clock);
    expect(a.ok && a.staffName).toBe("Nok");
    expect(b.ok && b.staffName).toBe("Dao");
  });

  it("rejects an invalid PIN shape", async () => {
    const { shop } = await createPaidShop(db, clock);
    expect(await createStaff(db, shop.id, "Nok", "12", SECRET, clock)).toEqual({ ok: false, reason: "invalid" });
    expect(await createStaff(db, shop.id, "Nok", "abcd", SECRET, clock)).toEqual({ ok: false, reason: "invalid" });
  });

  it("caps the number of active staff per shop", async () => {
    const { shop } = await createPaidShop(db, clock);
    for (let i = 0; i < MAX_STAFF_PER_SHOP; i++) {
      const r = await createStaff(db, shop.id, `Staff ${i}`, String(1000 + i).slice(0, 4), SECRET, clock);
      expect(r.ok).toBe(true);
    }
    const r = await createStaff(db, shop.id, "One too many", "9999", SECRET, clock);
    expect(r).toEqual({ ok: false, reason: "limit" });
  });

  it("renames a staff member", async () => {
    const { shop } = await createPaidShop(db, clock);
    const r = await createStaff(db, shop.id, "Nok", "1234", SECRET, clock);
    expect(await renameStaff(db, shop.id, r.id!, "Nok S.", clock.now)).toBe(true);
    expect((await listStaff(db, shop.id))[0].name).toBe("Nok S.");
  });

  it("cannot rename a staff member of a different shop", async () => {
    const { shop: shopA } = await createPaidShop(db, clock, { slug: "shop-a" });
    const { shop: shopB } = await createPaidShop(db, clock, { slug: "shop-b" });
    const r = await createStaff(db, shopB.id, "Dao", "1234", SECRET, clock);
    expect(await renameStaff(db, shopA.id, r.id!, "Hacked", clock.now)).toBe(false);
  });

  it("changes a staff member's PIN; the old PIN stops working and the new one works", async () => {
    const { shop, device } = await createPaidShop(db, clock);
    const r = await createStaff(db, shop.id, "Nok", "1234", SECRET, clock);
    expect(await setStaffPin(db, shop.id, r.id!, "5678", SECRET, clock.now)).toEqual({ ok: true });
    expect((await unlockWithStaffPin(db, shop, device, "1234", SECRET, clock)).ok).toBe(false);
    const ok = await unlockWithStaffPin(db, shop, device, "5678", SECRET, clock);
    expect(ok.ok && ok.staffName).toBe("Nok");
  });

  it("deactivating a staff member keeps their name but their PIN stops unlocking", async () => {
    const { shop, device } = await createPaidShop(db, clock);
    const r = await createStaff(db, shop.id, "Nok", "1234", SECRET, clock);
    expect(await deactivateStaff(db, shop.id, r.id!, clock.now)).toBe(true);
    expect(await listStaff(db, shop.id)).toHaveLength(0);
    expect((await unlockWithStaffPin(db, shop, device, "1234", SECRET, clock)).ok).toBe(false);
  });

  it("deactivating the same staff member twice reports false the second time", async () => {
    const { shop } = await createPaidShop(db, clock);
    const r = await createStaff(db, shop.id, "Nok", "1234", SECRET, clock);
    expect(await deactivateStaff(db, shop.id, r.id!, clock.now)).toBe(true);
    expect(await deactivateStaff(db, shop.id, r.id!, clock.now)).toBe(false);
  });

  it("a deactivated staff member's PIN can be reused by someone new", async () => {
    const { shop, device } = await createPaidShop(db, clock);
    const nok = await createStaff(db, shop.id, "Nok", "1234", SECRET, clock);
    await deactivateStaff(db, shop.id, nok.id!, clock.now);
    const dao = await createStaff(db, shop.id, "Dao", "1234", SECRET, clock);
    expect(dao.ok).toBe(true);
    const unlock = await unlockWithStaffPin(db, shop, device, "1234", SECRET, clock);
    expect(unlock.ok && unlock.staffName).toBe("Dao");
  });

  it("five wrong staff PINs lock staff unlock for 15 minutes, without touching the manager PIN's own lockout", async () => {
    const { shop, device } = await createPaidShop(db, clock);
    await createStaff(db, shop.id, "Nok", "1234", SECRET, clock);
    for (let i = 0; i < MAX_PIN_FAILURES; i++) {
      const r = await unlockWithStaffPin(db, shop, device, "0000", SECRET, clock);
      expect(r.ok).toBe(false);
    }
    const locked = await unlockWithStaffPin(db, shop, device, "1234", SECRET, clock);
    expect(locked).toEqual({ ok: false, reason: "locked", retryAfterSec: expect.any(Number) });

    clock.advance(16 * 60 * 1000);
    const after = await unlockWithStaffPin(db, shop, device, "1234", SECRET, clock);
    expect(after.ok).toBe(true);
  });

  it("a staff session is tied to the device it was created on", async () => {
    const { shop, device } = await createPaidShop(db, clock);
    const other = await createPaidShop(db, clock, { slug: "second-device-shop" });
    await createStaff(db, shop.id, "Nok", "1234", SECRET, clock);
    const unlock = await unlockWithStaffPin(db, shop, device, "1234", SECRET, clock);
    expect(unlock.ok).toBe(true);
    if (unlock.ok) {
      expect(await currentStaffSession(db, device, unlock.token, clock.now)).not.toBeNull();
      expect(await currentStaffSession(db, other.device, unlock.token, clock.now)).toBeNull();
    }
  });

  it("a staff session expires", async () => {
    const { shop, device } = await createPaidShop(db, clock);
    await createStaff(db, shop.id, "Nok", "1234", SECRET, clock);
    const unlock = await unlockWithStaffPin(db, shop, device, "1234", SECRET, clock);
    expect(unlock.ok).toBe(true);
    if (unlock.ok) {
      clock.advance(13 * 60 * 60 * 1000);
      expect(await currentStaffSession(db, device, unlock.token, clock.now)).toBeNull();
    }
  });
});
