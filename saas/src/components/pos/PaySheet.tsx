import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Banknote, Check, CreditCard, QrCode } from "lucide-react";
import { clsx } from "clsx";
import { cashSuggestions } from "../../lib/pos/calc";
import { promptPayPayload } from "../../lib/pos/promptpay";
import { liveCtx } from "../../lib/pos/store";
import { orderTotals, payOrder } from "../../lib/pos/state";
import type { Bill, PaymentMethod, PosState } from "../../lib/validations/pos";
import { useI18n } from "./i18n";
import { usePrint } from "./Print";
import { Button, Sheet } from "./ui";

type Props = {
  state: PosState;
  set: (fn: (s: PosState) => PosState) => void;
  onClose: () => void;
  /** Called when the cashier leaves the sheet after a payment, so the order panel can close too. */
  onFinished: () => void;
};

const METHODS: { id: PaymentMethod; icon: typeof Banknote }[] = [
  { id: "cash", icon: Banknote },
  { id: "promptpay", icon: QrCode },
  { id: "card", icon: CreditCard },
];

export function PaySheet({ state, set, onClose, onFinished }: Props): ReactNode {
  const { t, money } = useI18n();
  const { print } = usePrint();
  const total = orderTotals(state).total;
  const profile = state.shop?.profile;
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [receivedText, setReceivedText] = useState("");
  const [paid, setPaid] = useState<Bill | null>(null);

  const received = receivedText === "" ? NaN : Number(receivedText.replace(/,/g, ""));
  const cashOk = method !== "cash" || (Number.isFinite(received) && received >= total - 1e-9);
  const change = method === "cash" && Number.isFinite(received) ? Math.max(0, received - total) : 0;
  const suggestions = useMemo(() => cashSuggestions(total), [total]);

  const confirm = (): void => {
    const ctx = liveCtx();
    let result: ReturnType<typeof payOrder> = null;
    set((s) => {
      result = payOrder(s, ctx, method, method === "cash" && Number.isFinite(received) ? received : undefined);
      return result ? result.state : s;
    });
    const r = result as ReturnType<typeof payOrder>;
    if (r) setPaid(r.bill);
  };

  const finish = (): void => {
    onClose();
    if (paid) onFinished();
  };

  if (paid) {
    const paidChange = paid.method === "cash" && paid.received !== undefined ? Math.max(0, paid.received - paid.total) : 0;
    return (
      <Sheet
        title={t.pay.paid}
        onClose={finish}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" onClick={() => print({ kind: "bill", bill: paid, paid: true })}>{t.pay.printReceipt}</Button>
            <Button size="lg" variant="primary" onClick={finish}>{t.pay.newOrder}</Button>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <div className="animate-pop flex size-20 items-center justify-center rounded-full bg-brand text-white">
            <Check size={44} strokeWidth={3} aria-hidden="true" />
          </div>
          <p className="mt-2 text-lg font-semibold text-stone-700 dark:text-stone-300">{t.pay.thanks}</p>
          <p className="num text-4xl font-extrabold text-stone-900 dark:text-stone-50">{money(paid.total)}</p>
          {paid.method === "cash" && paidChange > 0 && (
            <p className="num mt-2 rounded-xl bg-brand/10 px-4 py-2 text-xl font-bold text-brand dark:text-teal-300">
              {t.pay.change}: {money(paidChange)}
            </p>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={t.pay.title}
      onClose={onClose}
      footer={
        <Button size="lg" variant="primary" block disabled={!cashOk} onClick={confirm}>
          <Check size={22} aria-hidden="true" /> {t.pay.confirm}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl bg-stone-100 p-4 text-center dark:bg-stone-800">
          <p className="text-sm font-semibold text-stone-600 dark:text-stone-400">{t.pay.amountDue}</p>
          <p className="num text-4xl font-extrabold text-stone-900 dark:text-stone-50">{money(total)}</p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-stone-800 dark:text-stone-200">{t.pay.method}</legend>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map(({ id, icon: Icon }) => {
              const on = method === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setMethod(id)}
                  className={clsx(
                    "flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 px-1 text-sm font-semibold touch-manipulation transition-colors duration-150",
                    on
                      ? "border-brand bg-brand/10 text-brand dark:text-teal-300"
                      : "border-stone-200 text-stone-700 hover:border-stone-300 dark:border-stone-700 dark:text-stone-300",
                  )}
                >
                  <Icon size={26} strokeWidth={1.75} aria-hidden="true" />
                  {t.pay[id]}
                </button>
              );
            })}
          </div>
        </fieldset>

        {method === "cash" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-stone-800 dark:text-stone-200">{t.pay.received}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={receivedText === String(total) ? "primary" : "secondary"} onClick={() => setReceivedText(String(total))}>
                {t.pay.exact}
              </Button>
              {suggestions.map((v) => (
                <Button key={v} className="num" variant={receivedText === String(v) ? "primary" : "secondary"} onClick={() => setReceivedText(String(v))}>
                  {money(v)}
                </Button>
              ))}
            </div>
            <input
              inputMode="decimal"
              value={receivedText}
              onChange={(e) => setReceivedText(e.target.value.replace(/[^0-9.,]/g, ""))}
              placeholder={t.pay.other}
              aria-label={t.pay.other}
              className="num min-h-14 w-full rounded-xl border border-stone-300 bg-white px-4 text-xl font-semibold text-stone-900 placeholder:font-normal focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
            />
            {receivedText !== "" && Number.isFinite(received) && !cashOk && (
              <p role="alert" className="text-base font-semibold text-rose-700 dark:text-rose-300">{t.pay.notEnough}</p>
            )}
            {cashOk && Number.isFinite(received) && (
              <p className="num rounded-xl bg-brand/10 px-4 py-3 text-center text-2xl font-extrabold text-brand dark:text-teal-300">
                {t.pay.change}: {money(change)}
              </p>
            )}
          </div>
        )}

        {method === "promptpay" && <PromptPayPanel id={profile?.promptpay ?? ""} total={total} />}

        {method === "card" && <p className="rounded-xl bg-stone-100 p-4 text-base text-stone-700 dark:bg-stone-800 dark:text-stone-300">{t.pay.cardNote}</p>}
      </div>
    </Sheet>
  );
}

function PromptPayPanel({ id, total }: { id: string; total: number }): ReactNode {
  const { t } = useI18n();
  const payload = useMemo(() => promptPayPayload(id, total), [id, total]);
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let live = true;
    if (!payload) { setSvg(""); return; }
    void import("qrcode").then((mod) =>
      mod.toString(payload, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((s) => { if (live) setSvg(s); }),
    );
    return () => { live = false; };
  }, [payload]);

  if (!payload) {
    return <p className="rounded-xl bg-amber-50 p-4 text-base text-amber-900 dark:bg-amber-950 dark:text-amber-100">{t.pay.promptpayMissing}</p>;
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        role="img"
        aria-label="PromptPay QR"
        className="size-60 rounded-2xl bg-white p-2 [&>svg]:size-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="text-center text-base text-stone-700 dark:text-stone-300">{t.pay.scan}</p>
    </div>
  );
}
