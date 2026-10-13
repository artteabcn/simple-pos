import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { json, requireManager } from "../../../../lib/api";
import { listStaff } from "../../../../lib/db/staff";

export const prerender = false;

/** Lists this shop's active staff (names only — never the PIN hash). Manager only. */
export const GET: APIRoute = async ({ request }): Promise<Response> => {
  const who = await requireManager(request, env);
  if (who instanceof Response) return who;
  const rows = await listStaff(who.db, who.auth.shop.id);
  return json({ staff: rows.map((s) => ({ id: s.id, name: s.name })) });
};
