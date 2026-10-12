import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import type { Locale } from "../../i18n/utils";
import { saveLink } from "../../lib/pos/sync-client";
import { I18nProvider, useI18n } from "../pos/i18n";
import { Button } from "../pos/ui";

export default function VerifyLogin({ locale }: { locale: Locale }): ReactNode {
  return (
    <I18nProvider locale={locale} currency="฿">
      <Verify />
    </I18nProvider>
  );
}

type Phase = "working" | "ok" | "bad";

function Verify(): ReactNode {
  const { t, locale } = useI18n();
  const [phase, setPhase] = useState<Phase>("working");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React runs effects twice in development; the link works only once
    started.current = true;
    // The token is in the part of the address after "#": it is never sent to any server until we post it ourselves.
    const token = new URLSearchParams(location.hash.replace(/^#/, "")).get("token");
    history.replaceState(null, "", location.pathname); // do not leave the token in the address bar or history
    if (!token) return setPhase("bad");
    void (async () => {
      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, deviceName: navigator.userAgent.slice(0, 60) }),
        });
        if (!res.ok) return setPhase("bad");
        const b = (await res.json()) as { slug: string; token: string; name: string };
        saveLink(localStorage, { slug: b.slug, token: b.token, name: b.name });
        setPhase("ok");
      } catch {
        setPhase("bad");
      }
    })();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      {phase === "working" && (
        <>
          <Loader2 size={44} className="animate-spin text-brand dark:text-teal-300" aria-hidden="true" />
          <h1 role="status" className="text-2xl font-extrabold text-stone-900 dark:text-stone-50">{t.login.working}</h1>
        </>
      )}
      {phase === "ok" && (
        <>
          <div className="animate-pop flex size-20 items-center justify-center rounded-full bg-brand text-white">
            <Check size={44} strokeWidth={3} aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-extrabold text-stone-900 dark:text-stone-50">{t.login.okTitle}</h1>
          <p className="text-base text-stone-600 dark:text-stone-400">{t.login.okBody}</p>
          <Button size="lg" variant="primary" block onClick={() => (window.location.href = `/${locale}/app/#sell`)}>{t.login.open}</Button>
        </>
      )}
      {phase === "bad" && (
        <>
          <h1 className="text-2xl font-extrabold text-stone-900 dark:text-stone-50">{t.login.badTitle}</h1>
          <p className="text-base text-stone-600 dark:text-stone-400">{t.login.badBody}</p>
          <Button size="lg" variant="primary" onClick={() => (window.location.href = `/${locale}/login/`)}>{t.login.newLink}</Button>
        </>
      )}
    </main>
  );
}
