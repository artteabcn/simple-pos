# Simple POS — project rules (extends the global CLAUDE.md)

**Business:** SaaS point of sale for small restaurants and shops in Thailand. One-time fee 499 THB, optional 299 THB curated customisation. Users are not technical.
**Languages:** th, en, fr, de (all four, always added together). Default by browser language, Thai for the Thai market.
**Stack:** Astro + React islands + Tailwind v4 + Drizzle/D1 in `saas/`. The repository root is the legacy single-file app, kept running until cutover; do not break it.

## Rules specific to this project
- OneDrive: never run `npm install`/builds inside the repo. Use `saas\scripts\mirror.ps1 <install|test|build|check|dev>`.
- Never parse a formatted amount ("2,400.00") back into a number; keep numbers as numbers (`src/lib/pos/calc.ts`).
- All bill/paid records need `id` + `updatedAt`; deletes are tombstones (`src/lib/pos/merge.ts`).
- Escape all user text before it goes into HTML; slugs, ids and logo URLs go through the Zod schemas in `src/lib/validations/`.
- Plain, friendly wording for owners: no "slug", "manifest" or "VAT mode" in the UI.
- Update `MEMORY.HTML` whenever something ships or a decision changes. No secrets in it.
- Stripe: test mode first; secrets only as Cloudflare Secrets; never echo keys. Pricing claims and legal text are drafted on a branch and pushed only after the owner reviews them.
- Production migrations and merges to `main` are run by the owner; hand over exact commands.
