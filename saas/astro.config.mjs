// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// Static pages + a small Worker for /api routes (keeps the Worker well under the 3 MiB free-tier limit).
export default defineConfig({
  // Public address (placeholder until the domain is confirmed): set PUBLIC_SITE_URL when building.
  site: process.env.PUBLIC_SITE_URL ?? "https://pos.arkadya.tech",
  output: "server",
  // No image-transform binding needed (no raster images yet); sessions are not used either — but without
  // `session: false` the Cloudflare adapter still silently wires up a default KV-backed session driver
  // (Astro 7.2+ auto-enables it unless told not to), which made `wrangler deploy` try to provision a KV
  // namespace the deploy token has no permission for and fail outright (2026-10-04, the only deploy
  // attempt so far). Setting it also drops the session runtime from the SSR bundle.
  session: false,
  adapter: cloudflare({ imageService: "passthrough" }),
  integrations: [react()],
  devToolbar: { enabled: false },
  vite: { plugins: [tailwindcss()] },
  i18n: {
    defaultLocale: "en",
    locales: ["en", "fr", "th", "de"],
    routing: { prefixDefaultLocale: true },
  },
});
