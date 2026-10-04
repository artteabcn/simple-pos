/// <reference path="../.astro/types.d.ts" />

// Bindings and secrets declared in wrangler.jsonc / the Cloudflare dashboard.
interface Env {
  DB: import("@cloudflare/workers-types").D1Database;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

declare module "cloudflare:workers" {
  export const env: Env;
}
