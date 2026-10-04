import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Bookmark, Check, History, Loader2, Smartphone, Store, ShoppingBag, WifiOff } from "lucide-react";
import { clsx } from "clsx";
import { LOCALES, type Locale } from "../../i18n/utils";
import { liveBills } from "../../lib/pos/state";
import { usePos } from "../../lib/pos/store";
import { loadLink, useSyncStatus, type SyncPhase } from "../../lib/pos/sync-client";
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

const hasLink = (): boolean => {
  try {
    return loadLink(localStorage) !== null;
  } catch {
    return false;
  }
};

/** One quiet line that tells the owner whether their sales are safe (so they never have to wonder). */
function SyncLine({ phase }: { phase: SyncPhase }): ReactNode {
  const { t } = useI18n();
  const map: Record<SyncPhase, { text: string; icon: ReactNode; tone: string }> = {
    local: { text: t.sync.local, icon: <Smartphone size={16} aria-hidden="true" />, tone: "text-stone-600 dark:text-stone-400" },
    idle: { text: t.sync.saved, icon: <Check size={16} strokeWidth={2.5} aria-hidden="true" />, tone: "text-brand dark:text-teal-300" },
    syncing: { text: t.sync.saving, icon: <Loader2 size={16} className="animate-spin" aria-hidden="true" />, tone: "text-stone-600 dark:text-stone-400" },
    offline: { text: t.sync.offline, icon: <WifiOff size={16} aria-hidden="true" />, tone: "text-amber-800 dark:text-amber-300" },
    error: { text: t.sync.error, icon: <AlertTriangle size={16} aria-hidden="true" />, tone: "text-amber-800 dark:text-amber-300" },
    unauthorized: { text: t.sync.unauthorized, icon: <AlertTriangle size={16} aria-hidden="true" />, tone: "text-rose-700 dark:text-rose-300" },
  };
  const s = map[phase];
  return (
    <div className="mx-auto flex max-w-6xl justify-end px-4 pb-2">
      <p role="status" className={clsx("flex min-h-6 items-center gap-1.5 text-sm font-semibold", s.tone)}>
        {s.icon}
        {s.text}
      </p>
    </div>
  );
}

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

  const sync = useSyncStatus();
  const savedCount = liveBills(state.saved).length;
  const onboarding = state.shop === null;
  // A second device that has just been linked: wait for the first sync instead of flashing the setup wizard.
  const waitingForShop = onboarding && sync.phase === "idle" && !sync.lastSyncedAt && hasLink();

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

      <SyncLine phase={sync.phase} />

      <main className="mx-auto max-w-6xl px-4">
        {waitingForShop ? (
          <p role="status" className="py-16 text-center text-lg text-stone-600 dark:text-stone-400">{t.common.loading}</p>
        ) : onboarding ? (
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
