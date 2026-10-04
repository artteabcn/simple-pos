import { and, asc, eq, gt, lt, sql } from "drizzle-orm";
import { RecordSchema, type BillRecord } from "../validations/pos";
import { MenuItemSchema, ShopProfileSchema } from "../validations/shop";
import type { SyncConfig, SyncRequest, SyncResponse } from "../validations/sync";
import { z } from "zod";
import { schema, type Clock, type Db } from "./index";
import type { ShopRow } from "../../db/schema";

const { records, shops } = schema;

const EPOCH = "1970-01-01T00:00:00.000Z";
/** A till that asks for "changes since X" is given a little overlap, so a write that committed
 *  just after another till's read is still delivered next time. Re-delivery is harmless (merge is idempotent). */
const OVERLAP_MS = 5000;
const TOMBSTONE_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CHANGES = 5000;

/** The settings stored for a shop, or undefined when the owner has not saved any yet. */
export function storedConfig(shop: ShopRow): SyncConfig | undefined {
  if (shop.configUpdatedAt <= EPOCH) return undefined;
  try {
    const profile = ShopProfileSchema.safeParse(JSON.parse(shop.profileJson));
    const menu = z.array(MenuItemSchema).safeParse(JSON.parse(shop.menuJson));
    if (!profile.success || !menu.success) return undefined;
    return { profile: profile.data, menu: menu.data, updatedAt: shop.configUpdatedAt };
  } catch {
    return undefined;
  }
}

/**
 * `manager` says whether this request carries a valid manager proof. When the shop has a PIN, only a
 * manager may change prices, the menu or settings; everyone else can still sell and sync bills.
 */
export async function syncShop(db: Db, shop: ShopRow, req: SyncRequest, clock: Clock, manager = false): Promise<SyncResponse> {
  const nowIso = clock.now.toISOString();
  const stored = storedConfig(shop);
  let configOut: SyncConfig | undefined;

  type Stmt = Parameters<Db["batch"]>[0][number];
  const stmts: Stmt[] = [];

  // Settings: newest edit wins. A till with older (or no) settings is handed the stored ones.
  const mayEdit = !shop.pinHash || manager;
  let configRejected = false;
  if (req.config && req.config.updatedAt > shop.configUpdatedAt && !mayEdit) {
    configRejected = true;
    if (stored) configOut = stored;
  } else if (req.config && req.config.updatedAt > shop.configUpdatedAt) {
    stmts.push(
      db
        .update(shops)
        .set({
          name: req.config.profile.name,
          profileJson: JSON.stringify(req.config.profile),
          menuJson: JSON.stringify(req.config.menu),
          configUpdatedAt: req.config.updatedAt,
          updatedAt: nowIso,
        })
        .where(eq(shops.id, shop.id)),
    );
  } else if (stored && (!req.config || req.config.updatedAt < shop.configUpdatedAt)) {
    configOut = stored;
  }

  // Bills: per record, the version with the newest updatedAt wins.
  const upserts: [("saved" | "paid"), BillRecord][] = [
    ...req.saved.map((r): ["saved", BillRecord] => ["saved", r]),
    ...req.paid.map((r): ["paid", BillRecord] => ["paid", r]),
  ];
  for (const [kind, rec] of upserts) {
    const deleted = rec.deleted === true;
    stmts.push(
      db
        .insert(records)
        .values({
          shopId: shop.id,
          kind,
          id: rec.id,
          recordUpdatedAt: rec.updatedAt,
          syncedAt: nowIso,
          deleted,
          eventAt: rec.paidAt ?? rec.savedAt ?? null,
          total: deleted ? null : (rec as { total: number }).total,
          data: JSON.stringify(rec),
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .onConflictDoUpdate({
          target: [records.shopId, records.kind, records.id],
          set: {
            recordUpdatedAt: sql`excluded.record_updated_at`,
            syncedAt: nowIso,
            deleted: sql`excluded.deleted`,
            eventAt: sql`excluded.event_at`,
            total: sql`excluded.total`,
            data: sql`excluded.data`,
            updatedAt: nowIso,
          },
          setWhere: sql`excluded.record_updated_at > ${records.recordUpdatedAt}`,
        }),
    );
  }

  // Housekeeping: forget delete markers once every till has had a month to hear about them.
  stmts.push(
    db
      .delete(records)
      .where(and(eq(records.shopId, shop.id), eq(records.deleted, true), lt(records.syncedAt, new Date(clock.now.getTime() - TOMBSTONE_KEEP_MS).toISOString()))),
    db.update(shops).set({ lastSyncAt: nowIso, updatedAt: nowIso }).where(eq(shops.id, shop.id)),
  );

  await db.batch(stmts as [Stmt, ...Stmt[]]);

  const cursor = req.since ? new Date(Date.parse(req.since) - OVERLAP_MS).toISOString() : "";
  const rows = await db
    .select({ kind: records.kind, data: records.data })
    .from(records)
    .where(and(eq(records.shopId, shop.id), gt(records.syncedAt, cursor)))
    .orderBy(asc(records.syncedAt))
    .limit(MAX_CHANGES);

  const out: SyncResponse = { serverTime: nowIso, pinSet: !!shop.pinHash, saved: [], paid: [] };
  if (configRejected) out.configRejected = true;
  for (const r of rows) {
    let parsed: z.ZodSafeParseResult<BillRecord>;
    try {
      parsed = RecordSchema.safeParse(JSON.parse(r.data));
    } catch {
      continue;
    }
    if (parsed.success) out[r.kind].push(parsed.data);
  }
  if (configOut) out.config = configOut;
  return out;
}
