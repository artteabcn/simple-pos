import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { json, requireAdmin } from "../../../../lib/api";
import { makeDb } from "../../../../lib/db";
import { listRequests, REQUEST_STATUSES, type RequestStatus } from "../../../../lib/db/requests";

export const prerender = false;

const isStatus = (s: string | null): s is RequestStatus => !!s && (REQUEST_STATUSES as readonly string[]).includes(s);

/** Lists customisation requests for the team, newest first. ?status=new|in_progress|done filters; omit for all. */
export const GET: APIRoute = async ({ request }) => {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  const q = new URL(request.url).searchParams.get("status");
  const status = isStatus(q) ? q : undefined;
  const rows = await listRequests(makeDb(env.DB), status);
  return json({
    requests: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      shopName: r.shopName,
      contact: r.contact,
      needs: JSON.parse(r.needsJson || "[]") as string[],
      details: r.details,
      locale: r.locale,
      status: r.status,
      hasShop: r.shopId !== null,
      createdAt: r.createdAt,
    })),
  });
};
