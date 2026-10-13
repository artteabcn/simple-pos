import { useEffect, useState, type ReactNode } from "react";
import { LogOut, Smartphone } from "lucide-react";
import { type DeviceInfo, listDevices, revokeDevice } from "../../lib/pos/devices-client";
import type { Link } from "../../lib/pos/sync-client";
import { useI18n } from "./i18n";
import { Button, Sheet, useToast } from "./ui";

/** Lets the owner see every phone/tablet linked to this shop and revoke a lost one. Manager-gated by the caller. */
export function DevicesCard({ link }: { link: Link }): ReactNode {
  const { t, fmt, date } = useI18n();
  const toast = useToast();
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [toRevoke, setToRevoke] = useState<DeviceInfo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void listDevices(link).then((rows) => {
      if (!live) return;
      if (rows) setDevices(rows);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [link]);

  const confirmRevoke = async (): Promise<void> => {
    if (!toRevoke) return;
    setBusy(true);
    const r = await revokeDevice(link, toRevoke.id);
    setBusy(false);
    setToRevoke(null);
    if (r.ok) {
      setDevices((cur) => cur?.filter((d) => d.id !== toRevoke.id) ?? cur);
      toast.show(t.devices.revokeConfirmed);
    } else {
      toast.show(t.devices.revokeFailed);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <div>
        <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50">{t.devices.title}</h2>
        <p className="text-base text-stone-600 dark:text-stone-400">{t.devices.body}</p>
      </div>

      {devices === null ? (
        <p className="text-base text-stone-600 dark:text-stone-400">{failed ? t.devices.loadFailed : t.common.loading}</p>
      ) : devices.length === 0 ? (
        <p className="text-base text-stone-600 dark:text-stone-400">{t.devices.empty}</p>
      ) : (
        <ul className="divide-y divide-stone-200 dark:divide-stone-800">
          {devices.map((d) => (
            <li key={d.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand dark:text-teal-300">
                  <Smartphone size={20} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-stone-900 dark:text-stone-50">
                    {d.name || t.devices.title}
                    {d.isCurrent && <span className="ml-2 text-sm font-normal text-stone-500 dark:text-stone-400">({t.devices.current})</span>}
                  </p>
                  <p className="text-sm text-stone-600 dark:text-stone-400">
                    {d.lastSeenAt ? fmt(t.devices.lastSeen, { when: date(d.lastSeenAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) }) : t.devices.neverUsed}
                  </p>
                </div>
              </div>
              {!d.isCurrent && (
                <Button variant="danger" onClick={() => setToRevoke(d)}>
                  <LogOut size={18} aria-hidden="true" />{t.devices.revoke}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {toRevoke && (
        <Sheet
          title={fmt(t.devices.revokeConfirmTitle, { name: toRevoke.name || t.devices.title })}
          onClose={() => setToRevoke(null)}
          footer={
            <div className="flex flex-col gap-2">
              <Button variant="danger" size="lg" block disabled={busy} onClick={() => void confirmRevoke()}>{t.devices.revoke}</Button>
              <Button block disabled={busy} onClick={() => setToRevoke(null)}>{t.common.cancel}</Button>
            </div>
          }
        >
          <p className="text-base text-stone-700 dark:text-stone-300">{t.devices.revokeConfirmBody}</p>
        </Sheet>
      )}
    </section>
  );
}
