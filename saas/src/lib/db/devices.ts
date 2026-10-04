import { and, eq, isNull, lt, or } from "drizzle-orm";
import type { DeviceRow, ShopRow } from "../../db/schema";
import { schema, type Clock, type Db } from "./index";
import { generateToken, hashToken } from "./token";

const { devices, shops } = schema;

/** Gives a phone or tablet its own key. The key is returned once; only its hash is stored. */
export async function createDevice(db: Db, shopId: string, name: string, clock: Clock): Promise<{ deviceId: string; token: string }> {
  const token = generateToken();
  const deviceId = clock.id();
  const nowIso = clock.now.toISOString();
  await db.insert(devices).values({
    id: deviceId,
    shopId,
    tokenHash: await hashToken(token),
    name: name.slice(0, 60),
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  return { deviceId, token };
}

export async function revokeAllDevices(db: Db, shopId: string, now: Date): Promise<void> {
  await db
    .update(devices)
    .set({ revokedAt: now.toISOString(), updatedAt: now.toISOString() })
    .where(and(eq(devices.shopId, shopId), isNull(devices.revokedAt)));
}

/** "last seen" is written at most every 10 minutes so a busy till does not write on every sync. */
const SEEN_EVERY_MS = 10 * 60 * 1000;

export type Authenticated = { shop: ShopRow; device: DeviceRow };

/** The shop and device behind a key, or null for an unknown, malformed or revoked key or a suspended shop. */
export async function authenticateDevice(db: Db, token: string, now: Date): Promise<Authenticated | null> {
  if (!token.startsWith("tk_") || token.length > 100) return null;
  const hash = await hashToken(token);
  const row = await db
    .select({ device: devices, shop: shops })
    .from(devices)
    .innerJoin(shops, eq(devices.shopId, shops.id))
    .where(eq(devices.tokenHash, hash))
    .get();
  if (!row || row.device.revokedAt || row.shop.status !== "active") return null;
  const seen = row.device.lastSeenAt ? Date.parse(row.device.lastSeenAt) : 0;
  if (now.getTime() - seen > SEEN_EVERY_MS) {
    await db.update(devices).set({ lastSeenAt: now.toISOString(), updatedAt: now.toISOString() }).where(eq(devices.id, row.device.id));
  }
  return row;
}

export async function listDevices(db: Db, shopId: string): Promise<DeviceRow[]> {
  return db.select().from(devices).where(and(eq(devices.shopId, shopId), isNull(devices.revokedAt)));
}

/** Housekeeping used by tests and by the sign-in flow: forget keys revoked more than 90 days ago. */
export async function pruneRevoked(db: Db, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  await db.delete(devices).where(and(lt(devices.revokedAt, cutoff), or(isNull(devices.lastSeenAt), lt(devices.lastSeenAt, cutoff))));
}
