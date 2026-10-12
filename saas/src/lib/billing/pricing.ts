/** Prices in satang (1 THB = 100 satang), the unit Stripe uses for THB. Change prices here only. */
export const CURRENCY = "thb";
export const PRICE_SETUP = 49_900;
export const PRICE_CUSTOMISATION = 29_900;

export const expectedAmount = (customisation: boolean): number =>
  PRICE_SETUP + (customisation ? PRICE_CUSTOMISATION : 0);

/** A signup waits for payment this long before its web address is released again. */
export const RESERVATION_MS = 60 * 60 * 1000;
