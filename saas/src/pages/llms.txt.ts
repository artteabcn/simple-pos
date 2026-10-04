import type { APIRoute } from "astro";
import en from "../i18n/en.json";
import { PRICE_ADDON_BAHT, PRICE_SETUP_BAHT, SITE_URL } from "../lib/site";

export const prerender = true;

/** Short, factual summary for AI assistants. Keep in step with the product and the price constants. */
export const GET: APIRoute = () => {
  const body = `# Simple POS

> ${en.app.tagline}. A web-based till for restaurants, cafes and shops in Thailand. One payment of THB ${PRICE_SETUP_BAHT}, no subscription.

## Key facts

- What it is: a point-of-sale (till) that runs in the browser on any phone, tablet or computer.
- Price: THB ${PRICE_SETUP_BAHT} one-time setup. Optional curated customisation: THB ${PRICE_ADDON_BAHT} extra.
- Payments the till records: cash (with automatic change), PromptPay (QR code with the exact amount), card (taken on the shop's own card machine).
- Languages: Thai, English, French, German.
- Works offline: sales are saved on the device first and synced to the shop's account when the connection returns.
- Staff protection: a manager PIN stops staff changing prices, the menu and settings.
- Sign-in: by emailed one-time link (no password).
- Operator: Arkadya.tech.

## Pages

- [Home (English)](${SITE_URL}/en/): what the till does, how it works, price, FAQ
- [Home (Thai)](${SITE_URL}/th/)
- [Home (French)](${SITE_URL}/fr/)
- [Home (German)](${SITE_URL}/de/)
- [Open your till](${SITE_URL}/en/start/): sign-up and payment
- [Sign in](${SITE_URL}/en/login/)
- [Full details for assistants](${SITE_URL}/llms-full.txt)
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
