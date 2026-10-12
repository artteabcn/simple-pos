import { useMemo, useState, type ReactNode } from "react";
import { ChevronUp, Search, UtensilsCrossed } from "lucide-react";
import { clsx } from "clsx";
import { addToOrder, categoriesOf, itemName, orderTotals } from "../../lib/pos/state";
import type { PosState } from "../../lib/validations/pos";
import { CartLines, CartTotals } from "./CartPanel";
import { useI18n } from "./i18n";
import { PaySheet } from "./PaySheet";
import { Button, EmptyState, Sheet, useMediaQuery } from "./ui";

type Props = {
  state: PosState;
  set: (fn: (s: PosState) => PosState) => void;
  goShop: () => void;
};

export function SellScreen({ state, set, goShop }: Props): ReactNode {
  const { t, locale, money, count } = useI18n();
  const wide = useMediaQuery("(min-width: 1024px)");
  const [cat, setCat] = useState<string>("");
  const [q, setQ] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const menu = state.shop?.menu ?? [];
  const cats = useMemo(() => categoriesOf(menu), [menu]);
  const needle = q.trim().toLowerCase();
  const shown = menu.filter(
    (m) =>
      (!cat || m.category === cat) &&
      (!needle || m.nameEN.toLowerCase().includes(needle) || m.nameTH.toLowerCase().includes(needle)),
  );
  const qtyOf = new Map(state.order.lines.map((l) => [l.itemId, l.qty]));
  const itemCount = state.order.lines.reduce((n, l) => n + l.qty, 0);
  const total = orderTotals(state).total;

  if (!menu.length) {
    return (
      <EmptyState
        icon={<UtensilsCrossed size={30} strokeWidth={1.75} aria-hidden="true" />}
        title={t.sell.emptyMenuTitle}
        body={t.sell.emptyMenuBody}
        action={<Button variant="primary" size="lg" onClick={goShop}>{t.sell.emptyMenuAction}</Button>}
      />
    );
  }

  const charge = (): void => setPayOpen(true);

  return (
    <div className="lg:grid lg:grid-cols-[1fr_26rem] lg:gap-6">
      <section aria-label={t.nav.sell} className="min-w-0">
        <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 bg-stone-50/95 px-4 pt-1 pb-3 backdrop-blur dark:bg-stone-950/95">
          <label className="relative block">
            <span className="sr-only">{t.sell.search}</span>
            <Search size={20} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-500" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.sell.search}
              className="min-h-12 w-full rounded-xl border border-stone-300 bg-white pr-3 pl-10 text-base text-stone-900 placeholder:text-stone-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
            />
          </label>
          {cats.length > 0 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={t.shop.category}>
              {["", ...cats].map((c) => (
                <button
                  key={c || "all"}
                  type="button"
                  aria-pressed={cat === c}
                  onClick={() => setCat(c)}
                  className={clsx(
                    "min-h-11 shrink-0 cursor-pointer rounded-full px-5 text-base font-semibold touch-manipulation transition-colors duration-150",
                    cat === c ? "bg-brand text-white" : "bg-stone-200 text-stone-800 hover:bg-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700",
                  )}
                >
                  {c || t.sell.all}
                </button>
              ))}
            </div>
          )}
        </div>

        {shown.length === 0 ? (
          <p className="py-10 text-center text-base text-stone-600 dark:text-stone-400">{t.sell.noResults}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 pb-24 sm:grid-cols-3 lg:pb-4 xl:grid-cols-4">
            {shown.map((m) => {
              const n = qtyOf.get(m.id) ?? 0;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => set((s) => addToOrder(s, m))}
                    className={clsx(
                      "relative flex min-h-28 w-full cursor-pointer flex-col justify-between gap-2 rounded-2xl border-2 p-3 text-left touch-manipulation",
                      "transition-[transform,border-color,background-color] duration-150 ease-out active:scale-[0.97]",
                      n > 0
                        ? "border-brand bg-brand/5"
                        : "border-stone-200 bg-white hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700",
                    )}
                  >
                    <span className="line-clamp-2 pr-8 text-base leading-snug font-semibold text-stone-900 dark:text-stone-50">{itemName(m, locale)}</span>
                    <span className="num text-lg font-bold text-brand dark:text-teal-300">{money(m.price)}</span>
                    {n > 0 && (
                      <span key={n} className="animate-pop num absolute top-2 right-2 flex min-w-8 items-center justify-center rounded-full bg-brand px-2 py-0.5 text-sm font-bold text-white">
                        {n}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {wide ? (
        <aside aria-label={t.sell.order} className="sticky top-4 flex h-fit max-h-[calc(100dvh-9.5rem)] flex-col rounded-3xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <h2 className="px-5 pt-5 pb-3 text-lg font-bold text-stone-900 dark:text-stone-50">{t.sell.order}</h2>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
            <CartLines state={state} set={set} />
          </div>
          {itemCount > 0 && (
            <div className="border-t border-stone-200 px-5 pt-3 pb-5 dark:border-stone-800">
              <CartTotals state={state} onCharge={charge} />
            </div>
          )}
        </aside>
      ) : (
        <>
          {itemCount > 0 && (
            <div className="app-shell fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 px-4 pb-3">
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="animate-sheet mx-auto flex min-h-14 w-full max-w-xl cursor-pointer items-center justify-between rounded-2xl bg-brand px-5 text-white shadow-lg active:scale-[0.99]"
              >
                <span className="flex items-center gap-2 text-base font-semibold">
                  <ChevronUp size={22} aria-hidden="true" />
                  {t.sell.viewOrder} · {count("item", itemCount)}
                </span>
                <span className="num text-xl font-extrabold">{money(total)}</span>
              </button>
            </div>
          )}
          {cartOpen && (
            <Sheet
              title={t.sell.order}
              onClose={() => setCartOpen(false)}
              footer={itemCount > 0 ? <CartTotals state={state} onCharge={charge} /> : undefined}
            >
              <CartLines state={state} set={set} />
            </Sheet>
          )}
        </>
      )}

      {payOpen && (
        <PaySheet
          state={state}
          set={set}
          onClose={() => setPayOpen(false)}
          onFinished={() => setCartOpen(false)}
        />
      )}
    </div>
  );
}
