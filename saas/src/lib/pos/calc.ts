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

/** Whole-baht display, e.g. 2400 -> "2,400". Never parse this back into a number: keep the number itself. */
export function formatBaht(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(n));
}
