import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { json } from "../../lib/api";

export const prerender = false;

/** Used by the deploy workflow's smoke test: is the site up and can it reach its database? */
export const GET: APIRoute = async (): Promise<Response> => {
  try {
    const row = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return json({ ok: row?.ok === 1 });
  } catch {
    return json({ ok: false }, 503);
  }
};
