import { useState, type ReactNode } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { savePin, setManager, unlockManager } from "../../lib/pos/manager";
import { getSyncEngine, type Link } from "../../lib/pos/sync-client";
import { useI18n } from "./i18n";
import { Button, Field, useToast } from "./ui";

/** Set or change the manager PIN, and lock My shop again. Only offered on a till that is linked to an account. */
export function PinCard({ link, pinSet }: { link: Link; pinSet: boolean }): ReactNode {
  const { t } = useI18n();
  const toast = useToast();
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const digits = (v: string): string => v.replace(/\D/g, "").slice(0, 6);

  const save = async (): Promise<void> => {
    if (pin.length < 4) return setError(t.pin.invalid);
    if (pin !== again) return setError(t.pin.mismatch);
    setBusy(true);
    const r = await savePin(link, pin);
    if (r.ok) {
      await unlockManager(link, pin); // the person who just chose the PIN should not be locked out at once
      void getSyncEngine().syncNow();
      setPin("");
      setAgain("");
      toast.show(t.pin.saved);
    } else setError(r.reason === "invalid" ? t.pin.invalid : t.pin.error);
    setBusy(false);
  };

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand dark:text-teal-300">
          {pinSet ? <ShieldCheck size={24} aria-hidden="true" /> : <Lock size={24} aria-hidden="true" />}
        </span>
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50">{pinSet ? t.pin.changeTitle : t.pin.setupTitle}</h2>
          <p className="text-base text-stone-600 dark:text-stone-400">{pinSet ? t.pin.on : t.pin.setupBody}</p>
        </div>
      </div>
      <Field label={t.pin.newPin} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(v) => { setPin(digits(v)); setError(undefined); }} />
      <Field label={t.pin.confirmPin} type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={again} error={error} onChange={(v) => { setAgain(digits(v)); setError(undefined); }} />
      <Button variant="primary" size="lg" block disabled={busy || pin.length < 4} onClick={() => void save()}>{t.pin.save}</Button>
      {pinSet && (
        <Button block onClick={() => setManager(null)}>
          <Lock size={20} aria-hidden="true" />{t.pin.lock}
        </Button>
      )}
    </section>
  );
}
