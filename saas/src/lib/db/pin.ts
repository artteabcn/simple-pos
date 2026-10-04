import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { DeviceRow, ShopRow } from "../../db/schema";
import { schema, type Clock, type Db } from "./index";
import { generateToken, hashToken } from "./token";

const { managerSessions, shops } = schema;

export const MAX_PIN_FAILURES = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000;
export const MANAGER_SESSION_MS = 30 * 60 * 1000;

export const isValidPin = (pin: unknown): pin is string => typeof pin === "string" && /^\d{4,6}$/.test(pin);

const toHex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * HMAC of the PIN with a server secret. A copy of the database alone cannot be used to guess
 * the (short) PINs offline, and the lockout below stops guessing through the API.
 */
export async function hashPin(secret: string, shopId: string, pin: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${shopId}:${pin}`)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function setPin(db: Db, shop: ShopRow, pin: string, secret: string, now: Date): Promise<void> {
  await db
    .update(shops)
    .set({ pinHash: await hashPin(secret, shop.id, pin), pinFailures: 0, pinLockedUntil: null, updatedAt: now.toISOString() })
    .where(eq(shops.id, shop.id));
}

export type UnlockResult =
  | { ok: true; token: string; expiresAt: string }
  | { ok: false; reason: "no_pin" }
  | { ok: false; reason: "locked"; retryAfterSec: number }
  | { ok: false; reason: "wrong"; attemptsLeft: number };

/** Checks a PIN. Five wrong tries lock the shop's PIN for 15 minutes (on every device). */
export async function unlockWithPin(db: Db, shop: ShopRow, device: DeviceRow, pin: string, secret: string, clock: Clock): Promise<UnlockResult> {
  // read fresh: another device may have failed a try a moment ago
  const fresh = await db.select().from(shops).where(eq(shops.id, shop.id)).get();
  if (!fresh?.pinHash) return { ok: false, reason: "no_pin" };
  const nowIso = clock.now.toISOString();
  if (fresh.pinLockedUntil && fresh.pinLockedUntil > nowIso) {
    return { ok: false, reason: "locked", retryAfterSec: Math.ceil((Date.parse(fresh.pinLockedUntil) - clock.now.getTime()) / 1000) };
  }

  if (!isValidPin(pin) || !safeEqual(await hashPin(secret, shop.id, pin), fresh.pinHash)) {
    await db.update(shops).set({ pinFailures: sql`${shops.pinFailures} + 1`, updatedAt: nowIso }).where(eq(shops.id, shop.id));
    const after = await db.select({ f: shops.pinFailures }).from(shops).where(eq(shops.id, shop.id)).get();
    const failures = after?.f ?? MAX_PIN_FAILURES;
    if (failures >= MAX_PIN_FAILURES) {
      const until = new Date(clock.now.getTime() + PIN_LOCK_MS).toISOString();
      await db.update(shops).set({ pinFailures: 0, pinLockedUntil: until, updatedAt: nowIso }).where(eq(shops.id, shop.id));
      return { ok: false, reason: "locked", retryAfterSec: Math.ceil(PIN_LOCK_MS / 1000) };
    }
    return { ok: false, reason: "wrong", attemptsLeft: MAX_PIN_FAILURES - failures };
  }

  await db.update(shops).set({ pinFailures: 0, pinLockedUntil: null, updatedAt: nowIso }).where(eq(shops.id, shop.id));
  const token = generateToken().replace(/^tk_/, "mg_");
  const expiresAt = new Date(clock.now.getTime() + MANAGER_SESSION_MS).toISOString();
  await db.insert(managerSessions).values({ tokenHash: await hashToken(token), deviceId: device.id, expiresAt, createdAt: nowIso, updatedAt: nowIso });
  await db.delete(managerSessions).where(lt(managerSessions.expiresAt, nowIso)); // housekeeping
  return { ok: true, token, expiresAt };
}

/** Is this device currently unlocked as manager? (The proof is tied to the device that earned it.) */
export async function isManager(db: Db, device: DeviceRow, token: string | null, now: Date): Promise<boolean> {
  if (!token || !token.startsWith("mg_") || token.length > 100) return false;
  const row = await db
    .select({ id: managerSessions.deviceId })
    .from(managerSessions)
    .where(and(eq(managerSessions.tokenHash, await hashToken(token)), eq(managerSessions.deviceId, device.id), gt(managerSessions.expiresAt, now.toISOString())))
    .get();
  return !!row;
}
