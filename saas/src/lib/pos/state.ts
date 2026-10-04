import { calcTotals, type BillTotals } from "./calc";
import { mergeLists } from "./merge";
import type { MenuItem, ShopProfile } from "../validations/shop";
import type {
  Bill,
  BillRecord,
  CartLine,
  Order,
  PaymentMethod,
  PosState,
  ShopConfig,
  Tombstone,
} from "../validations/pos";

/** Injected so the logic stays pure and testable. */
export type Ctx = { now: Date; id: () => string };

export const SAVED_CAP = 30;
export const PAID_CAP = 500;

export const emptyOrder = (): Order => ({ lines: [], discountPct: 0, servicePct: 0, label: "" });
export const initialState = (): PosState => ({ shop: null, order: emptyOrder(), saved: [], paid: [] });

const iso = (d: Date): string => d.toISOString();

// ---------- order ----------

export function addToOrder(s: PosState, item: MenuItem): PosState {
  const lines = [...s.order.lines];
  const i = lines.findIndex((l) => l.itemId === item.id);
  const at = lines[i];
  if (at) lines[i] = { ...at, qty: Math.min(999, at.qty + 1) };
  else lines.push({ itemId: item.id, nameEN: item.nameEN, nameTH: item.nameTH, price: item.price, qty: 1 });
  return { ...s, order: { ...s.order, lines } };
}

export function setLineQty(s: PosState, itemId: string, qty: number): PosState {
  const lines =
    qty <= 0
      ? s.order.lines.filter((l) => l.itemId !== itemId)
      : s.order.lines.map((l) => (l.itemId === itemId ? { ...l, qty: Math.min(999, Math.floor(qty)) } : l));
  return { ...s, order: { ...s.order, lines } };
}

export function patchOrder(s: PosState, patch: Partial<Pick<Order, "discountPct" | "servicePct" | "label">>): PosState {
  return { ...s, order: { ...s.order, ...patch } };
}

export const clearOrder = (s: PosState): PosState => ({ ...s, order: emptyOrder() });

/** Undo helpers: put a removed line (or a whole cleared order) back. */
export function restoreLine(s: PosState, line: CartLine, index: number): PosState {
  if (s.order.lines.some((l) => l.itemId === line.itemId)) return s;
  const lines = [...s.order.lines];
  lines.splice(Math.min(index, lines.length), 0, line);
  return { ...s, order: { ...s.order, lines } };
}

export const restoreOrder = (s: PosState, order: Order): PosState => ({ ...s, order });

export const orderSubtotal = (lines: readonly CartLine[]): number =>
  lines.reduce((sum, l) => sum + l.price * l.qty, 0);

export function orderTotals(s: PosState): BillTotals {
  return calcTotals(
    orderSubtotal(s.order.lines),
    s.order.discountPct,
    s.order.servicePct,
    s.shop?.profile.vatMode ?? "inclusive",
  );
}

// ---------- bills ----------

function snapshot(s: PosState, ctx: Ctx, extra: Partial<Bill>): Bill {
  const t = orderTotals(s);
  return {
    id: ctx.id(),
    updatedAt: iso(ctx.now),
    label: s.order.label.trim() || autoLabel(ctx.now),
    lines: s.order.lines.map((l) => ({ ...l })),
    discountPct: s.order.discountPct,
    servicePct: s.order.servicePct,
    vatMode: s.shop?.profile.vatMode ?? "inclusive",
    ...t,
    ...extra,
  };
}

/** The current order as a bill, without saving it (used to print the bill before payment). */
export const previewBill = (s: PosState, ctx: Ctx): Bill => snapshot(s, ctx, {});

export function autoLabel(now: Date): string {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function saveForLater(s: PosState, ctx: Ctx): PosState {
  if (!s.order.lines.length) return s;
  const bill = snapshot(s, ctx, { savedAt: iso(ctx.now) });
  return { ...clearOrder(s), saved: mergeLists(s.saved, [bill], SAVED_CAP) as BillRecord[] };
}

/** Opens a saved bill. A bill already on the counter is parked first so nothing is lost. */
export function openSaved(s: PosState, id: string, ctx: Ctx): PosState {
  const rec = s.saved.find((r): r is Bill => r.id === id && !r.deleted);
  if (!rec) return s;
  const parked = s.order.lines.length ? saveForLater(s, ctx) : s;
  const order: Order = {
    lines: rec.lines.map((l) => ({ ...l })),
    discountPct: rec.discountPct,
    servicePct: rec.servicePct,
    label: rec.label,
  };
  const dead: Tombstone = { id: rec.id, deleted: true, updatedAt: iso(ctx.now), savedAt: rec.savedAt };
  return { ...parked, order, saved: mergeLists(parked.saved, [dead], SAVED_CAP) as BillRecord[] };
}

export function payOrder(
  s: PosState,
  ctx: Ctx,
  method: PaymentMethod,
  received?: number,
): { state: PosState; bill: Bill } | null {
  if (!s.order.lines.length) return null;
  const bill = snapshot(s, ctx, {
    paidAt: iso(ctx.now),
    method,
    ...(received !== undefined ? { received } : {}),
  });
  return { state: { ...clearOrder(s), paid: mergeLists(s.paid, [bill], PAID_CAP) as BillRecord[] }, bill };
}

export type RecordKind = "saved" | "paid";

export function deleteRecord(s: PosState, kind: RecordKind, id: string, ctx: Ctx): PosState {
  const list = s[kind];
  const rec = list.find((r) => r.id === id);
  if (!rec || rec.deleted) return s;
  const dead: Tombstone = { id, deleted: true, updatedAt: iso(ctx.now), savedAt: rec.savedAt, paidAt: rec.paidAt };
  return { ...s, [kind]: mergeLists(list, [dead], kind === "paid" ? PAID_CAP : SAVED_CAP) as BillRecord[] };
}

/** Undo for a delete: writes the original back with a newer timestamp so it wins the merge. */
export function restoreRecord(s: PosState, kind: RecordKind, original: Bill, ctx: Ctx): PosState {
  const back: Bill = { ...original, updatedAt: iso(ctx.now) };
  return { ...s, [kind]: mergeLists(s[kind], [back], kind === "paid" ? PAID_CAP : SAVED_CAP) as BillRecord[] };
}

export const liveBills = (list: readonly BillRecord[]): Bill[] =>
  list.filter((r): r is Bill => !r.deleted);

// ---------- shop / menu ----------

export function setShop(s: PosState, shop: ShopConfig): PosState {
  return { ...s, shop };
}

export function patchProfile(s: PosState, patch: Partial<ShopProfile>): PosState {
  if (!s.shop) return s;
  return { ...s, shop: { ...s.shop, profile: { ...s.shop.profile, ...patch } } };
}

export function upsertItem(s: PosState, item: MenuItem): PosState {
  if (!s.shop) return s;
  const menu = [...s.shop.menu];
  const i = menu.findIndex((m) => m.id === item.id);
  if (i >= 0) menu[i] = item;
  else menu.push(item);
  return { ...s, shop: { ...s.shop, menu } };
}

export function removeItem(s: PosState, id: string): PosState {
  if (!s.shop) return s;
  return { ...s, shop: { ...s.shop, menu: s.shop.menu.filter((m) => m.id !== id) } };
}

export function restoreItem(s: PosState, item: MenuItem, index: number): PosState {
  if (!s.shop) return s;
  const menu = s.shop.menu.filter((m) => m.id !== item.id);
  menu.splice(Math.min(index, menu.length), 0, item);
  return { ...s, shop: { ...s.shop, menu } };
}

/** Name shown for the current language: Thai screens prefer the Thai name, others the English one. */
export function itemName(item: { nameEN: string; nameTH: string }, locale: string): string {
  return locale === "th" ? item.nameTH || item.nameEN : item.nameEN || item.nameTH;
}

export function categoriesOf(menu: readonly MenuItem[]): string[] {
  return [...new Set(menu.map((m) => m.category?.trim()).filter((c): c is string => !!c))];
}

// ---------- history ----------

export type HistoryRange = "today" | "week" | "month" | "all";

export function inRange(paidAt: string, range: HistoryRange, now: Date): boolean {
  const d = new Date(paidAt);
  if (range === "all") return now.getTime() - d.getTime() <= 30 * 24 * 60 * 60 * 1000;
  if (range === "today") return d.toDateString() === now.toDateString();
  if (range === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday
  return d.getTime() >= start.getTime();
}

export type DayGroup = { key: string; date: Date; total: number; bills: Bill[] };

export function groupByDay(bills: readonly Bill[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const b of bills) {
    const d = new Date(b.paidAt ?? b.updatedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const g = map.get(key) ?? { key, date: d, total: 0, bills: [] };
    g.total += b.total;
    g.bills.push(b);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
}

/** CSV with a UTF-8 BOM so Excel opens Thai text correctly. */
export function billsToCsv(bills: readonly Bill[], locale: string): string {
  const q = (v: unknown): string => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["time", "bill", "payment", "item", "qty", "price", "bill total"].map(q).join(",")];
  for (const b of bills) {
    b.lines.forEach((l, i) =>
      rows.push(
        [b.paidAt, b.label, b.method, itemName(l, locale), l.qty, l.price, i === 0 ? Math.round(b.total) : ""]
          .map(q)
          .join(","),
      ),
    );
  }
  return "﻿" + rows.join("\r\n");
}
