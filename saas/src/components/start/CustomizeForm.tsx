import { useId, useState, type ReactNode } from "react";
import { Check, Loader2, MessageCircle } from "lucide-react";
import { clsx } from "clsx";
import type { Locale } from "../../i18n/utils";
import { loadLink } from "../../lib/pos/sync-client";
import { LINE_URL } from "../../lib/site";
import { NEED_KEYS, type NeedKey } from "../../lib/validations/customization";
import { I18nProvider, useI18n } from "../pos/i18n";
import { Button, Field } from "../pos/ui";

export default function CustomizeForm({ locale }: { locale: Locale }): ReactNode {
  return (
    <I18nProvider locale={locale} currency="฿">
      <Form />
    </I18nProvider>
  );
}

type Problem = "many" | "generic" | null;

function Form(): ReactNode {
  const { t, locale } = useI18n();
  const detailsId = useId();
  const [name, setName] = useState("");
  const [shopName, setShopName] = useState(() => {
    try {
      return loadLink(localStorage)?.name ?? "";
    } catch {
      return "";
    }
  });
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [needs, setNeeds] = useState<NeedKey[]>([]);
  const [details, setDetails] = useState("");
  const [trap, setTrap] = useState(""); // hidden field: only bots fill it
  const [errors, setErrors] = useState<{ name?: string; email?: string; needs?: string }>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);
  const [sent, setSent] = useState(false);

  const toggle = (k: NeedKey): void => {
    setNeeds((n) => (n.includes(k) ? n.filter((x) => x !== k) : [...n, k]));
    setErrors((e) => ({ ...e, needs: undefined }));
  };

  const submit = async (): Promise<void> => {
    const e: typeof errors = {};
    if (!name.trim()) e.name = t.common.required;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = t.common.required;
    if (needs.length === 0 && !details.trim()) e.needs = t.custom.needOne;
    setErrors(e);
    if (e.name || e.email || e.needs) return;

    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/customization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), shopName: shopName.trim(), contact: contact.trim(), needs, details: details.trim(), locale, website: trap }),
      });
      if (res.ok) setSent(true);
      else setProblem(res.status === 429 ? "many" : "generic");
    } catch {
      setProblem("generic");
    }
    setBusy(false);
  };

  const lineCard = (
    <a
      href={LINE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-20 items-center gap-4 rounded-2xl border-2 border-[#06C755]/40 bg-[#06C755]/10 p-4 text-stone-900 transition-colors hover:bg-[#06C755]/15 dark:text-stone-50"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#06C755] text-white">
        <MessageCircle size={26} aria-hidden="true" />
      </span>
      <span>
        <span className="block text-lg font-bold">{t.custom.lineButton}</span>
        <span className="block text-base text-stone-700 dark:text-stone-300">{t.custom.lineBody}</span>
      </span>
    </a>
  );

  if (sent) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 px-4 py-10">
        <div className="animate-pop flex size-20 items-center justify-center rounded-full bg-brand text-white">
          <Check size={44} strokeWidth={3} aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-extrabold text-stone-900 dark:text-stone-50">{t.custom.sentTitle}</h1>
        <p role="status" className="text-base text-stone-700 dark:text-stone-300">{t.custom.sentBody}</p>
        {lineCard}
        <Button size="lg" onClick={() => (window.location.href = `/${locale}/app/#sell`)}>{t.custom.backToTill}</Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-xl font-extrabold text-brand dark:text-teal-300">{t.app.name}</p>
        <h1 className="mt-4 text-3xl leading-tight font-extrabold text-stone-900 dark:text-stone-50">{t.custom.title}</h1>
        <p className="mt-2 text-base text-stone-600 dark:text-stone-400">{t.custom.subtitle}</p>
      </header>

      <section aria-labelledby="line-h" className="flex flex-col gap-2">
        <h2 id="line-h" className="sr-only">{t.custom.lineTitle}</h2>
        {lineCard}
      </section>

      <form
        className="flex flex-col gap-5"
        onSubmit={(ev) => {
          ev.preventDefault();
          void submit();
        }}
        noValidate
      >
        <Field label={t.custom.name} value={name} error={errors.name} autoComplete="name" maxLength={80} onChange={(v) => { setName(v); setErrors((x) => ({ ...x, name: undefined })); }} />
        <Field label={t.custom.shopName} optionalText={t.common.optional} value={shopName} autoComplete="organization" maxLength={80} onChange={setShopName} />
        <Field label={t.custom.email} type="email" inputMode="email" autoComplete="email" value={email} error={errors.email} maxLength={120} onChange={(v) => { setEmail(v); setErrors((x) => ({ ...x, email: undefined })); }} />
        <Field label={t.custom.contact} optionalText={t.common.optional} hint={t.custom.contactHint} value={contact} autoComplete="tel" maxLength={80} onChange={setContact} />

        <fieldset className="flex flex-col gap-2" aria-describedby={errors.needs ? "needs-err" : undefined}>
          <legend className="mb-1 text-sm font-semibold text-stone-800 dark:text-stone-200">{t.custom.needsLegend}</legend>
          {NEED_KEYS.map((k) => {
            const on = needs.includes(k);
            return (
              <button
                key={k}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(k)}
                className={clsx(
                  "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 text-left text-base font-semibold touch-manipulation transition-colors duration-150",
                  on ? "border-brand bg-brand/10 text-brand dark:text-teal-300" : "border-stone-200 text-stone-800 hover:border-stone-300 dark:border-stone-700 dark:text-stone-200",
                )}
              >
                <span className={clsx("flex size-6 shrink-0 items-center justify-center rounded-md border-2", on ? "border-brand bg-brand text-white" : "border-stone-400 dark:border-stone-600")}>
                  {on && <Check size={16} strokeWidth={3} aria-hidden="true" />}
                </span>
                {t.custom.needs[k]}
              </button>
            );
          })}
          {errors.needs && <p id="needs-err" role="alert" className="text-sm text-rose-700 dark:text-rose-300">{errors.needs}</p>}
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor={detailsId} className="text-sm font-semibold text-stone-800 dark:text-stone-200">{t.custom.details} <span className="font-normal text-stone-500 dark:text-stone-400">({t.common.optional})</span></label>
          <textarea
            id={detailsId}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={1000}
            rows={4}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-base text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
          />
          <p className="text-sm text-stone-600 dark:text-stone-400">{t.custom.detailsHint}</p>
        </div>

        {/* Bot trap: invisible to people, tempting to scripts. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>Website<input tabIndex={-1} autoComplete="off" name="website" value={trap} onChange={(e) => setTrap(e.target.value)} /></label>
        </div>

        {problem && (
          <p role="alert" className="rounded-xl bg-rose-50 p-4 text-base font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-200">
            {problem === "many" ? t.custom.errorMany : t.custom.errorGeneric}
          </p>
        )}
        <Button type="submit" size="lg" variant="primary" block disabled={busy}>
          {busy && <Loader2 size={22} className="animate-spin" aria-hidden="true" />}
          {busy ? t.custom.sending : t.custom.send}
        </Button>
      </form>
    </main>
  );
}
