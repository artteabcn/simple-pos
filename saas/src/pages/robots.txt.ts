import type { APIRoute } from "astro";
import { SITE_URL } from "../lib/site";

export const prerender = true;

/** Private pages and the API stay out of search; the public pages are open to search and AI assistants. */
const PRIVATE = ["/api/", "/*/app/", "/*/welcome", "/*/login/verify"];
const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "PerplexityBot", "Google-Extended", "Applebot-Extended"];

export const GET: APIRoute = () => {
  const rules = ["Allow: /", ...PRIVATE.map((p) => `Disallow: ${p}`)].join("\n");
  const body = [
    `User-agent: *\n${rules}`,
    ...AI_BOTS.map((b) => `User-agent: ${b}\n${rules}`),
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    "",
  ].join("\n\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
