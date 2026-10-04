import en from "./en.json";
import th from "./th.json";
import fr from "./fr.json";
import de from "./de.json";

export const LOCALES = ["en", "th", "fr", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export type Dictionary = typeof en;

const dictionaries: Record<Locale, Dictionary> = { en, th, fr, de };

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/** First supported language in the browser's preference order, else Thai (our market). */
export function pickLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return "th";
}

export function useTranslations(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/** BCP-47 tag used for Intl formatting (Thai uses the Buddhist calendar where appropriate). */
export const INTL_TAG: Record<Locale, string> = {
  en: "en-GB",
  th: "th-TH",
  fr: "fr-FR",
  de: "de-DE",
};
