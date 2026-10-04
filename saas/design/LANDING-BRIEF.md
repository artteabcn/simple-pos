# Landing page redesign: brief for the design session

Branch: `feature/landing-redesign` (started from `fix/default-thai-getstarted`, which has the Thai fallback and the "Get started" wording; PR ArkadyaApps/simple-pos#1). Open the pull request against `main` and stop: the owner merges.

## Goal
Redesign the LANDING PAGE of "Simple POS" (one-time fee POS for small shops and restaurants in Thailand, https://pos.arkadya.tech). The current page is too formal, too text-heavy, not catchy. Make it visual-first, friendly, playful, mobile first. In 5 seconds a non-technical shop owner must get: "a cash register on my phone, I pay once, no monthly fee" and tap "Get started".

## Tools and skills agreed with the owner
- Parallax / scroll-driven motion as the main visual device (subtle, transform and opacity only, respect prefers-reduced-motion, static fallback on low-power phones).
- Skills: Kowalski, 21st-dev, motiondivision (Motion). Also available locally: design-taste-frontend, ui-ux-pro-max.
- Check package.json before adding any library; keep the Worker and page weight small; self-host everything.

## Audience and tone
Thai market first (Thai default), then EN, FR, DE. Warm, simple, a little cheeky; short sentences; no jargon (no "SaaS", "dashboard", "till" in English copy: say "cash register" or "POS").

## What to show (visuals over words)
- Hero: phone mockup of the real POS selling screen (HTML/CSS/SVG in the app's look, or a read-only live demo), the price, one big button.
- 3 steps as pictures or animation: choose items, take payment (cash or PromptPay QR), see today's sales.
- Visual feature tiles: menu, PromptPay QR, receipts and history, works offline, any phone, 4 languages.
- Pricing: 499 THB one time, optional 299 THB curated customisation. Prices only from `saas/src/lib/billing/pricing.ts` (satang), never literals. No unverified claims, fake numbers, testimonials or logos.
- Final call to action; legal links stay in the footer. All CTAs go to `/{locale}/start/`.

## Hard constraints
- Stack: Astro 7 + React islands + Tailwind v4, app in `saas/`. Read `CLAUDE.md` and `MEMORY.HTML` first.
- All text in `saas/src/i18n/{th,en,fr,de}.json`, all four at once, natural Thai, check Thai line wrapping. A test checks key and placeholder parity.
- Keep SEO and AI discoverability: title, description, canonical, hreflang, JSON-LD, OG image (`saas/design/make-og.mjs`, regenerate `public/og.png` if the look changes and decode its QR), sitemap, `llms.txt`, `llms-full.txt` (from `saas/src/lib/site.ts` and the dictionaries).
- Own SVG illustrations, no stock photos, no emojis, no hotlinking. Contrast 4.5:1, touch targets 44px+, visible focus, real headings, alt text. The landing sits in a light container (OS dark mode must not break it).
- Do not touch: the till, the API, payments, `saas/src/content/legal.ts` and its pages, the sign-up form, the sitemap (7 pages x 4 languages), language detection (Thai fallback).

## How to work
- npm via `powershell -File saas/scripts/mirror.ps1 <install|test|build|typecheck|dev>`; 134 tests and typecheck must pass.
- Verify in a real browser at 375px, tablet and desktop, in Thai and English, with screenshots.
- GitHub account for this repo: `gh auth switch -u ArkadyaApps`.
- Update `MEMORY.HTML`. No secrets; do not read key or token files.
- Start by reading the current page (`saas/src/pages/[locale]/index.astro`) and the live site, then propose a short design direction (palette, type, layout sketch, motion) for approval before building.
