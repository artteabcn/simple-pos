import { useState, type ReactNode } from "react";
import { Loader2, MailCheck } from "lucide-react";
import type { Locale } from "../../i18n/utils";
import { I18nProvider, useI18n } from "../pos/i18n";
import { Button, Field } from "../pos/ui";

export default function LoginForm({ locale }: { locale: Locale }): ReactNode {
  return (
    <I18nProvider locale={locale} currency="฿">
      <Form />
    </I18nProvider>
  );
}

function Form(): ReactNode {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLinks, setDevLinks] = useState<string[]>([]);

  const submit = async (): Promise<void> => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError(t.common.required);
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), locale }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const b = (await res.json()) as { devLinks?: string[] };
      setDevLinks(b.devLinks ?? []);
      setSent(true);
    } catch {
      setError(t.start.errorNetwork);
    }
    setBusy(false);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <p className="text-xl font-extrabold text-brand dark:text-teal-300">{t.app.name}</p>
      {sent ? (
        <>
          <div className="flex size-16 items-center justify-center rounded-full bg-brand/10 text-brand dark:text-teal-300">
            <MailCheck size={32} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-extrabold text-stone-900 dark:text-stone-50">{t.login.sentTitle}</h1>
          <p role="status" className="text-base text-stone-700 dark:text-stone-300">{t.login.sentBody}</p>
          <p className="text-base text-stone-600 dark:text-stone-400">{t.login.spam}</p>
          {devLinks.map((u) => (
            <a key={u} href={u} data-dev-link className="rounded-xl bg-amber-50 p-3 text-sm break-all text-amber-900 underline">{u}</a>
          ))}
          <Button onClick={() => { setSent(false); setDevLinks([]); }}>{t.login.another}</Button>
        </>
      ) : (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          noValidate
        >
          <div>
            <h1 className="text-3xl font-extrabold text-stone-900 dark:text-stone-50">{t.login.title}</h1>
            <p className="mt-2 text-base text-stone-600 dark:text-stone-400">{t.login.subtitle}</p>
          </div>
          <Field label={t.login.email} type="email" inputMode="email" autoComplete="email" value={email} error={error} onChange={(v) => { setEmail(v); setError(undefined); }} maxLength={120} autoFocus />
          <Button type="submit" size="lg" variant="primary" block disabled={busy}>
            {busy && <Loader2 size={22} className="animate-spin" aria-hidden="true" />}
            {t.login.send}
          </Button>
        </form>
      )}
      <a href={`/${locale}/start/`} className="text-center text-base font-semibold text-brand underline-offset-4 hover:underline dark:text-teal-300">{t.login.newHere}</a>
    </main>
  );
}
