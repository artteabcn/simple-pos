import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { itemName } from "../../lib/pos/state";
import type { Bill } from "../../lib/validations/pos";
import type { ShopProfile } from "../../lib/validations/shop";
import { useI18n } from "./i18n";

export type PrintJob =
  | { kind: "bill"; bill: Bill; paid: boolean }
  | { kind: "summary"; bills: Bill[]; title: string };

type PrintApi = { print: (job: PrintJob) => void };
const PrintCtx = createContext<PrintApi | null>(null);

export function PrintProvider({ profile, children }: { profile: ShopProfile | null; children: ReactNode }): ReactNode {
  const [job, setJob] = useState<PrintJob | null>(null);
  const [seq, setSeq] = useState(0);
  const last = useRef(0);

  const print = useCallback((j: PrintJob) => {
    setJob(j);
    setSeq((n) => n + 1);
  }, []);

  // Print after React has drawn the receipt into the hidden print area.
  useEffect(() => {
    if (seq === 0 || seq === last.current) return;
    last.current = seq;
    const id = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(id);
  }, [seq]);

  return (
    <PrintCtx.Provider value={{ print }}>
      {children}
      {createPortal(
        <div id="print-root">
          {job?.kind === "bill" && profile && <Receipt profile={profile} bill={job.bill} paid={job.paid} />}
          {job?.kind === "summary" && profile && <Summary profile={profile} bills={job.bills} title={job.title} />}
        </div>,
        document.body,
      )}
    </PrintCtx.Provider>
  );
}

export function usePrint(): PrintApi {
  const v = useContext(PrintCtx);
  if (!v) throw new Error("usePrint outside PrintProvider");
  return v;
}

function Row({ left, right, bold }: { left: string; right: string; bold?: boolean }): ReactNode {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: bold ? 700 : 400, fontSize: bold ? "1.15em" : undefined }}>
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

function Receipt({ profile, bill, paid }: { profile: ShopProfile; bill: Bill; paid: boolean }): ReactNode {
  const { t, locale, money, date } = useI18n();
  const when = date(bill.paidAt ?? bill.savedAt ?? bill.updatedAt, { dateStyle: "medium", timeStyle: "short" });
  const method = bill.method ? t.pay[bill.method] : "";
  return (
    <div style={{ maxWidth: "80mm", margin: "0 auto", fontFamily: "system-ui, sans-serif", fontSize: 13, color: "#000" }}>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{profile.name}</div>
        {profile.address && <div>{profile.address}</div>}
        {profile.tel && <div>{profile.tel}</div>}
        {profile.taxId && <div>{t.receipt.taxId}: {profile.taxId}</div>}
      </div>
      <div style={{ borderTop: "1px dashed #000", borderBottom: "1px dashed #000", padding: "4px 0", marginBottom: 6 }}>
        <Row left={`${paid ? t.receipt.title : t.receipt.bill}: ${bill.label}`} right={when} />
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6 }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th>{t.receipt.item}</th>
            <th style={{ textAlign: "right" }}>{t.receipt.qty}</th>
            <th style={{ textAlign: "right" }}>{t.receipt.amount}</th>
          </tr>
        </thead>
        <tbody>
          {bill.lines.map((l) => (
            <tr key={l.itemId}>
              <td>{itemName(l, locale)}</td>
              <td style={{ textAlign: "right" }}>{l.qty}</td>
              <td style={{ textAlign: "right" }}>{money(l.price * l.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ borderTop: "1px dashed #000", paddingTop: 4 }}>
        <Row left={t.sell.subtotal} right={money(bill.subtotal)} />
        {bill.discount > 0 && <Row left={`${t.sell.discount} ${bill.discountPct}%`} right={`-${money(bill.discount)}`} />}
        {bill.service > 0 && <Row left={`${t.sell.service} ${bill.servicePct}%`} right={money(bill.service)} />}
        {bill.vatMode === "inclusive" && <Row left={t.sell.vatIncluded} right={money(bill.vat)} />}
        {bill.vatMode === "exclusive" && <Row left={t.sell.vatAdded} right={money(bill.vat)} />}
        <Row left={t.sell.total} right={money(bill.total)} bold />
        {paid && method && <Row left={t.history.paidWith} right={method} />}
        {paid && bill.method === "cash" && bill.received !== undefined && (
          <>
            <Row left={t.receipt.cashReceived} right={money(bill.received)} />
            <Row left={t.receipt.change} right={money(Math.max(0, bill.received - bill.total))} />
          </>
        )}
      </div>
      <div style={{ textAlign: "center", marginTop: 12 }}>{t.receipt.thanks}</div>
    </div>
  );
}

function Summary({ profile, bills, title }: { profile: ShopProfile; bills: Bill[]; title: string }): ReactNode {
  const { t, money, date } = useI18n();
  const total = bills.reduce((s, b) => s + b.total, 0);
  return (
    <div style={{ maxWidth: "190mm", margin: "0 auto", fontFamily: "system-ui, sans-serif", fontSize: 13, color: "#000" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 2px" }}>{profile.name}</h1>
      <div style={{ marginBottom: 10 }}>{title} - {date(new Date().toISOString(), { dateStyle: "medium" })}</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #000" }}>
            <th>{t.history.time}</th><th>{t.receipt.bill}</th><th>{t.history.paidWith}</th><th style={{ textAlign: "right" }}>{t.sell.total}</th>
          </tr>
        </thead>
        <tbody>
          {bills.map((b) => (
            <tr key={b.id} style={{ borderBottom: "1px solid #ddd" }}>
              <td>{date(b.paidAt ?? b.updatedAt, { dateStyle: "short", timeStyle: "short" })}</td>
              <td>{b.label}</td>
              <td>{b.method ? t.pay[b.method] : ""}</td>
              <td style={{ textAlign: "right" }}>{money(b.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign: "right", fontWeight: 700, fontSize: 16, marginTop: 8 }}>
        {t.history.total}: {money(total)} ({bills.length})
      </div>
    </div>
  );
}
