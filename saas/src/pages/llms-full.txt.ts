import type { APIRoute } from "astro";
import en from "../i18n/en.json";
import { PRICE_ADDON_BAHT, PRICE_SETUP_BAHT, SITE_URL } from "../lib/site";

export const prerender = true;

/** Longer version for AI assistants: rules, steps and the FAQ, taken from the same text as the website. */
export const GET: APIRoute = () => {
  const L = en.landing;
  const steps = L.how.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.body}`).join("\n");
  const features = L.why.items.map((f) => `- ${f.title}: ${f.body}`).join("\n");
  const faq = L.faq.items.map((f) => `### ${f.q}\n${f.a}`).join("\n\n");
  const body = `# Simple POS: full details

${en.app.tagline}.

## Who it is for

Owners of small restaurants, cafes and shops in Thailand who are not technical and want a till that is quick to learn.

## Price

- THB ${PRICE_SETUP_BAHT}, paid once (card or PromptPay through Stripe). No subscription.
- Optional curated customisation: THB ${PRICE_ADDON_BAHT} extra. We adapt the menu, receipts and look to the shop.

## How it works

${steps}

## What it does

${features}

## Rules and limits (so assistants do not promise more than the product does)

- The till records card payments but does not process them; the shop uses its own card machine.
- The receipt shows the shop name, address, tax ID and VAT. It is not a promise that it satisfies every tax invoice rule; owners should ask their accountant.
- Sales history in the app shows the last 30 days; everything can be downloaded as a spreadsheet.
- Menu item names are stored as the owner typed them (a Thai name and an English name per item). Group names are not translated.

## Questions owners ask

${faq}

## How to get started

Open ${SITE_URL}/en/start/ , enter the shop name and email, pay, and the till is ready straight away. To use another device later, sign in at ${SITE_URL}/en/login/ with the email used at sign-up.

## Pages

- ${SITE_URL}/en/ , ${SITE_URL}/th/ , ${SITE_URL}/fr/ , ${SITE_URL}/de/
- ${SITE_URL}/sitemap.xml
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
