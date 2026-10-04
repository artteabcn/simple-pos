export type VatMode = "inclusive" | "exclusive" | "none";

export type BillTotals = {
  subtotal: number;
  discount: number;
  service: number;
  vat: number;
  total: number;
};

export const VAT_RATE = 0.07;

/** Same rules the first POS used: discount, then service charge, then VAT (included, added or none). */
export function calcTotals(
  subtotal: number,
  discountPct: number,
  servicePct: number,
  vatMode: VatMode,
): BillTotals {
  const discount = (subtotal * discountPct) / 100;
  const afterDiscount = subtotal - discount;
  const service = (afterDiscount * servicePct) / 100;
  const afterService = afterDiscount + service;
  if (vatMode === "inclusive") {
    return { subtotal, discount, service, vat: (afterService * 7) / 107, total: afterService };
  }
  if (vatMode === "exclusive") {
    const vat = afterService * VAT_RATE;
    return { subtotal, discount, service, vat, total: afterService + vat };
  }
  return { subtotal, discount, service, vat: 0, total: afterService };
}

/**
 * Quick "cash received" buttons: what a customer most likely hands over, strictly above the total,
 * rounded up to the next 50 / 100 / 500 / 1,000 note. The exact amount has its own button.
 */
export function cashSuggestions(total: number): number[] {
  const out = new Set<number>();
  for (const step of [50, 100, 500, 1000]) out.add((Math.floor(total / step + 1e-9) + 1) * step);
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

/**
 * Money for screens: "฿2,400" for whole amounts, "฿2,400.50" when there are satang, so what the
 * customer reads always matches the cash and QR amount. Never parse the result back into a number.
 */
export function formatMoney(n: number, locale: string, currency: string): string {
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  const num = new Intl.NumberFormat(locale, {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(whole ? Math.round(n) : n);
  return `${currency}${num}`;
}

/** Whole-baht display, e.g. 2400 -> "2,400". Never parse this back into a number: keep the number itself. */
export function formatBaht(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(n));
}
