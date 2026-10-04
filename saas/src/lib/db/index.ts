import type { D1Database } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";

export { schema };

export type Db = ReturnType<typeof makeDb>;

export function makeDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Clock = { now: Date; id: () => string };

/** Production clock and id source (random, URL-safe). */
export function liveClock(): Clock {
  return {
    now: new Date(),
    id: () => crypto.randomUUID().replace(/-/g, "").slice(0, 20),
  };
}
