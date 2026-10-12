import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { clsx } from "clsx";
import type { VatMode } from "../../lib/pos/calc";
import { useI18n } from "./i18n";

/** A vertical list of big, plainly worded options (clearer than a dropdown for non-technical users). */
export function RadioList<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}): ReactNode {
  return (
    <div role="radiogroup" aria-label={props.label} className="flex flex-col gap-2">
      {props.options.map((o) => {
        const on = o.value === props.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => props.onChange(o.value)}
            className={clsx(
              "flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border-2 px-4 text-left text-base font-semibold touch-manipulation transition-colors duration-150",
              on ? "border-brand bg-brand/10 text-brand dark:text-teal-300" : "border-stone-200 text-stone-800 hover:border-stone-300 dark:border-stone-700 dark:text-stone-200",
            )}
          >
            {o.label}
            {on && <Check size={20} strokeWidth={2.5} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

export function VatChoice(props: { value: VatMode; onChange: (v: VatMode) => void }): ReactNode {
  const { t } = useI18n();
  return (
    <RadioList<VatMode>
      label={t.shop.vat}
      value={props.value}
      onChange={props.onChange}
      options={[
        { value: "inclusive", label: t.shop.vatInclusive },
        { value: "exclusive", label: t.shop.vatExclusive },
        { value: "none", label: t.shop.vatNone },
      ]}
    />
  );
}
