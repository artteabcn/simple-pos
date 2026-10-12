import { createContext, useContext, useMemo, type ReactNode } from "react";
import { INTL_TAG, useTranslations, type Dictionary, type Locale } from "../../i18n/utils";
import { formatMoney } from "../../lib/pos/calc";

export type I18n = {
  locale: Locale;
  t: Dictionary;
  /** Fills {placeholders} in a translated string. */
  fmt: (template: string, vars: Record<string, string | number>) => string;
  money: (n: number) => string;
  date: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
  count: (kind: "item" | "bill", n: number) => string;
};

const Ctx = createContext<I18n | null>(null);

export function I18nProvider(props: { locale: Locale; currency: string; children: ReactNode }): ReactNode {
  const { locale, currency, children } = props;
  const value = useMemo<I18n>(() => {
    const t = useTranslations(locale);
    const tag = INTL_TAG[locale];
    const fmt: I18n["fmt"] = (template, vars) =>
      template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
    return {
      locale,
      t,
      fmt,
      money: (n) => formatMoney(n, tag, currency),
      date: (iso, opts) => new Intl.DateTimeFormat(tag, opts ?? { hour: "2-digit", minute: "2-digit" }).format(new Date(iso)),
      count: (kind, n) =>
        kind === "item"
          ? n === 1 ? t.common.itemOne : fmt(t.common.itemMany, { n })
          : n === 1 ? t.common.billOne : fmt(t.common.billMany, { n }),
    };
  }, [locale, currency]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
