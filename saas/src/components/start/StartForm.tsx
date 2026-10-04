import { useState, type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import type { Locale } from "../../i18n/utils";
import { expectedAmount, PRICE_CUSTOMISATION, PRICE_SETUP } from "../../lib/billing/pricing";
import { suggestSlug } from "../../lib/validations/signup";
import { I18nProvider, useI18n } from "../pos/i18n";
import { Button, Field } from "../pos/ui";

/** A web address is only used behind the scenes; owners never have to think about it. */
function makeSlug(name: string): string {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  return `${suggestSlug(name) || "shop"}-${rand}`;
}

export default function StartForm({ locale }: { locale: Locale }): ReactNode {
  return (
    <I18nProvider locale={locale} currency="฿">
      <Form />
    </I18nProvider>
  );
}

type Problem = "invalid" | "unavailable" | "network" | null;

function Form(): ReactNode {
  const { t, locale, money } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [addOn, setAddOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; terms?: string }>({});
  const cancelled = typeof location !== "undefined" && new URLSearchParams(location.search).get("cancelled") === "1";
  const total = expectedAmount(addOn) / 100;

  const submit = async (): Promise<void> => {
    const e: typeof errors = {};
    if (!name.trim()) e.name = t.common.required;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = t.common.required;
    if (!accepted) e.terms = t.legal.acceptError;
    setErrors(e);
    if (e.name || e.email || e.terms) return;

    setBusy(true);
    setProblem(null);
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopName: name.trim(), slug: makeSlug(name), email: email.trim(), customisation: addOn, locale, acceptTerms: true }),
        });
        if (res.status === 409) continue; // the random address was taken: try another
        const body = (await res.json().catch(() => ({}))) as { url?: string };
        if (res.ok && body.url) {
          window.location.href = body.url;
          return;
        }
        setProblem(res.status === 400 ? "invalid" : "unavailable");
        break;
      }
    } catch {
      setProblem("network");
    }
    setBusy(false);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-xl font-extrabold text-brand dark:text-teal-300">{t.app.name}</p>
        <h1 className="mt-4 text-3xl leading-tight font-extrabold text-stone-900 dark:text-stone-50">{t.start.title}</h1>
        <p className="mt-2 text-base text-stone-600 dark:text-stone-400">{t.start.subtitle}</p>
      </header>

      {cancelled && <p role="status" className="rounded-xl bg-amber-50 p-4 text-base text-amber-900 dark:bg-amber-950 dark:text-amber-100">{t.start.cancelled}</p>}

      <form
        className="flex flex-col gap-5"
        onSubmit={(ev) => {
          ev.preventDefault();
          void submit();
        }}
        noValidate
      >
        <Field label={t.start.shopName} hint={t.start.shopNameHint} value={name} error={errors.name} onChange={(v) => { setName(v); setErrors((x) => ({ ...x, name: undefined })); }} maxLength={80} autoComplete="organization" autoFocus />
        <Field label={t.start.email} hint={t.start.emailHint} value={email} error={errors.email} type="email" inputMode="email" autoComplete="email" onChange={(v) => { setEmail(v); setErrors((x) => ({ ...x, email: undefined })); }} maxLength={120} />

        <button
          type="button"
          role="checkbox"
          aria-checked={addOn}
          onClick={() => setAddOn((v) => !v)}
          className={clsx(
            "flex min-h-20 cursor-pointer items-start gap-4 rounded-2xl border-2 p-4 text-left touch-manipulation transition-colors duration-150",
            addOn ? "border-brand bg-brand/10" : "border-stone-200 bg-white hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900",
          )}
        >
          <span className={clsx("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border-2", addOn ? "border-brand bg-brand text-white" : "border-stone-400 dark:border-stone-600")}>
            {addOn && <Check size={18} strokeWidth={3} aria-hidden="true" />}
          </span>
          <span className="flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-lg font-bold text-stone-900 dark:text-stone-50">{t.start.addOn}</span>
              <span className="num font-bold text-brand dark:text-teal-300">+{money(PRICE_CUSTOMISATION / 100)}</span>
            </span>
            <span className="block text-base text-stone-600 dark:text-stone-400">{t.start.addOnBody}</span>
          </span>
        </button>

        <dl className="flex flex-col gap-1 rounded-2xl bg-stone-100 p-4 dark:bg-stone-800">
          <div className="flex justify-between text-base text-stone-700 dark:text-stone-300">
            <dt>{t.start.setupLine}</dt>
            <dd className="num">{money(PRICE_SETUP / 100)}</dd>
          </div>
          {addOn && (
            <div className="flex justify-between text-base text-stone-700 dark:text-stone-300">
              <dt>{t.start.addOn}</dt>
              <dd className="num">{money(PRICE_CUSTOMISATION / 100)}</dd>
            </div>
          )}
          <div className="mt-1 flex items-baseline justify-between border-t border-stone-300 pt-2 dark:border-stone-600">
            <dt className="text-lg font-bold text-stone-900 dark:text-stone-50">{t.start.total}</dt>
            <dd className="num text-3xl font-extrabold text-stone-900 dark:text-stone-50">{money(total)}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-1">
          <div className="flex items-start gap-3">
            <input
              id="accept-terms"
              type="checkbox"
              checked={accepted}
              onChange={(e) => { setAccepted(e.target.checked); setErrors((x) => ({ ...x, terms: undefined })); }}
              aria-invalid={errors.terms ? true : undefined}
              aria-describedby={errors.terms ? "terms-err" : undefined}
              className="mt-1 size-6 shrink-0 cursor-pointer accent-teal-700"
            />
            <label htmlFor="accept-terms" className="cursor-pointer text-base text-stone-800 dark:text-stone-200">
              {t.legal.acceptLead}
              <a href={`/${locale}/terms/`} target="_blank" rel="noopener" className="font-semibold text-brand underline underline-offset-2 dark:text-teal-300">{t.legal.terms}</a>
              {t.legal.acceptAnd}
              <a href={`/${locale}/privacy/`} target="_blank" rel="noopener" className="font-semibold text-brand underline underline-offset-2 dark:text-teal-300">{t.legal.privacy}</a>
              {t.legal.acceptEnd}
            </label>
          </div>
          {errors.terms && <p id="terms-err" role="alert" className="text-sm text-rose-700 dark:text-rose-300">{errors.terms}</p>}
        </div>

        {problem && (
          <p role="alert" className="rounded-xl bg-rose-50 p-4 text-base font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-200">
            {problem === "invalid" ? t.start.errorInvalid : problem === "network" ? t.start.errorNetwork : t.start.errorUnavailable}
          </p>
        )}

        <Button type="submit" size="lg" variant="primary" block disabled={busy}>
          {busy ? <Loader2 size={22} className="animate-spin" aria-hidden="true" /> : null}
          {busy ? t.start.working : t.start.pay}
        </Button>
        <p className="text-center text-sm text-stone-600 dark:text-stone-400">{t.start.secure}</p>
      </form>

      <a href={`/${locale}/app/`} className="text-center text-base font-semibold text-brand underline-offset-4 hover:underline dark:text-teal-300">
        {t.start.haveTill}
      </a>
    </main>
  );
}
