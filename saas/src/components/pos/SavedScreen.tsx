import type { ReactNode } from "react";
import { Bookmark, Trash2 } from "lucide-react";
import { liveCtx } from "../../lib/pos/store";
import { deleteRecord, liveBills, openSaved, restoreRecord } from "../../lib/pos/state";
import type { Bill, PosState } from "../../lib/validations/pos";
import { useI18n } from "./i18n";
import { Button, EmptyState, useToast } from "./ui";

type Props = {
  state: PosState;
  set: (fn: (s: PosState) => PosState) => void;
  goSell: () => void;
};

export function SavedScreen({ state, set, goSell }: Props): ReactNode {
  const { t, money, date, count } = useI18n();
  const toast = useToast();
  const bills = liveBills(state.saved);

  const open = (b: Bill): void => {
    set((s) => openSaved(s, b.id, liveCtx()));
    goSell();
  };

  const remove = (b: Bill): void => {
    set((s) => deleteRecord(s, "saved", b.id, liveCtx()));
    toast.show(t.saved.deleted, { label: t.common.undo, run: () => set((s) => restoreRecord(s, "saved", b, liveCtx())) });
  };

  return (
    <section aria-labelledby="saved-h" className="mx-auto max-w-2xl">
      <h1 id="saved-h" className="mb-4 text-2xl font-extrabold text-stone-900 dark:text-stone-50">{t.saved.title}</h1>
      {bills.length === 0 ? (
        <EmptyState icon={<Bookmark size={30} strokeWidth={1.75} aria-hidden="true" />} title={t.saved.empty} body={t.saved.emptyBody} />
      ) : (
        <ul className="flex flex-col gap-3">
          {bills.map((b) => (
            <li key={b.id} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold text-stone-900 dark:text-stone-50">{b.label}</p>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  {date(b.savedAt ?? b.updatedAt)} · {count("item", b.lines.reduce((n, l) => n + l.qty, 0))}
                </p>
              </div>
              <p className="num text-lg font-extrabold text-stone-900 dark:text-stone-50">{money(b.total)}</p>
              <Button variant="primary" onClick={() => open(b)}>{t.saved.open}</Button>
              <button
                type="button"
                aria-label={`${t.common.delete}: ${b.label}`}
                onClick={() => remove(b)}
                className="flex size-12 cursor-pointer items-center justify-center rounded-xl text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950"
              >
                <Trash2 size={20} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
