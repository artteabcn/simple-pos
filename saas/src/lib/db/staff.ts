import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { DeviceRow, ShopRow, StaffRow } from "../../db/schema";
import { schema, type Clock, type Db } from "./index";
import { hashPin, isValidPin, MAX_PIN_FAILURES, PIN_LOCK_MS } from "./pin";
import { generateToken, hashToken } from "./token";

const { shops, staff, staffSessions } = schema;

export const MAX_STAFF_PER_SHOP = 50;
export const STAFF_SESSION_MS = 12 * 60 * 60 * 1000; // a generous single shift

/** Active staff for a shop, newest first is not important here — by name is friendliest in a short list. */
export async function listStaff(db: Db, shopId: string): Promise<StaffRow[]> {
  return db.select().from(staff).where(and(eq(staff.shopId, shopId), eq(staff.active, true))).orderBy(staff.name);
}

/** True if this PIN is already in use by another active staff member of the shop (PINs identify who is selling). */
async function pinTaken(db: Db, shopId: string, pin: string, secret: string, excludeStaffId: string | null): Promise<boolean> {
  const rows = await listStaff(db, shopId);
  for (const s of rows) {
    if (s.id === excludeStaffId) continue;
    if ((await hashPin(secret, s.id, pin)) === s.pinHash) return true;
  }
  return false;
}

export type SetStaffPinOutcome = { ok: true } | { ok: false; reason: "invalid" | "duplicate" | "limit" };

/** Adds a staff member with their own PIN. The owner picks the PIN (no email, no self-service for staff). */
export async function createStaff(db: Db, shopId: string, name: string, pin: string, secret: string, clock: Clock): Promise<SetStaffPinOutcome & { id?: string }> {
  if (!isValidPin(pin)) return { ok: false, reason: "invalid" };
  const existing = await listStaff(db, shopId);
  if (existing.length >= MAX_STAFF_PER_SHOP) return { ok: false, reason: "limit" };
  const id = clock.id();
  if (await pinTaken(db, shopId, pin, secret, id)) return { ok: false, reason: "duplicate" };
  const nowIso = clock.now.toISOString();
  await db.insert(staff).values({ id, shopId, name: name.slice(0, 60), pinHash: await hashPin(secret, id, pin), createdAt: nowIso, updatedAt: nowIso });
  return { ok: true, id };
}

export async function renameStaff(db: Db, shopId: string, staffId: string, name: string, now: Date): Promise<boolean> {
  const row = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.id, staffId), eq(staff.shopId, shopId))).get();
  if (!row) return false;
  await db.update(staff).set({ name: name.slice(0, 60), updatedAt: now.toISOString() }).where(eq(staff.id, staffId));
  return true;
}

/** Changes a staff member's PIN (the owner re-sets it; staff cannot change their own). */
export async function setStaffPin(db: Db, shopId: string, staffId: string, pin: string, secret: string, now: Date): Promise<SetStaffPinOutcome> {
  if (!isValidPin(pin)) return { ok: false, reason: "invalid" };
  const row = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.id, staffId), eq(staff.shopId, shopId))).get();
  if (!row) return { ok: false, reason: "invalid" };
  if (await pinTaken(db, shopId, pin, secret, staffId)) return { ok: false, reason: "duplicate" };
  await db.update(staff).set({ pinHash: await hashPin(secret, staffId, pin), updatedAt: now.toISOString() }).where(eq(staff.id, staffId));
  return { ok: true };
}

/** Deactivates a staff member (kept, never deleted, so their name stays on past sales). False if already inactive/missing. */
export async function deactivateStaff(db: Db, shopId: string, staffId: string, now: Date): Promise<boolean> {
  const row = await db.select({ id: staff.id }).from(staff).where(and(eq(staff.id, staffId), eq(staff.shopId, shopId), eq(staff.active, true))).get();
  if (!row) return false;
  await db.update(staff).set({ active: false, updatedAt: now.toISOString() }).where(eq(staff.id, staffId));
  return true;
}

export type StaffUnlockResult =
  | { ok: true; token: string; expiresAt: string; staffId: string; staffName: string }
  | { ok: false; reason: "locked"; retryAfterSec: number }
  | { ok: false; reason: "wrong" };

/**
 * Checks a PIN against every active staff member of the shop (the PIN alone identifies who is selling — no
 * name picker needed). Five wrong tries lock out staff PIN attempts for 15 minutes, shared across the shop
 * and separate from the manager PIN's own lockout, so neither blocks the other.
 */
export async function unlockWithStaffPin(db: Db, shop: ShopRow, device: DeviceRow, pin: string, secret: string, clock: Clock): Promise<StaffUnlockResult> {
  const fresh = await db.select().from(shops).where(eq(shops.id, shop.id)).get() ?? shop;
  const nowIso = clock.now.toISOString();
  if (fresh.staffPinLockedUntil && fresh.staffPinLockedUntil > nowIso) {
    return { ok: false, reason: "locked", retryAfterSec: Math.ceil((Date.parse(fresh.staffPinLockedUntil) - clock.now.getTime()) / 1000) };
  }

  let match: StaffRow | null = null;
  if (isValidPin(pin)) {
    for (const s of await listStaff(db, shop.id)) {
      if ((await hashPin(secret, s.id, pin)) === s.pinHash) {
        match = s;
        break;
      }
    }
  }

  if (!match) {
    await db.update(shops).set({ staffPinFailures: sql`${shops.staffPinFailures} + 1`, updatedAt: nowIso }).where(eq(shops.id, shop.id));
    const after = await db.select({ f: shops.staffPinFailures }).from(shops).where(eq(shops.id, shop.id)).get();
    const failures = after?.f ?? MAX_PIN_FAILURES;
    if (failures >= MAX_PIN_FAILURES) {
      const until = new Date(clock.now.getTime() + PIN_LOCK_MS).toISOString();
      await db.update(shops).set({ staffPinFailures: 0, staffPinLockedUntil: until, updatedAt: nowIso }).where(eq(shops.id, shop.id));
      return { ok: false, reason: "locked", retryAfterSec: Math.ceil(PIN_LOCK_MS / 1000) };
    }
    return { ok: false, reason: "wrong" };
  }

  await db.update(shops).set({ staffPinFailures: 0, staffPinLockedUntil: null, updatedAt: nowIso }).where(eq(shops.id, shop.id));
  const token = generateToken().replace(/^tk_/, "sf_");
  const expiresAt = new Date(clock.now.getTime() + STAFF_SESSION_MS).toISOString();
  await db.insert(staffSessions).values({ tokenHash: await hashToken(token), deviceId: device.id, staffId: match.id, expiresAt, createdAt: nowIso, updatedAt: nowIso });
  await db.delete(staffSessions).where(lt(staffSessions.expiresAt, nowIso)); // housekeeping
  return { ok: true, token, expiresAt, staffId: match.id, staffName: match.name };
}

export type StaffSession = { staffId: string; staffName: string };

/** Is this device currently holding a valid staff session? (Mirrors isManager, but for whoever is selling.) */
export async function currentStaffSession(db: Db, device: DeviceRow, token: string | null, now: Date): Promise<StaffSession | null> {
  if (!token || !token.startsWith("sf_") || token.length > 100) return null;
  const row = await db
    .select({ staffId: staffSessions.staffId, name: staff.name })
    .from(staffSessions)
    .innerJoin(staff, eq(staff.id, staffSessions.staffId))
    .where(
      and(
        eq(staffSessions.tokenHash, await hashToken(token)),
        eq(staffSessions.deviceId, device.id),
        eq(staff.active, true),
        gt(staffSessions.expiresAt, now.toISOString()),
      ),
    )
    .get();
  return row ? { staffId: row.staffId, staffName: row.name } : null;
}
