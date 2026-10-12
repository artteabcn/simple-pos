import type { APIRoute } from "astro";
import { LOCALES, useTranslations, type Locale } from "../../i18n/utils";

export const prerender = true;

export function getStaticPaths() {
  return LOCALES.map((locale) => ({ params: { locale } }));
}

/**
 * One manifest per language. The till is multi-tenant (one build serves every shop; which shop a device
 * belongs to is only known client-side, after the manifest has already been fetched unauthenticated), so
 * this uses the generic app name/icon rather than a shop's own — same reason the generated icon is a
 * plain bag, not a shop's logo.
 */
export const GET: APIRoute = ({ params }) => {
  const locale = params.locale as Locale;
  const t = useTranslations(locale);
  const manifest = {
    name: t.app.name,
    short_name: t.app.name,
    description: t.app.tagline,
    lang: locale,
    start_url: `/${locale}/app/`,
    scope: `/${locale}/app/`,
    id: `/${locale}/app/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafaf9",
    theme_color: "#0f766e",
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json; charset=utf-8" } });
};
