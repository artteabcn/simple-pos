import type { ReactNode } from "react";
import { Bookmark, Minus, Plus, Printer, ShoppingBag, Trash2, X } from "lucide-react";
import { liveCtx } from "../../lib/pos/store";
import {
  clearOrder, itemName, orderTotals, patchOrder, previewBill, restoreLine, restoreOrder,
  saveForLater, setLineQty,
} from "../../lib/pos/state";
import type { CartLine, PosState } from "../../lib/validations/pos";
import { useI18n } from "./i18n";
import { usePrint } from "./Print";
import { Button, EmptyState, Field, Segmented, useToast } from "./ui";

type Props = {
  state: PosState;
  set: (fn: (s: PosState) => PosState) => void;
};

/** The order itself: name, items with steppers, discount/service, and the secondary actions. */
export function CartLines({ state, set }: Props): ReactNode {
  const { t, fmt, locale, money } = useI18n();
  const toast = useToast();
  const { print } = usePrint();
  const { order } = state;

  if (order.lines.length === 0) {
    return <EmptyState icon={<ShoppingBag size={30} strokeWidth={1.75} aria-hidden="true" />} title={t.sell.emptyOrder} />;
  }

  const removeLine = (line: CartLine): void => {
    const index = order.lines.findIndex((l) => l.itemId === line.itemId);
    set((s) => setLineQty(s, line.itemId, 0));
    toast.show(fmt(t.sell.removed, { name: itemName(line, locale) }), {
      label: t.common.undo,
      run: () => set((s) => restoreLine(s, line, index)),
    });
  };

  const clear = (): void => {
    const snapshot = order;
    set((s) => clearOrder(s));
    toast.show(t.sell.cleared, { label: t.common.undo, run: () => set((s) => restoreOrder(s, snapshot)) });
  };

  const keep = (): void => {
    set((s) => saveForLater(s, liveCtx()));
    toast.show(t.sell.kept);
  };

  return (
    <div className="flex flex-col gap-5">
      <Field
        label={t.sell.billName}
        placeholder={t.sell.billNameHint}
        value={order.label}
        maxLength={60}
        onChange={(v) => set((s) => patchOrder(s, { label: v }))}
        optionalText={t.common.optional}
      />

      <ul className="flex flex-col divide-y divide-stone-200 dark:divide-stone-800">
        {order.lines.map((l) => (
          <li key={l.itemId} className="flex flex-col gap-2 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-base font-semibold text-stone-900 dark:text-stone-50">{itemName(l, locale)}</p>
              <p className="num shrink-0 text-base font-bold text-stone-900 dark:text-stone-50">{money(l.price * l.qty)}</p>
              <button
                type="button"
                aria-label={`${t.sell.removeLine}: ${itemName(l, locale)}`}
                onClick={() => removeLine(l)}
                className="-mt-1 -mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="-mt-1 flex items-center justify-between">
              <p className="num text-sm text-stone-600 dark:text-stone-400">{money(l.price)}</p>
              <div className="flex items-center rounded-xl bg-stone-100 dark:bg-stone-800">
                <button
                  type="button"
                  aria-label={t.sell.decrease}
                  onClick={() => (l.qty <= 1 ? removeLine(l) : set((s) => setLineQty(s, l.itemId, l.qty - 1)))}
                  className="flex size-12 cursor-pointer items-center justify-center rounded-xl text-stone-800 active:scale-95 dark:text-stone-100"
                >
                  <Minus size={20} aria-hidden="true" />
                </button>
                <span className="num min-w-10 text-center text-lg font-bold text-stone-900 dark:text-stone-50" aria-live="polite">{l.qty}</span>
                <button
                  type="button"
                  aria-label={t.sell.increase}
                  onClick={() => set((s) => setLineQty(s, l.itemId, l.qty + 1))}
                  className="flex size-12 cursor-pointer items-center justify-center rounded-xl text-stone-800 active:scale-95 dark:text-stone-100"
                >
                  <Plus size={20} aria-hidden="true" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">{t.sell.discount}</p>
          <Segmented
            label={t.sell.discount}
            value={order.discountPct}
            onChange={(v) => set((s) => patchOrder(s, { discountPct: v }))}
            options={[{ value: 0, label: t.sell.none }, { value: 5, label: "5%" }, { value: 10, label: "10%" }]}
          />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">{t.sell.service}</p>
          <Segmented
            label={t.sell.service}
            value={order.servicePct}
            onChange={(v) => set((s) => patchOrder(s, { servicePct: v }))}
            options={[{ value: 0, label: t.sell.none }, { value: 10, label: "10%" }]}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button onClick={keep} className="flex-col gap-1 py-2 text-sm"><Bookmark size={20} aria-hidden="true" />{t.sell.keepForLater}</Button>
        <Button onClick={() => print({ kind: "bill", bill: previewBill(state, liveCtx()), paid: false })} className="flex-col gap-1 py-2 text-sm">
          <Printer size={20} aria-hidden="true" />{t.sell.printBill}
        </Button>
        <Button variant="danger" onClick={clear} className="flex-col gap-1 py-2 text-sm"><Trash2 size={20} aria-hidden="true" />{t.sell.clearOrder}</Button>
      </div>
    </div>
  );
}

/** Totals and the Charge button. On phones this is pinned to the bottom of the order sheet. */
export function CartTotals({ state, onCharge }: { state: PosState; onCharge: () => void }): ReactNode {
  const { t, fmt, money } = useI18n();
  const { order } = state;
  const totals = orderTotals(state);
  const vat = state.shop?.profile.vatMode;
  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col gap-0.5 text-base">
        {(totals.discount > 0 || totals.service > 0) && <Line label={t.sell.subtotal} value={money(totals.subtotal)} />}
        {totals.discount > 0 && <Line label={`${t.sell.discount} ${order.discountPct}%`} value={`-${money(totals.discount)}`} />}
        {totals.service > 0 && <Line label={`${t.sell.service} ${order.servicePct}%`} value={money(totals.service)} />}
        {vat === "inclusive" && <Line label={t.sell.vatIncluded} value={money(totals.vat)} muted />}
        {vat === "exclusive" && <Line label={t.sell.vatAdded} value={money(totals.vat)} />}
        <div className="flex items-baseline justify-between">
          <dt className="text-lg font-bold text-stone-900 dark:text-stone-50">{t.sell.total}</dt>
          <dd className="num text-3xl font-extrabold text-stone-900 dark:text-stone-50">{money(totals.total)}</dd>
        </div>
      </dl>
      <Button size="lg" variant="primary" block disabled={order.lines.length === 0} onClick={onCharge}>
        {fmt(t.sell.charge, { amount: money(totals.total) })}
      </Button>
    </div>
  );
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }): ReactNode {
  return (
    <div className={muted ? "flex justify-between text-sm text-stone-600 dark:text-stone-400" : "flex justify-between text-stone-800 dark:text-stone-200"}>
      <dt>{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}
