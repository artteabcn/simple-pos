import { and, eq, gt, sql } from "drizzle-orm";
import { MAX_REQUESTS_PER_HOUR, type CustomizationInput } from "../validations/customization";
import { schema, type Clock, type Db } from "./index";

const { customizationRequests, shops } = schema;

export type CreateRequestResult = { ok: true; id: string; shopName: string; hasShop: boolean } | { ok: false; reason: "rate_limited" };

/** Saves a customisation request. Links it to the shop when the email belongs to a paying owner. */
export async function createRequest(db: Db, input: CustomizationInput, clock: Clock): Promise<CreateRequestResult> {
  const nowIso = clock.now.toISOString();
  const hourAgo = new Date(clock.now.getTime() - 60 * 60 * 1000).toISOString();
  const recent = await db
    .select({ n: sql<number>`count(*)` })
    .from(customizationRequests)
    .where(and(eq(customizationRequests.email, input.email), gt(customizationRequests.createdAt, hourAgo)))
    .get();
  if ((recent?.n ?? 0) >= MAX_REQUESTS_PER_HOUR) return { ok: false, reason: "rate_limited" };

  const shop = await db.select({ id: shops.id, name: shops.name }).from(shops).where(eq(shops.ownerEmail, input.email)).limit(1).get();
  const id = clock.id();
  await db.insert(customizationRequests).values({
    id,
    shopId: shop?.id ?? null,
    name: input.name,
    email: input.email,
    shopName: input.shopName || shop?.name || "",
    contact: input.contact,
    needsJson: JSON.stringify(input.needs),
    details: input.details,
    locale: input.locale,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  return { ok: true, id, shopName: input.shopName || shop?.name || "", hasShop: !!shop };
}
