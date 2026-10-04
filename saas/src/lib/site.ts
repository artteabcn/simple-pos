/**
 * The public address of the site. Set PUBLIC_SITE_URL at build time to change it; every canonical link,
 * the sitemap, robots.txt, llms.txt and the share tags follow. Not confirmed yet: pos.arkadya.tech is a placeholder.
 */
export const SITE_URL: string = ((import.meta.env.PUBLIC_SITE_URL as string | undefined) ?? "https://pos.arkadya.tech").replace(/\/+$/, "");

export const OG_IMAGE = { path: "/og.png", width: 1200, height: 630 } as const;

/** Pages that exist for the public (no private pages), used by the sitemap and llms.txt. */
export const PUBLIC_PAGES = ["", "start/", "login/", "customize/"] as const;

/** Date of the last content change; never in the future (search engines ignore future dates). */
export const LAST_MODIFIED = "2026-10-04";

export const PRICE_SETUP_BAHT = 499;
export const PRICE_ADDON_BAHT = 299;

/** The team's LINE official account (the same one Resumai uses). */
export const LINE_URL = "https://line.me/R/ti/p/%40214pknvg";

/** Where team notifications go when TEAM_EMAIL is not set. */
export const DEFAULT_TEAM_EMAIL = "hello@arkadya.tech";
