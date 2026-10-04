import { useRef, useState, type ReactNode } from "react";
import { FileUp, ListPlus, Sparkles } from "lucide-react";
import { clsx } from "clsx";
import type { VatMode } from "../../lib/pos/calc";
import { decodeCsvBytes, menuFromCsv } from "../../lib/pos/csv";
import { sampleMenu } from "../../lib/pos/sample";
import { newId } from "../../lib/pos/store";
import { setShop } from "../../lib/pos/state";
import { loadLink } from "../../lib/pos/sync-client";
import type { PosState } from "../../lib/validations/pos";
import type { MenuItem } from "../../lib/validations/shop";
import { VatChoice } from "./Choices";
import { useI18n } from "./i18n";
import { Button, Field, useToast } from "./ui";

type Props = { set: (fn: (s: PosState) => PosState) => void };
type MenuChoice = "sample" | "import" | "empty";

export function SetupWizard({ set }: Props): ReactNode {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  // The name given at checkout, when this till has just been linked to an account.
  const [name, setName] = useState(() => {
    try {
      return loadLink(localStorage)?.name ?? "";
    } catch {
      return "";
    }
  });
  const [nameError, setNameError] = useState<string | undefined>();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [choice, setChoice] = useState<MenuChoice | null>(null);
  const [promptpay, setPromptpay] = useState("");
  const [ppError, setPpError] = useState<string | undefined>();
  const [vatMode, setVatMode] = useState<VatMode>("inclusive");
  const total = 3;

  const next1 = (): void => {
    if (!name.trim()) return setNameError(t.common.required);
    setStep(2);
  };

  const pick = (c: MenuChoice): void => {
    setChoice(c);
    if (c === "sample") {
      setMenu(sampleMenu({ drinks: t.setup.sampleCategoryDrinks, mains: t.setup.sampleCategoryMains, snacks: t.setup.sampleCategorySnacks }));
      setStep(3);
    } else if (c === "empty") {
      setMenu([]);
      setStep(3);
    } else fileRef.current?.click();
  };

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const r = menuFromCsv(decodeCsvBytes(await file.arrayBuffer()), () => `it_${newId()}`);
    if (!r.ok) {
      toast.show(t.shop.importFail);
      return;
    }
    setMenu(r.items);
    toast.show(fmt(t.shop.importDone, { n: r.items.length }));
    setStep(3);
  };

  const finish = (): void => {
    if (promptpay && promptpay.length !== 10 && promptpay.length !== 13) return setPpError(t.shop.promptpayInvalid);
    set((s) =>
      setShop(s, {
        profile: { name: name.trim().slice(0, 80), taxId: "", tel: "", address: "", currency: "฿", logo: "", promptpay, vatMode },
        menu,
      }),
    );
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 py-4">
      <div>
        <div className="mb-2 flex gap-1.5" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={clsx("h-1.5 flex-1 rounded-full transition-colors duration-200", i < step ? "bg-brand" : "bg-stone-200 dark:bg-stone-800")} />
          ))}
        </div>
        <p className="text-sm font-semibold text-stone-600 dark:text-stone-400">{fmt(t.setup.step, { n: step, m: total })}</p>
      </div>

      {step === 1 && (
        <>
          <div>
            <h1 className="text-3xl font-extrabold text-stone-900 dark:text-stone-50">{t.setup.welcomeTitle}</h1>
            <p className="mt-1 text-base text-stone-600 dark:text-stone-400">{t.setup.welcomeBody}</p>
          </div>
          <Field
            label={t.setup.nameTitle}
            hint={t.setup.nameHint}
            value={name}
            error={nameError}
            autoFocus
            maxLength={80}
            onChange={(v) => { setName(v); setNameError(undefined); }}
            onKeyDown={(e) => e.key === "Enter" && next1()}
          />
          <Button size="lg" variant="primary" block onClick={next1}>{t.common.next}</Button>
        </>
      )}

      {step === 2 && (
        <>
          <div>
            <h1 className="text-3xl font-extrabold text-stone-900 dark:text-stone-50">{t.setup.menuTitle}</h1>
            <p className="mt-1 text-base text-stone-600 dark:text-stone-400">{t.setup.menuBody}</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="flex flex-col gap-3">
            <Option icon={<Sparkles size={26} aria-hidden="true" />} title={t.setup.menuSample} body={t.setup.menuSampleBody} on={choice === "sample"} onClick={() => pick("sample")} />
            <Option icon={<FileUp size={26} aria-hidden="true" />} title={t.setup.menuImport} body={t.setup.menuImportBody} on={choice === "import"} onClick={() => pick("import")} />
            <Option icon={<ListPlus size={26} aria-hidden="true" />} title={t.setup.menuEmpty} body={t.setup.menuEmptyBody} on={choice === "empty"} onClick={() => pick("empty")} />
          </div>
          <Button onClick={() => setStep(1)}>{t.common.back}</Button>
        </>
      )}

      {step === 3 && (
        <>
          <div>
            <h1 className="text-3xl font-extrabold text-stone-900 dark:text-stone-50">{t.setup.payTitle}</h1>
            <p className="mt-1 text-base text-stone-600 dark:text-stone-400">{t.setup.payBody}</p>
          </div>
          <Field
            label={t.shop.promptpay}
            optionalText={t.common.optional}
            hint={t.shop.promptpayHint}
            value={promptpay}
            error={ppError}
            inputMode="numeric"
            onChange={(v) => { setPromptpay(v.replace(/\D/g, "").slice(0, 13)); setPpError(undefined); }}
          />
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">{t.shop.vat}</p>
            <VatChoice value={vatMode} onChange={setVatMode} />
          </div>
          <Button size="lg" variant="primary" block onClick={finish}>{t.setup.finish}</Button>
          <Button onClick={() => setStep(2)}>{t.common.back}</Button>
        </>
      )}
    </div>
  );
}

function Option(props: { icon: ReactNode; title: string; body: string; on: boolean; onClick: () => void }): ReactNode {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.on}
      className={clsx(
        "flex min-h-20 cursor-pointer items-center gap-4 rounded-2xl border-2 p-4 text-left touch-manipulation transition-colors duration-150 active:scale-[0.99]",
        props.on ? "border-brand bg-brand/10" : "border-stone-200 bg-white hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900",
      )}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand dark:text-teal-300">{props.icon}</span>
      <span>
        <span className="block text-lg font-bold text-stone-900 dark:text-stone-50">{props.title}</span>
        <span className="block text-base text-stone-600 dark:text-stone-400">{props.body}</span>
      </span>
    </button>
  );
}
