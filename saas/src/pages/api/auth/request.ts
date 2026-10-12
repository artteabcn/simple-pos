import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { BodyError, json, readJson, siteOrigin } from "../../../lib/api";
import { liveClock, makeDb } from "../../../lib/db";
import { issueLoginLinks } from "../../../lib/db/login";
import { loginMail, sendMail } from "../../../lib/email";

export const prerender = false;

const Schema = z.object({
  email: z.string().trim().toLowerCase().max(120).pipe(z.email()),
  locale: z.enum(["en", "th", "fr", "de"]).default("en"),
});

/**
 * "Email me a sign-in link." The reply is the same whether or not the address belongs to a shop,
 * so this form cannot be used to find out who our customers are.
 */
export const POST: APIRoute = async ({ request }): Promise<Response> => {
  let body: unknown;
  try {
    body = await readJson(request, 2_000);
  } catch (e) {
    return json({ error: "bad_request" }, e instanceof BodyError ? e.status : 400);
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const { email, locale } = parsed.data;

  const origin = siteOrigin(request, env.PUBLIC_SITE_URL);
  const links = await issueLoginLinks(makeDb(env.DB), email, liveClock());
  const urls = links.map((l) => ({ name: l.shopName, url: `${origin}/${locale}/login/verify#token=${l.token}` }));

  let devLinks: string[] | undefined;
  if (urls.length) {
    const sent = await sendMail(env, loginMail(email, locale, urls));
    // Local development only: with no email key and the flag set, show the links instead of mailing them.
    if (!sent.sent && !env.RESEND_API_KEY && env.DEV_ECHO_LINKS === "1") devLinks = urls.map((u) => u.url);
  }
  return json({ ok: true, ...(devLinks ? { devLinks } : {}) });
};
