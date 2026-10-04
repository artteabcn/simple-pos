import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { useI18n } from "./i18n";

// ---------- Button ----------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg";
  block?: boolean;
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong disabled:bg-stone-300 disabled:text-stone-500 dark:disabled:bg-stone-700 dark:disabled:text-stone-400",
  secondary: "bg-stone-100 text-stone-900 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700 disabled:opacity-50",
  ghost: "bg-transparent text-brand hover:bg-brand/10 disabled:opacity-50",
  danger: "bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-200 dark:hover:bg-rose-900 disabled:opacity-50",
};

export function Button({ variant = "secondary", size = "md", block, className, type = "button", ...rest }: ButtonProps): ReactNode {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 font-semibold touch-manipulation",
        "transition-[transform,background-color,opacity] duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
        size === "lg" ? "min-h-14 text-lg" : "min-h-12 text-base",
        block && "w-full",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  );
}

// ---------- Field ----------

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  label: string;
  hint?: string;
  error?: string;
  value: string;
  onChange: (v: string) => void;
  optionalText?: string;
};

export function Field({ label, hint, error, value, onChange, optionalText, className, ...rest }: FieldProps): ReactNode {
  const id = useId();
  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-stone-800 dark:text-stone-200">
        {label}
        {optionalText && <span className="ml-1 font-normal text-stone-500 dark:text-stone-400">({optionalText})</span>}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined}
        className={clsx(
          "min-h-12 w-full rounded-xl border bg-white px-3 text-base text-stone-900 placeholder:text-stone-400",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
          "dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500",
          error ? "border-rose-600" : "border-stone-300 dark:border-stone-700",
        )}
        {...rest}
      />
      {error ? (
        <p id={`${id}-e`} role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
      ) : hint ? (
        <p id={`${id}-h`} className="text-sm text-stone-600 dark:text-stone-400">{hint}</p>
      ) : null}
    </div>
  );
}

// ---------- Segmented control ----------

export function Segmented<T extends string | number>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
  /** Two rows of two on narrow screens (for four options with longer words). */
  wrap?: boolean;
}): ReactNode {
  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      className={clsx(
        "grid gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-800",
        props.wrap ? "grid-cols-2 sm:auto-cols-fr sm:grid-flow-col" : "auto-cols-fr grid-flow-col",
        props.className,
      )}
    >
      {props.options.map((o) => {
        const on = o.value === props.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => props.onChange(o.value)}
            className={clsx(
              "min-h-11 cursor-pointer rounded-lg px-2 text-sm font-semibold touch-manipulation transition-colors duration-150",
              on ? "bg-white text-brand shadow-sm dark:bg-stone-950 dark:text-teal-300" : "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Sheet (bottom sheet on phones, dialog on larger screens) ----------

export function Sheet(props: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }): ReactNode {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { onClose } = props;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const body = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = body;
      prev?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="app-shell fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div className="animate-fade absolute inset-0 bg-stone-950/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white outline-none sm:max-w-lg sm:rounded-3xl dark:bg-stone-900"
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
          <h2 id={titleId} className="text-lg font-bold text-stone-900 dark:text-stone-50">{props.title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="flex size-11 cursor-pointer items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            <X size={22} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4">{props.children}</div>
        {props.footer && (
          <div className="border-t border-stone-200 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-stone-800">{props.footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Toasts (with optional Undo) ----------

type ToastItem = { id: number; message: string; actionLabel?: string; onAction?: () => void };
type ToastApi = { show: (message: string, action?: { label: string; run: () => void }) => void };

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }): ReactNode {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((x) => x.id !== id)), []);
  const show = useCallback<ToastApi["show"]>((message, action) => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-2), { id, message, actionLabel: action?.label, onAction: action?.run }]);
    window.setTimeout(() => dismiss(id), action ? 7000 : 3500);
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {createPortal(
        <div aria-live="polite" className="app-shell pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4">
          {items.map((it) => (
            <div key={it.id} className="animate-toast pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-2xl bg-stone-900 py-2 pr-2 pl-4 text-white shadow-lg dark:bg-stone-100 dark:text-stone-900">
              <span className="py-1 text-base">{it.message}</span>
              {it.onAction && (
                <button
                  type="button"
                  onClick={() => { it.onAction?.(); dismiss(it.id); }}
                  className="min-h-11 cursor-pointer rounded-xl px-4 font-bold text-teal-300 hover:bg-white/10 dark:text-teal-800 dark:hover:bg-black/10"
                >
                  {it.actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(ToastCtx);
  if (!v) throw new Error("useToast outside ToastProvider");
  return v;
}

// ---------- Empty state ----------

export function EmptyState(props: { icon: ReactNode; title: string; body?: string; action?: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-brand/10 text-brand dark:text-teal-300">{props.icon}</div>
      <p className="text-lg font-bold text-stone-900 dark:text-stone-50">{props.title}</p>
      {props.body && <p className="max-w-xs text-base text-stone-600 dark:text-stone-400">{props.body}</p>}
      {props.action}
    </div>
  );
}

// ---------- media query ----------

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = (): void => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}
