import { useEffect, useState, type ReactNode } from "react";
import { Plus, User } from "lucide-react";
import { createStaff, deactivateStaff, listStaff, renameStaff, setStaffPin, type StaffInfo, type StaffWriteOutcome } from "../../lib/pos/staff-client";
import type { Link } from "../../lib/pos/sync-client";
import { useI18n } from "./i18n";
import { Button, Field, Sheet, useToast } from "./ui";

const digits = (v: string): string => v.replace(/\D/g, "").slice(0, 6);

function errorText(t: ReturnType<typeof useI18n>["t"], reason: Extract<StaffWriteOutcome, { ok: false }>["reason"]): string {
  if (reason === "duplicate") return t.staff.duplicate;
  if (reason === "invalid") return t.staff.invalid;
  if (reason === "limit") return t.staff.limit;
  return t.staff.error;
}

/** Add, rename, re-PIN or remove staff. Manager-gated by the caller (same as PinCard and DevicesCard). */
export function StaffCard({ link }: { link: Link }): ReactNode {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<StaffInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StaffInfo | null>(null);
  const [removing, setRemoving] = useState<StaffInfo | null>(null);

  const reload = (): void => {
    void listStaff(link).then((r) => {
      if (r) setRows(r);
      else setFailed(true);
    });
  };
  useEffect(reload, [link]);

  const doRemove = async (): Promise<void> => {
    if (!removing) return;
    const r = await deactivateStaff(link, removing.id);
    setRemoving(null);
    if (r.ok) {
      setRows((cur) => cur?.filter((s) => s.id !== removing.id) ?? cur);
      toast.show(t.staff.removed);
    } else {
      toast.show(errorText(t, r.reason));
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <div>
        <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50">{t.staff.title}</h2>
        <p className="text-base text-stone-600 dark:text-stone-400">{t.staff.body}</p>
      </div>

      {rows === null ? (
        <p className="text-base text-stone-600 dark:text-stone-400">{failed ? t.staff.error : t.common.loading}</p>
      ) : rows.length === 0 ? (
        <p className="text-base text-stone-600 dark:text-stone-400">{t.staff.empty}</p>
      ) : (
        <ul className="divide-y divide-stone-200 dark:divide-stone-800">
          {rows.map((s) => (
            <li key={s.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
              <button type="button" onClick={() => setEditing(s)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand dark:text-teal-300">
                  <User size={20} aria-hidden="true" />
                </span>
                <span className="truncate text-base font-semibold text-stone-900 dark:text-stone-50">{s.name}</span>
              </button>
              <Button variant="danger" onClick={() => setRemoving(s)}>{t.staff.deactivate}</Button>
            </li>
          ))}
        </ul>
      )}

      <Button block onClick={() => setAdding(true)}>
        <Plus size={20} aria-hidden="true" />{t.staff.add}
      </Button>

      {adding && (
        <StaffForm
          title={t.staff.add}
          onClose={() => setAdding(false)}
          onSave={async (name, pin) => {
            const r = await createStaff(link, name, pin);
            if (r.ok) {
              setAdding(false);
              toast.show(t.staff.added);
              reload();
            }
            return r;
          }}
        />
      )}

      {editing && (
        <StaffForm
          title={editing.name}
          initialName={editing.name}
          pinOptional
          onClose={() => setEditing(null)}
          onSave={async (name, pin) => {
            const r1 = name !== editing.name ? await renameStaff(link, editing.id, name) : { ok: true as const };
            const r2 = pin ? await setStaffPin(link, editing.id, pin) : { ok: true as const };
            const r = !r1.ok ? r1 : r2;
            if (r.ok) {
              setEditing(null);
              toast.show(t.staff.updated);
              reload();
            }
            return r;
          }}
        />
      )}

      {removing && (
        <Sheet
          title={fmt(t.staff.deactivateConfirmTitle, { name: removing.name })}
          onClose={() => setRemoving(null)}
          footer={
            <div className="flex flex-col gap-2">
              <Button variant="danger" size="lg" block onClick={() => void doRemove()}>{t.staff.deactivate}</Button>
              <Button block onClick={() => setRemoving(null)}>{t.common.cancel}</Button>
            </div>
          }
        >
          <p className="text-base text-stone-700 dark:text-stone-300">{t.staff.deactivateConfirmBody}</p>
        </Sheet>
      )}
    </section>
  );
}

function StaffForm(props: {
  title: string;
  initialName?: string;
  pinOptional?: boolean;
  onClose: () => void;
  onSave: (name: string, pin: string) => Promise<StaffWriteOutcome>;
}): ReactNode {
  const { t } = useI18n();
  const [name, setName] = useState(props.initialName ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    if (!name.trim()) return setError(t.common.required);
    if (!props.pinOptional || pin) {
      if (pin.length < 4) return setError(t.staff.invalid);
    }
    setBusy(true);
    const r = await props.onSave(name.trim(), pin);
    setBusy(false);
    if (!r.ok) setError(errorText(t, r.reason));
  };

  return (
    <Sheet
      title={props.title}
      onClose={props.onClose}
      footer={<Button variant="primary" size="lg" block disabled={busy} onClick={() => void save()}>{t.staff.save}</Button>}
    >
      <div className="flex flex-col gap-4 pt-1">
        <Field label={t.staff.name} value={name} onChange={setName} autoFocus maxLength={60} />
        <Field
          label={props.pinOptional ? t.staff.changePin : t.staff.pin}
          optionalText={props.pinOptional ? t.common.optional : undefined}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          error={error}
          onChange={(v) => { setPin(digits(v)); setError(undefined); }}
          className="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.5em]"
        />
      </div>
    </Sheet>
  );
}
