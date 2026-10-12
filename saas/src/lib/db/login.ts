import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { schema, type Clock, type Db } from "./index";
import { createDevice } from "./devices";
import { generateToken, hashToken } from "./token";

const { loginLinks, shops } = schema;

export const LOGIN_LINK_MS = 15 * 60 * 1000;
/** At most this many links per email address per hour (stops anyone using us to spam an inbox). */
export const MAX_LINKS_PER_HOUR = 10;

export type IssuedLink = { shopId: string; shopName: string; token: string };

/**
 * One single-use link per shop owned by this email. Returns nothing for an unknown address
 * (the caller answers the same either way, so the form cannot be used to discover customers).
 */
export async function issueLoginLinks(db: Db, email: string, clock: Clock): Promise<IssuedLink[]> {
  const nowIso = clock.now.toISOString();
  const mine = await db
    .select({ id: shops.id, name: shops.name })
    .from(shops)
    .where(and(eq(shops.ownerEmail, email), eq(shops.status, "active")))
    .limit(5);
  if (!mine.length) return [];

  const hourAgo = new Date(clock.now.getTime() - 60 * 60 * 1000).toISOString();
  const recent = await db
    .select({ n: sql<number>`count(*)` })
    .from(loginLinks)
    .where(and(eq(loginLinks.email, email), gt(loginLinks.createdAt, hourAgo)))
    .get();
  if ((recent?.n ?? 0) + mine.length > MAX_LINKS_PER_HOUR) return [];

  const issued: IssuedLink[] = [];
  for (const s of mine) issued.push(await issueLoginLinkForShop(db, s.id, s.name, email, clock));
  return issued;
}

/** One single-use link for one shop (also used for the welcome email right after payment). */
export async function issueLoginLinkForShop(db: Db, shopId: string, shopName: string, email: string, clock: Clock): Promise<IssuedLink> {
  const nowIso = clock.now.toISOString();
  const token = generateToken().replace(/^tk_/, "ll_");
  await db.insert(loginLinks).values({
    id: clock.id(),
    shopId,
    email,
    tokenHash: await hashToken(token),
    expiresAt: new Date(clock.now.getTime() + LOGIN_LINK_MS).toISOString(),
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  return { shopId, shopName, token };
}

export type Redeemed = { slug: string; name: string; token: string };

/**
 * Trades a sign-in link for a new device key. The link is marked used in the same statement that
 * checks it, so two people (or an email scanner and a person) can never both use it.
 */
export async function redeemLoginLink(db: Db, token: string, deviceName: string, clock: Clock): Promise<Redeemed | null> {
  if (!token.startsWith("ll_") || token.length > 100) return null;
  const nowIso = clock.now.toISOString();
  const used = await db
    .update(loginLinks)
    .set({ usedAt: nowIso, updatedAt: nowIso })
    .where(and(eq(loginLinks.tokenHash, await hashToken(token)), isNull(loginLinks.usedAt), gt(loginLinks.expiresAt, nowIso)))
    .returning({ shopId: loginLinks.shopId });
  const shopId = used[0]?.shopId;
  if (!shopId) return null;
  const shop = await db.select().from(shops).where(eq(shops.id, shopId)).get();
  if (!shop || shop.status !== "active") return null;
  const d = await createDevice(db, shop.id, deviceName, clock);
  return { slug: shop.slug, name: shop.name, token: d.token };
}
