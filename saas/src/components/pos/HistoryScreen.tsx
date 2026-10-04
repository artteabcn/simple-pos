import { useMemo, useState, type ReactNode } from "react";
import { Download, Printer, Receipt } from "lucide-react";
import { liveCtx } from "../../lib/pos/store";
import { billsToCsv, deleteRecord, groupByDay, inRange, itemName, liveBills, restoreRecord, type HistoryRange } from "../../lib/pos/state";
import type { Bill, PosState } from "../../lib/validations/pos";
import { useI18n } from "./i18n";
import { usePrint } from "./Print";
import { Button, EmptyState, Segmented, Sheet, useToast } from "./ui";

type Props = {
  state: PosState;
  set: (fn: (s: PosState) => PosState) => void;
};

export function HistoryScreen({ state, set }: Props): ReactNode {
  const { t, locale, money, date, count } = useI18n();
  const { print } = usePrint();
  const [range, setRange] = useState<HistoryRange>("today");
  const [open, setOpen] = useState<Bill | null>(null);

  const bills = useMemo(() => {
    const now = new Date();
    return liveBills(state.paid)
      .filter((b) => inRange(b.paidAt ?? b.updatedAt, range, now))
      .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
  }, [state.paid, range]);
  const groups = useMemo(() => groupByDay(bills), [bills]);
  const takings = bills.reduce((s, b) => s + b.total, 0);
  const rangeTitle = { today: t.history.today, week: t.history.week, month: t.history.month, all: t.history.last30 }[range];

  const download = (): void => {
    const blob = new Blob([billsToCsv(bills, locale)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    a.href = url;
    a.download = `sales-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-labelledby="hist-h" className="mx-auto max-w-2xl">
      <h1 id="hist-h" className="mb-4 text-2xl font-extrabold text-stone-900 dark:text-stone-50">{t.history.title}</h1>
      <Segmented<HistoryRange>
        wrap
        label={t.history.title}
        value={range}
        onChange={setRange}
        options={[
          { value: "today", label: t.history.today },
          { value: "week", label: t.history.week },
          { value: "month", label: t.history.month },
          { value: "all", label: t.history.last30 },
        ]}
      />

      <div className="mt-4 rounded-2xl bg-brand p-5 text-white">
        <p className="text-sm font-semibold opacity-90">{t.history.total} · {rangeTitle}</p>
        <p className="num text-4xl font-extrabold">{money(takings)}</p>
        <p className="text-sm opacity-90">{count("bill", bills.length)}</p>
      </div>

      {bills.length === 0 ? (
        <EmptyState icon={<Receipt size={30} strokeWidth={1.75} aria-hidden="true" />} title={t.history.none} body={t.history.noneBody} />
      ) : (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button onClick={download}><Download size={20} aria-hidden="true" />{t.history.exportCsv}</Button>
            <Button onClick={() => state.shop && print({ kind: "summary", bills, title: rangeTitle })}>
              <Printer size={20} aria-hidden="true" />{t.history.printSummary}
            </Button>
          </div>
          <div className="mt-4 flex flex-col gap-5">
            {groups.map((g) => (
              <div key={g.key}>
                <div className="mb-2 flex items-baseline justify-between border-b border-stone-200 pb-1 dark:border-stone-800">
                  <h2 className="text-sm font-bold text-stone-700 dark:text-stone-300">
                    {date(g.date.toISOString(), { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  </h2>
                  <p className="num text-sm font-bold text-stone-900 dark:text-stone-50">{money(g.total)}</p>
                </div>
                <ul className="flex flex-col gap-2">
                  {g.bills.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => setOpen(b)}
                        className="flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-2 text-left touch-manipulation active:scale-[0.99] dark:border-stone-800 dark:bg-stone-900"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-bold text-stone-900 dark:text-stone-50">{b.label}</p>
                          <p className="text-sm text-stone-600 dark:text-stone-400">
                            {[b.label === date(b.paidAt ?? b.updatedAt) ? "" : date(b.paidAt ?? b.updatedAt), b.method ? t.pay[b.method] : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <p className="num text-lg font-extrabold text-stone-900 dark:text-stone-50">{money(b.total)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      {open && (
        <BillSheet
          bill={open}
          onClose={() => setOpen(null)}
          onPrint={() => print({ kind: "bill", bill: open, paid: true })}
          onDelete={() => {
            const b = open;
            set((s) => deleteRecord(s, "paid", b.id, liveCtx()));
            setOpen(null);
          }}
          onUndo={(b) => set((s) => restoreRecord(s, "paid", b, liveCtx()))}
        />
      )}
    </section>
  );
}

function BillSheet(props: {
  bill: Bill;
  onClose: () => void;
  onPrint: () => void;
  onDelete: () => void;
  onUndo: (b: Bill) => void;
}): ReactNode {
  const { t, locale, money, date } = useI18n();
  const toast = useToast();
  const b = props.bill;
  const change = b.method === "cash" && b.received !== undefined ? Math.max(0, b.received - b.total) : 0;

  return (
    <Sheet
      title={b.label}
      onClose={props.onClose}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" onClick={props.onPrint}><Printer size={20} aria-hidden="true" />{t.pay.printReceipt}</Button>
          <Button
            size="lg"
            variant="danger"
            onClick={() => {
              props.onDelete();
              toast.show(t.history.deleted, { label: t.common.undo, run: () => props.onUndo(b) });
            }}
          >
            {t.history.deleteBill}
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-stone-600 dark:text-stone-400">
        {date(b.paidAt ?? b.updatedAt, { dateStyle: "medium", timeStyle: "short" })}
        {b.method ? ` · ${t.history.paidWith} ${t.pay[b.method]}` : ""}
      </p>
      <ul className="divide-y divide-stone-200 dark:divide-stone-800">
        {b.lines.map((l) => (
          <li key={l.itemId} className="flex items-baseline justify-between gap-3 py-2">
            <span className="text-base text-stone-900 dark:text-stone-50">{l.qty} × {itemName(l, locale)}</span>
            <span className="num text-base font-semibold text-stone-900 dark:text-stone-50">{money(l.price * l.qty)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 flex flex-col gap-1 border-t border-stone-200 pt-3 text-base dark:border-stone-800">
        {b.discount > 0 && <Row l={`${t.sell.discount} ${b.discountPct}%`} r={`-${money(b.discount)}`} />}
        {b.service > 0 && <Row l={`${t.sell.service} ${b.servicePct}%`} r={money(b.service)} />}
        <div className="flex items-baseline justify-between">
          <dt className="text-lg font-bold">{t.sell.total}</dt>
          <dd className="num text-2xl font-extrabold">{money(b.total)}</dd>
        </div>
        {b.method === "cash" && b.received !== undefined && (
          <>
            <Row l={t.receipt.cashReceived} r={money(b.received)} />
            <Row l={t.receipt.change} r={money(change)} />
          </>
        )}
      </dl>
    </Sheet>
  );
}

function Row({ l, r }: { l: string; r: string }): ReactNode {
  return (
    <div className="flex justify-between text-stone-700 dark:text-stone-300">
      <dt>{l}</dt>
      <dd className="num">{r}</dd>
    </div>
  );
}
