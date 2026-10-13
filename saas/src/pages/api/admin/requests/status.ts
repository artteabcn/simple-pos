import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { BodyError, json, readJson, requireAdmin } from "../../../../lib/api";
import { liveClock, makeDb } from "../../../../lib/db";
import { REQUEST_STATUSES, setRequestStatus } from "../../../../lib/db/requests";

export const prerender = false;

const Schema = z.object({ id: z.string().min(1).max(64), status: z.enum(REQUEST_STATUSES) });

export const POST: APIRoute = async ({ request }) => {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await readJson(request, 500);
  } catch (e) {
    return json({ error: "bad_request" }, e instanceof BodyError ? e.status : 400);
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid" }, 400);

  const ok = await setRequestStatus(makeDb(env.DB), parsed.data.id, parsed.data.status, liveClock().now);
  return ok ? json({ ok: true }) : json({ error: "not_found" }, 404);
};
