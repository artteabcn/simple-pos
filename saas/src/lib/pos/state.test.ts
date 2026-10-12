import { describe, expect, it } from "vitest";
import {
  addToOrder, billsToCsv, categoriesOf, clearOrder, deleteRecord, groupByDay, inRange, initialState,
  itemName, liveBills, openSaved, orderTotals, patchOrder, payOrder, removeItem, restoreItem,
  restoreRecord, saveForLater, setLineQty, setShop, upsertItem, type Ctx,
} from "./state";
import type { PosState } from "../validations/pos";
import type { MenuItem } from "../validations/shop";

let n = 0;
const at = (h: number, m = 0, day = 4): Date => new Date(2026, 9, day, h, m, 0);
const ctx = (now: Date): Ctx => ({ now, id: () => "id" + ++n });

const padThai: MenuItem = { id: "m1", nameEN: "Pad Thai", nameTH: "ผัดไทย", price: 1200, category: "Mains" };
const beer: MenuItem = { id: "m2", nameEN: "Beer", nameTH: "เบียร์", price: 60, category: "Drinks" };

const withShop = (): PosState =>
  setShop(initialState(), {
    profile: { name: "Test", taxId: "", tel: "", address: "", currency: "฿", logo: "", promptpay: "", vatMode: "inclusive" },
    menu: [padThai, beer],
  });

describe("order", () => {
  it("adds, increments and removes lines", () => {
    let s = addToOrder(addToOrder(withShop(), padThai), padThai);
    expect(s.order.lines).toEqual([expect.objectContaining({ itemId: "m1", qty: 2 })]);
    s = setLineQty(s, "m1", 5);
    expect(s.order.lines[0]?.qty).toBe(5);
    s = setLineQty(s, "m1", 0);
    expect(s.order.lines).toHaveLength(0);
  });
  it("totals use real numbers (2 x 1,200 = 2,400, not 2)", () => {
    const s = addToOrder(addToOrder(withShop(), padThai), padThai);
    expect(orderTotals(s).total).toBe(2400);
  });
  it("discount and service flow into the total", () => {
    let s = setShopVat(addToOrder(withShop(), padThai), "none");
    s = patchOrder(s, { discountPct: 10, servicePct: 10 });
    expect(orderTotals(s).total).toBeCloseTo(1188, 5);
  });
});

function setShopVat(s: PosState, vatMode: "inclusive" | "exclusive" | "none"): PosState {
  if (!s.shop) throw new Error("no shop");
  return { ...s, shop: { ...s.shop, profile: { ...s.shop.profile, vatMode } } };
}

describe("saved bills", () => {
  it("keeps an order for later and clears the counter", () => {
    const s = saveForLater(patchOrder(addToOrder(withShop(), beer), { label: "Table 3" }), ctx(at(12)));
    expect(s.order.lines).toHaveLength(0);
    expect(liveBills(s.saved)).toHaveLength(1);
    expect(liveBills(s.saved)[0]?.label).toBe("Table 3");
  });
  it("opening a saved bill moves it to the counter and parks what was there", () => {
    let s = saveForLater(patchOrder(addToOrder(withShop(), beer), { label: "A" }), ctx(at(12)));
    s = patchOrder(addToOrder(s, padThai), { label: "B" });
    const savedId = liveBills(s.saved)[0]?.id ?? "";
    s = openSaved(s, savedId, ctx(at(12, 5)));
    expect(s.order.label).toBe("A");
    expect(liveBills(s.saved).map((b) => b.label)).toEqual(["B"]);
  });
  it("does nothing for an empty order", () => {
    expect(saveForLater(withShop(), ctx(at(1)))).toEqual(withShop());
  });
});

describe("payment", () => {
  it("records a paid bill with the right total and clears the counter", () => {
    const s = addToOrder(addToOrder(withShop(), padThai), padThai);
    const r = payOrder(s, ctx(at(13)), "cash", 3000);
    expect(r?.bill.total).toBe(2400);
    expect(r?.bill.received).toBe(3000);
    expect(r?.state.order.lines).toHaveLength(0);
    expect(liveBills(r?.state.paid ?? [])).toHaveLength(1);
  });
  it("refuses an empty order", () => {
    expect(payOrder(withShop(), ctx(at(13)), "cash")).toBeNull();
  });
});

describe("delete and undo", () => {
  it("deletes with a tombstone and restores the original", () => {
    const paid = payOrder(addToOrder(withShop(), beer), ctx(at(10)), "card");
    if (!paid) throw new Error("no bill");
    let s = deleteRecord(paid.state, "paid", paid.bill.id, ctx(at(11)));
    expect(liveBills(s.paid)).toHaveLength(0);
    s = restoreRecord(s, "paid", paid.bill, ctx(at(11, 1)));
    expect(liveBills(s.paid).map((b) => b.id)).toEqual([paid.bill.id]);
  });
});

describe("menu", () => {
  it("upserts, removes and restores at the same position", () => {
    let s = upsertItem(withShop(), { ...beer, price: 70 });
    expect(s.shop?.menu.find((m) => m.id === "m2")?.price).toBe(70);
    s = removeItem(s, "m1");
    expect(s.shop?.menu.map((m) => m.id)).toEqual(["m2"]);
    s = restoreItem(s, padThai, 0);
    expect(s.shop?.menu.map((m) => m.id)).toEqual(["m1", "m2"]);
  });
  it("names follow the language, with a fallback", () => {
    expect(itemName(padThai, "th")).toBe("ผัดไทย");
    expect(itemName(padThai, "de")).toBe("Pad Thai");
    expect(itemName({ nameEN: "", nameTH: "ชา" }, "en")).toBe("ชา");
    expect(categoriesOf([padThai, beer, { ...beer, id: "x" }])).toEqual(["Mains", "Drinks"]);
  });
});

describe("history", () => {
  const now = at(15, 0, 7); // Wednesday 7 Oct 2026
  it("filters today / week (from Monday) / month / 30 days", () => {
    expect(inRange(at(9, 0, 7).toISOString(), "today", now)).toBe(true);
    expect(inRange(at(9, 0, 6).toISOString(), "today", now)).toBe(false);
    expect(inRange(at(9, 0, 5).toISOString(), "week", now)).toBe(true); // Monday
    expect(inRange(at(9, 0, 4).toISOString(), "week", now)).toBe(false); // Sunday
    expect(inRange(new Date(2026, 8, 30).toISOString(), "month", now)).toBe(false);
    expect(inRange(new Date(2026, 8, 20).toISOString(), "all", now)).toBe(true);
    expect(inRange(new Date(2026, 7, 1).toISOString(), "all", now)).toBe(false);
  });
  it("groups by day with subtotals, newest day first", () => {
    const a = payOrder(addToOrder(withShop(), beer), ctx(at(9, 0, 6)), "cash")?.bill;
    const b = payOrder(addToOrder(withShop(), padThai), ctx(at(10, 0, 7)), "cash")?.bill;
    const c = payOrder(addToOrder(withShop(), beer), ctx(at(11, 0, 7)), "cash")?.bill;
    if (!a || !b || !c) throw new Error("bills");
    const g = groupByDay([c, b, a]);
    expect(g.map((x) => x.total)).toEqual([1260, 60]);
  });
  it("exports CSV that Excel reads as UTF-8 (BOM) with escaped quotes", () => {
    const bill = payOrder(addToOrder(withShop(), { ...padThai, nameEN: 'Pad "Thai"' }), ctx(at(9)), "cash")?.bill;
    if (!bill) throw new Error("bill");
    const csv = billsToCsv([bill], "en");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Pad ""Thai"""');
    expect(billsToCsv([bill], "th")).toContain("ผัดไทย");
  });
});

describe("clearOrder", () => {
  it("empties lines and resets fields", () => {
    const s = clearOrder(patchOrder(addToOrder(withShop(), beer), { discountPct: 5, label: "x" }));
    expect(s.order).toEqual({ lines: [], discountPct: 0, servicePct: 0, label: "" });
  });
});
