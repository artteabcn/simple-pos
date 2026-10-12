import type { APIRoute } from "astro";
import { INTL_TAG, LOCALES } from "../i18n/utils";
import { LAST_MODIFIED, PUBLIC_PAGES, SITE_URL } from "../lib/site";

export const prerender = true;

/** Only real public pages. Each lists its translations so search engines show the right language. */
export const GET: APIRoute = () => {
  const urls = PUBLIC_PAGES.flatMap((page) =>
    LOCALES.map((l) => {
      const alternates = [
        ...LOCALES.map((a) => `    <xhtml:link rel="alternate" hreflang="${INTL_TAG[a]}" href="${SITE_URL}/${a}/${page}"/>`),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}/en/${page}"/>`,
      ].join("\n");
      return `  <url>\n    <loc>${SITE_URL}/${l}/${page}</loc>\n    <lastmod>${LAST_MODIFIED}</lastmod>\n${alternates}\n  </url>`;
    }),
  ).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
