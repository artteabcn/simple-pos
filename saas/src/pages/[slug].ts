import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { pickLocale } from "../i18n/utils";

export const prerender = false;

/**
 * A shop's own friendly link, e.g. pos.arkadya.tech/wassanamart, straight into the till's sign-in.
 * Purely cosmetic: it carries no access of its own (that's still the emailed link + device key), it
 * just saves owners from remembering a generic app URL. Signup already keeps shop slugs out of every
 * reserved word (locale codes, "admin", "app", "api", ...), so this can never shadow a real page.
 */
export const GET: APIRoute = async ({ params, request }) => {
  const slug = (params.slug ?? "").toLowerCase();
  const shop = await env.DB.prepare("SELECT 1 FROM shops WHERE slug = ?1").bind(slug).first();
  if (!shop) return new Response("Not found", { status: 404 });

  const header = request.headers.get("accept-language") ?? "";
  const preferred = header
    .split(",")
    .map((p) => p.trim().split(";")[0])
    .filter(Boolean);
  const locale = pickLocale(preferred);
  return new Response(null, { status: 302, headers: { Location: `/${locale}/app/` } });
};
