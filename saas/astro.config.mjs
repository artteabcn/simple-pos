// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// Static pages + a small Worker for /api routes (keeps the Worker well under the 3 MiB free-tier limit).
export default defineConfig({
  output: "server",
  // No image-transform binding needed (no raster images yet); sessions are not used either.
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
