/// <reference path="../.astro/types.d.ts" />

// Bindings and secrets declared in wrangler.jsonc / the Cloudflare dashboard.
interface Env {
  DB: import("@cloudflare/workers-types").D1Database;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  /** Random secret used to protect manager PINs (HMAC key). Required for the PIN feature. */
  APP_SECRET: string;
  /** Resend. Without a key no email is sent (local development). */
  RESEND_API_KEY?: string;
  /** Sender, e.g. "Simple POS <no-reply@arkadya.tech>". A plain variable, not a secret. */
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  /** Where the team is told about new shops, requests and refunds (default hello@arkadya.tech). */
  TEAM_EMAIL?: string;
  /** Public address of the site; defaults to the address the request came to. */
  PUBLIC_SITE_URL?: string;
  /** Local development only: return sign-in links in the API reply when no email key is set. Never set in production. */
  DEV_ECHO_LINKS?: string;
}

declare module "cloudflare:workers" {
  export const env: Env;
}
