import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import type { Locale } from "../../i18n/utils";
import { saveLink } from "../../lib/pos/sync-client";
import { I18nProvider, useI18n } from "../pos/i18n";
import { Button } from "../pos/ui";

export default function WelcomeClaim({ locale }: { locale: Locale }): ReactNode {
  return (
    <I18nProvider locale={locale} currency="฿">
      <Claim />
    </I18nProvider>
  );
}

type Phase = "working" | "ready" | "slow" | "claimed" | "missing";

const POLL_MS = 2000;
const GIVE_UP_AFTER = 30; // about a minute

function Claim(): ReactNode {
  const { t, locale } = useI18n();
  const [phase, setPhase] = useState<Phase>("working");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React runs effects twice in development; claim once
    started.current = true;
    const sessionId = new URLSearchParams(location.search).get("session_id");
    if (!sessionId) {
      setPhase("missing");
      return;
    }
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < GIVE_UP_AFTER && !cancelled; i++) {
        try {
          const res = await fetch("/api/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
          if (res.status === 200) {
            const b = (await res.json()) as { slug: string; token: string; name: string };
            saveLink(localStorage, { slug: b.slug, token: b.token, name: b.name });
            setPhase("ready");
            return;
          }
          if (res.status === 409) return setPhase("claimed");
          if (res.status === 400) return setPhase("missing");
          // 202: the payment is not recorded yet, keep waiting
        } catch {
          /* network blip: keep trying */
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      if (!cancelled) setPhase("slow");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      {phase === "working" && (
        <>
          <Loader2 size={44} className="animate-spin text-brand dark:text-teal-300" aria-hidden="true" />
          <h1 className="text-2xl font-extrabold text-stone-900 dark:text-stone-50" role="status">{t.welcome.working}</h1>
          <p className="text-base text-stone-600 dark:text-stone-400">{t.welcome.workingBody}</p>
        </>
      )}
      {phase === "ready" && (
        <>
          <div className="animate-pop flex size-20 items-center justify-center rounded-full bg-brand text-white">
            <Check size={44} strokeWidth={3} aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-extrabold text-stone-900 dark:text-stone-50">{t.welcome.readyTitle}</h1>
          <p className="text-base text-stone-600 dark:text-stone-400">{t.welcome.readyBody}</p>
          <Button size="lg" variant="primary" block onClick={() => (window.location.href = `/${locale}/app/#sell`)}>{t.welcome.open}</Button>
        </>
      )}
      {phase === "slow" && (
        <>
          <h1 className="text-2xl font-extrabold text-stone-900 dark:text-stone-50">{t.welcome.working}</h1>
          <p className="text-base text-stone-600 dark:text-stone-400">{t.welcome.slow}</p>
          <Button size="lg" variant="primary" onClick={() => window.location.reload()}>{t.welcome.reload}</Button>
        </>
      )}
      {phase === "claimed" && (
        <>
          <h1 className="text-2xl font-extrabold text-stone-900 dark:text-stone-50">{t.welcome.claimedTitle}</h1>
          <p className="text-base text-stone-600 dark:text-stone-400">{t.welcome.claimedBody}</p>
          <Button size="lg" variant="primary" onClick={() => (window.location.href = `/${locale}/app/`)}>{t.welcome.open}</Button>
        </>
      )}
      {phase === "missing" && (
        <>
          <h1 className="text-2xl font-extrabold text-stone-900 dark:text-stone-50">{t.welcome.missingTitle}</h1>
          <p className="text-base text-stone-600 dark:text-stone-400">{t.welcome.missingBody}</p>
          <Button size="lg" variant="primary" onClick={() => (window.location.href = `/${locale}/start/`)}>{t.welcome.startAgain}</Button>
        </>
      )}
    </main>
  );
}
