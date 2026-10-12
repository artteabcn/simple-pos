import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { unlockManager } from "../../lib/pos/manager";
import { getSyncEngine, type Link } from "../../lib/pos/sync-client";
import { useI18n } from "./i18n";
import { Button, Field } from "./ui";

/** Shown instead of My shop when the shop has a manager PIN and it has not been entered on this device. */
export function PinGate({ link }: { link: Link }): ReactNode {
  const { t, fmt } = useI18n();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async (): Promise<void> => {
    if (pin.length < 4) return setError(t.pin.invalid);
    setBusy(true);
    setError(undefined);
    const r = await unlockManager(link, pin);
    setBusy(false);
    if (r.ok) {
      setPin("");
      void getSyncEngine().syncNow(); // push any menu change that was waiting for the PIN
      return;
    }
    setPin("");
    if (r.reason === "wrong") setError(fmt(t.pin.wrong, { n: r.attemptsLeft }));
    else if (r.reason === "locked") setError(fmt(t.pin.locked, { m: Math.max(1, Math.ceil(r.retryAfterSec / 60)) }));
    else setError(t.pin.error);
  };

  return (
    <section aria-labelledby="pin-h" className="mx-auto flex max-w-sm flex-col gap-5 py-10 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand/10 text-brand dark:text-teal-300">
        <Lock size={30} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <div>
        <h1 id="pin-h" className="text-2xl font-extrabold text-stone-900 dark:text-stone-50">{t.pin.gateTitle}</h1>
        <p className="mt-1 text-base text-stone-600 dark:text-stone-400">{t.pin.gateBody}</p>
      </div>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field
          label={t.pin.label}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          error={error}
          onChange={(v) => {
            setPin(v.replace(/\D/g, "").slice(0, 6));
            setError(undefined);
          }}
          className="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.5em]"
          autoFocus
        />
        <Button type="submit" size="lg" variant="primary" block disabled={busy || pin.length < 4}>{t.pin.unlock}</Button>
      </form>
    </section>
  );
}
