import { useCallback, useEffect, useState, type ReactNode } from "react";
import { History, Bookmark, Store, ShoppingBag } from "lucide-react";
import { clsx } from "clsx";
import { LOCALES, type Locale } from "../../i18n/utils";
import { liveBills } from "../../lib/pos/state";
import { usePos } from "../../lib/pos/store";
import { HistoryScreen } from "./HistoryScreen";
import { I18nProvider, useI18n } from "./i18n";
import { PrintProvider } from "./Print";
import { SavedScreen } from "./SavedScreen";
import { SellScreen } from "./SellScreen";
import { SetupWizard } from "./SetupWizard";
import { ShopScreen } from "./ShopScreen";
import { ToastProvider } from "./ui";

type Tab = "sell" | "saved" | "history" | "shop";
const TABS: Tab[] = ["sell", "saved", "history", "shop"];
const ICONS = { sell: ShoppingBag, saved: Bookmark, history: History, shop: Store } as const;
const LANGUAGE_NAMES: Record<Locale, string> = { en: "English", th: "ไทย", fr: "Français", de: "Deutsch" };

const readTab = (): Tab => {
  const h = window.location.hash.replace("#", "");
  return (TABS as string[]).includes(h) ? (h as Tab) : "sell";
};

export default function PosApp({ locale }: { locale: Locale }): ReactNode {
  const [state] = usePos();
  return (
    <I18nProvider locale={locale} currency={state.shop?.profile.currency ?? "฿"}>
      <ToastProvider>
        <PrintProvider profile={state.shop?.profile ?? null}>
          <Shell />
        </PrintProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

function Shell(): ReactNode {
  const { t, locale } = useI18n();
  const [state, set] = usePos();
  const [tab, setTabState] = useState<Tab>("sell");

  useEffect(() => {
    setTabState(readTab());
    const on = (): void => setTabState(readTab());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const go = useCallback((next: Tab) => {
    window.location.hash = next;
  }, []);

  const savedCount = liveBills(state.saved).length;
  const onboarding = state.shop === null;

  return (
    <div className="app-shell min-h-dvh pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate text-xl font-extrabold text-brand dark:text-teal-300">{state.shop?.profile.name ?? t.app.name}</p>
        <label className="flex shrink-0 items-center">
          <span className="sr-only">{t.common.language}</span>
          <select
            value={locale}
            onChange={(e) => { window.location.href = `/${e.target.value}/app/${window.location.hash}`; }}
            className="min-h-11 cursor-pointer rounded-xl border border-stone-300 bg-white px-3 text-base font-semibold text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
          >
            {LOCALES.map((l) => <option key={l} value={l}>{LANGUAGE_NAMES[l]}</option>)}
          </select>
        </label>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        {onboarding ? (
          <SetupWizard set={set} />
        ) : tab === "sell" ? (
          <SellScreen state={state} set={set} goShop={() => go("shop")} />
        ) : tab === "saved" ? (
          <SavedScreen state={state} set={set} goSell={() => go("sell")} />
        ) : tab === "history" ? (
          <HistoryScreen state={state} set={set} />
        ) : (
          <ShopScreen state={state} set={set} />
        )}
      </main>

      {!onboarding && (
        <nav aria-label={t.app.name} className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-stone-800 dark:bg-stone-900/95">
          <ul className="mx-auto grid max-w-xl grid-cols-4">
            {TABS.map((id) => {
              const Icon = ICONS[id];
              const on = tab === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    aria-current={on ? "page" : undefined}
                    onClick={() => go(id)}
                    className={clsx(
                      "relative flex min-h-[4.5rem] w-full cursor-pointer flex-col items-center justify-center gap-1 text-xs font-semibold touch-manipulation transition-colors duration-150",
                      on ? "text-brand dark:text-teal-300" : "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100",
                    )}
                  >
                    <span className={clsx("absolute top-0 h-1 w-10 rounded-b-full bg-brand transition-opacity duration-150", on ? "opacity-100" : "opacity-0")} />
                    <span className="relative">
                      <Icon size={26} strokeWidth={on ? 2.25 : 1.75} aria-hidden="true" />
                      {id === "saved" && savedCount > 0 && (
                        <span className="num absolute -top-1.5 -right-3 flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white">{savedCount}</span>
                      )}
                    </span>
                    {t.nav[id]}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
