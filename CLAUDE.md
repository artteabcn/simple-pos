# Simple POS — project rules (extends the global CLAUDE.md)

**Business:** SaaS point of sale for small restaurants and shops in Thailand. One-time fee 499 THB, optional 299 THB curated customisation. Users are not technical.
**Languages:** th, en, fr, de (all four, always added together). Default by browser language, Thai for the Thai market.
**Stack:** Astro + React islands + Tailwind v4 + Drizzle/D1 in `saas/`. The repository root is the legacy single-file app, kept running until cutover; do not break it.

**Deploy target (overrides the global "Pages" default):** the SaaS (`saas/`) is a Cloudflare **Worker with static assets**, because `@astrojs/cloudflare` 14 no longer builds for Pages. D1 binding `DB`, secrets `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.

## Rules specific to this project
- Payments: a shop is created only by a correctly signed Stripe webhook for the expected amount (`src/lib/db/provision.ts`); never from the browser. Prices live only in `src/lib/billing/pricing.ts` (satang).
- Till API calls need the shop's till key (`Authorization: Bearer tk_...`); only its SHA-256 is stored. Validate every request body with Zod; never trust client input.
- Keep `.dev.vars` local and gitignored (test values only). Real keys only as Cloudflare Secrets.
- Sign-in is by emailed one-time link (token in the URL fragment, single use, 15 min); each device has its own key (`devices` table). Never answer differently for unknown email addresses. Emails go through Resend from `no-reply@arkadya.tech` (`src/lib/email.ts`), all text escaped, all four languages.
- Manager PIN is checked on the server (HMAC with `APP_SECRET`, lockout after 5 tries). Settings changes from a device without a valid manager proof are refused by `syncShop`; never move that check to the browser.
- Shared accounts live in `C:\\OneDrive\\Desktop\\ArkadyaApps` and the sibling project `CVarkadya` (Resumai): same Cloudflare account (Arkadyaproperties) and the same Stripe account, which only has **live** keys (a "test" payment is real). Never open the `*API*.txt`, `*token*.txt` or `Stripe*.txt` files there; the owner puts values into GitHub secrets herself. Deployment is `.github/workflows/deploy-saas.yml` (the only automated path: Claude's environment cannot reach Cloudflare or Stripe).
- Search and AI discoverability files (`robots.txt`, `sitemap.xml`, `llms*.txt`, JSON-LD, share image) are generated from `src/lib/site.ts` and the dictionaries. Change the domain with `PUBLIC_SITE_URL`, then regenerate `public/og.png`. Private pages (`/app`, `/welcome`, `/login/verify`) are `noindex` and blocked in robots.
- OneDrive: never run `npm install`/builds inside the repo. Use `saas\scripts\mirror.ps1 <install|test|build|check|dev>`.
- Never parse a formatted amount ("2,400.00") back into a number; keep numbers as numbers (`src/lib/pos/calc.ts`).
- All bill/paid records need `id` + `updatedAt`; deletes are tombstones (`src/lib/pos/merge.ts`).
- Escape all user text before it goes into HTML; slugs, ids and logo URLs go through the Zod schemas in `src/lib/validations/`.
- Plain, friendly wording for owners: no "slug", "manifest" or "VAT mode" in the UI.
- Update `MEMORY.HTML` whenever something ships or a decision changes. No secrets in it.
- Stripe: test mode first; secrets only as Cloudflare Secrets; never echo keys. Pricing claims and legal text are drafted on a branch and pushed only after the owner reviews them.
- Production migrations and merges to `main` are run by the owner; hand over exact commands.
