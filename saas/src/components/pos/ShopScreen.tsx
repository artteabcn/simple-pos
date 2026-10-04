import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileDown, FileUp, Plus } from "lucide-react";
import { CSV_TEMPLATE, decodeCsvBytes, menuFromCsv } from "../../lib/pos/csv";
import { newId } from "../../lib/pos/store";
import { categoriesOf, itemName, patchProfile, removeItem, restoreItem, upsertItem } from "../../lib/pos/state";
import type { PosState } from "../../lib/validations/pos";
import type { MenuItem, ShopProfile } from "../../lib/validations/shop";
import { VatChoice } from "./Choices";
import { useI18n } from "./i18n";
import { Button, Field, Sheet, useToast } from "./ui";

type Props = {
  state: PosState;
  set: (fn: (s: PosState) => PosState) => void;
};

const NEW_GROUP = "__new__";

/** A text field that keeps what you type and saves when you leave it (no Save button to forget). */
function SavedField(props: {
  label: string;
  value: string;
  hint?: string;
  required?: boolean;
  inputMode?: "text" | "tel" | "numeric";
  transform?: (v: string) => string;
  validate?: (v: string) => string | undefined;
  onCommit: (v: string) => void;
}): ReactNode {
  const { t } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState(props.value);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => setDraft(props.value), [props.value]);

  const commit = (): void => {
    const v = draft.trim();
    const err = props.required && !v ? t.common.required : props.validate?.(v);
    setError(err);
    if (err || v === props.value) return;
    props.onCommit(v);
    toast.show(t.shop.saved);
  };

  return (
    <Field
      label={props.label}
      hint={props.hint}
      error={error}
      value={draft}
      inputMode={props.inputMode}
      onChange={(v) => setDraft(props.transform ? props.transform(v) : v)}
      onBlur={commit}
    />
  );
}

export function ShopScreen({ state, set }: Props): ReactNode {
  const { t, fmt, locale, money } = useI18n();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const shop = state.shop;
  if (!shop) return null;
  const p = shop.profile;
  const patch = (x: Partial<ShopProfile>): void => set((s) => patchProfile(s, x));
  const cats = categoriesOf(shop.menu);
  const groups = [...cats, ""].map((c) => ({ c, items: shop.menu.filter((m) => (m.category ?? "") === c) })).filter((g) => g.items.length);

  const importFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const text = decodeCsvBytes(await file.arrayBuffer());
    const r = menuFromCsv(text, () => `it_${newId()}`);
    if (!r.ok) {
      toast.show(t.shop.importFail);
      return;
    }
    set((s) => (s.shop ? { ...s, shop: { ...s.shop, menu: [...s.shop.menu, ...r.items].slice(0, 1000) } } : s));
    toast.show(fmt(t.shop.importDone, { n: r.items.length }));
  };

  const downloadTemplate = (): void => {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "menu-example.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-extrabold text-stone-900 dark:text-stone-50">{t.shop.title}</h1>

      <Card title={t.shop.details}>
        <SavedField label={t.shop.name} value={p.name} required onCommit={(v) => patch({ name: v })} />
        <SavedField label={t.shop.address} value={p.address} onCommit={(v) => patch({ address: v })} />
        <SavedField label={t.shop.phone} value={p.tel} inputMode="tel" onCommit={(v) => patch({ tel: v })} />
        <SavedField label={t.shop.taxId} value={p.taxId} onCommit={(v) => patch({ taxId: v })} />
      </Card>

      <Card title={t.shop.payments}>
        <SavedField
          label={t.shop.promptpay}
          hint={t.shop.promptpayHint}
          value={p.promptpay}
          inputMode="numeric"
          transform={(v) => v.replace(/\D/g, "").slice(0, 13)}
          validate={(v) => (v === "" || v.length === 10 || v.length === 13 ? undefined : t.shop.promptpayInvalid)}
          onCommit={(v) => patch({ promptpay: v })}
        />
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">{t.shop.vat}</p>
          <VatChoice value={p.vatMode} onChange={(v) => { patch({ vatMode: v }); toast.show(t.shop.saved); }} />
        </div>
      </Card>

      <Card title={t.shop.menu}>
        <Button variant="primary" size="lg" block onClick={() => setEditing("new")}>
          <Plus size={22} aria-hidden="true" />{t.shop.addItem}
        </Button>
        {groups.length === 0 ? (
          <p className="py-4 text-center text-base text-stone-600 dark:text-stone-400">{t.shop.emptyMenu}</p>
        ) : (
          groups.map((g) => (
            <div key={g.c || "none"}>
              <h3 className="mb-1 text-sm font-bold text-stone-700 uppercase dark:text-stone-300">{g.c || t.shop.noCategory}</h3>
              <ul className="divide-y divide-stone-200 dark:divide-stone-800">
                {g.items.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(m)}
                      className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 py-2 text-left"
                    >
                      <span className="text-base font-semibold text-stone-900 dark:text-stone-50">{itemName(m, locale)}</span>
                      <span className="num text-base font-bold text-brand dark:text-teal-300">{money(m.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} />
          <Button onClick={() => fileRef.current?.click()}><FileUp size={20} aria-hidden="true" />{t.shop.importCsv}</Button>
          <Button onClick={downloadTemplate}><FileDown size={20} aria-hidden="true" />{t.shop.csvTemplate}</Button>
        </div>
      </Card>

      {editing && (
        <ItemSheet
          item={editing === "new" ? null : editing}
          cats={cats}
          onClose={() => setEditing(null)}
          onSave={(item) => { set((s) => upsertItem(s, item)); setEditing(null); toast.show(t.shop.saved); }}
          onDelete={(item) => {
            const index = shop.menu.findIndex((m) => m.id === item.id);
            set((s) => removeItem(s, item.id));
            setEditing(null);
            toast.show(fmt(t.shop.itemRemoved, { name: itemName(item, locale) }), { label: t.common.undo, run: () => set((s) => restoreItem(s, item, index)) });
          }}
        />
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50">{title}</h2>
      {children}
    </section>
  );
}

function ItemSheet(props: {
  item: MenuItem | null;
  cats: string[];
  onClose: () => void;
  onSave: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
}): ReactNode {
  const { t } = useI18n();
  const it = props.item;
  const [name, setName] = useState(it?.nameEN || it?.nameTH || "");
  const [nameTH, setNameTH] = useState(it && it.nameTH !== it.nameEN ? it.nameTH : "");
  const [price, setPrice] = useState(it ? String(it.price) : "");
  const [group, setGroup] = useState(it?.category && props.cats.includes(it.category) ? it.category : it?.category ? NEW_GROUP : "");
  const [newGroup, setNewGroup] = useState(it?.category && !props.cats.includes(it.category) ? it.category : "");
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});

  const save = (): void => {
    const p = Number(price.replace(/,/g, ""));
    const e: typeof errors = {};
    if (!name.trim()) e.name = t.common.required;
    if (price.trim() === "" || !Number.isFinite(p) || p < 0) e.price = t.common.required;
    setErrors(e);
    if (e.name || e.price) return;
    const category = (group === NEW_GROUP ? newGroup : group).trim();
    props.onSave({
      id: it?.id ?? `it_${newId()}`.slice(0, 40),
      nameEN: name.trim().slice(0, 120),
      nameTH: (nameTH.trim() || name.trim()).slice(0, 120),
      price: Math.min(p, 1_000_000),
      ...(category ? { category: category.slice(0, 60) } : {}),
    });
  };

  return (
    <Sheet
      title={it ? t.shop.editItem : t.shop.newItem}
      onClose={props.onClose}
      footer={
        <div className="flex flex-col gap-2">
          <Button size="lg" variant="primary" block onClick={save}>{t.common.save}</Button>
          {it && <Button variant="danger" block onClick={() => props.onDelete(it)}>{t.shop.deleteItem}</Button>}
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <Field label={t.shop.itemName} value={name} onChange={setName} error={errors.name} autoFocus maxLength={120} />
        <Field label={t.shop.itemNameTh} optionalText={t.common.optional} hint={t.shop.itemNameThHint} value={nameTH} onChange={setNameTH} maxLength={120} />
        <Field label={t.shop.price} value={price} onChange={(v) => setPrice(v.replace(/[^0-9.,]/g, ""))} inputMode="decimal" error={errors.price} />
        <div className="flex flex-col gap-2">
          <label htmlFor="grp" className="text-sm font-semibold text-stone-800 dark:text-stone-200">
            {t.shop.category} <span className="font-normal text-stone-500 dark:text-stone-400">({t.common.optional})</span>
          </label>
          <select
            id="grp"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
          >
            <option value="">{t.shop.noCategory}</option>
            {props.cats.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value={NEW_GROUP}>{t.shop.newGroup}</option>
          </select>
          {group === NEW_GROUP && (
            <Field label={t.shop.category} value={newGroup} onChange={setNewGroup} placeholder={t.shop.categoryHint} maxLength={60} />
          )}
        </div>
      </div>
    </Sheet>
  );
}
