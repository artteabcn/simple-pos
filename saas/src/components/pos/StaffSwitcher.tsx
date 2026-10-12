import { useState, type ReactNode } from "react";
import { User } from "lucide-react";
import { clsx } from "clsx";
import { getStaffSession, setStaffSession, unlockStaff, useStaffSession } from "../../lib/pos/staff-session";
import type { Link } from "../../lib/pos/sync-client";
import { useI18n } from "./i18n";
import { Button, Field, Sheet } from "./ui";

/**
 * "Who's selling?" A small, optional identity switcher — not a lockout. Staff can always just tap Skip
 * and keep selling; this only tags the bills that follow with whoever last signed in on this device.
 */
export function StaffSwitcher({ link }: { link: Link | null }): ReactNode {
  const { t } = useI18n();
  const session = useStaffSession();
  const [open, setOpen] = useState(false);
  if (!link) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx(
          "flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-semibold touch-manipulation",
          session
            ? "border-brand/30 bg-brand/10 text-brand dark:text-teal-300"
            : "border-stone-300 text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800",
        )}
      >
        <User size={16} aria-hidden="true" />
        <span className="max-w-24 truncate">{session ? session.staffName : t.staff.whoSelling}</span>
      </button>
      {open && <StaffSheet link={link} onClose={() => setOpen(false)} />}
    </>
  );
}

function StaffSheet({ link, onClose }: { link: Link; onClose: () => void }): ReactNode {
  const { t, fmt } = useI18n();
  const session = getStaffSession();
  const [mode, setMode] = useState<"view" | "pin">(session ? "view" : "pin");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async (): Promise<void> => {
    if (pin.length < 4) return setError(t.staff.invalid);
    setBusy(true);
    const r = await unlockStaff(link, pin);
    setBusy(false);
    if (r.ok) {
      onClose();
      return;
    }
    setPin("");
    if (r.reason === "locked") setError(fmt(t.staff.locked, { m: Math.max(1, Math.ceil((r.retryAfterSec ?? 900) / 60)) }));
    else if (r.reason === "wrong") setError(t.staff.wrong);
    else setError(t.staff.error);
  };

  if (mode === "view" && session) {
    return (
      <Sheet title={fmt(t.staff.signedInAs, { name: session.staffName })} onClose={onClose}>
        <div className="flex flex-col gap-3">
          <Button size="lg" variant="primary" block onClick={() => setMode("pin")}>{t.staff.switchUser}</Button>
          <Button size="lg" block onClick={() => { setStaffSession(null); onClose(); }}>{t.staff.signOut}</Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={t.staff.gateTitle}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          <Button size="lg" variant="primary" block disabled={busy || pin.length < 4} onClick={() => void submit()}>{t.staff.unlock}</Button>
          <Button block onClick={onClose}>{t.staff.skip}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <p className="text-base text-stone-600 dark:text-stone-400">{t.staff.gateBody}</p>
        <Field
          label={t.staff.pin}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          error={error}
          onChange={(v) => { setPin(v.replace(/\D/g, "").slice(0, 6)); setError(undefined); }}
          className="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.5em]"
          autoFocus
        />
      </div>
    </Sheet>
  );
}
