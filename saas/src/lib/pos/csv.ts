import type { MenuItem } from "../validations/shop";

/** UTF-8 first (strict), then Windows-874 (what Thai Excel saves without "UTF-8 CSV"). A leading BOM is removed. */
export function decodeCsvBytes(buf: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder("windows-874").decode(buf);
  }
  return text.replace(/^﻿/, "");
}

/** RFC 4180: quoted fields, commas and line breaks inside quotes, "" as an escaped quote. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  const endRow = (): void => {
    row.push(field);
    field = "";
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else field += ch;
  }
  endRow();
  return rows;
}

export type CsvMenuResult = { ok: true; items: MenuItem[] } | { ok: false };

/**
 * Turns a spreadsheet into menu items. Needs an item-name column and a price column;
 * a category column and a Thai-name column are optional. Header names are matched loosely.
 */
export function menuFromCsv(text: string, newId: () => string): CsvMenuResult {
  const rows = parseCsv(text);
  const head = rows[0];
  if (!head || rows.length < 2) return { ok: false };
  const h = head.map((c) => c.trim());
  const iCat = h.findIndex((c) => /categor|group|หมวด/i.test(c));
  const iTH = h.findIndex((c) => /thai|_th$|name_?th|ไทย/i.test(c));
  const iName = h.findIndex((c, i) => i !== iTH && /item|name|ชื่อ|รายการ/i.test(c));
  const iPrice = h.findIndex((c) => /price|ราคา/i.test(c));
  if (iName === -1 || iPrice === -1) return { ok: false };

  const items: MenuItem[] = [];
  for (const raw of rows.slice(1)) {
    const cols = raw.map((c) => c.trim());
    const name = cols[iName] ?? "";
    if (!name) continue;
    const price = Number.parseFloat((cols[iPrice] ?? "").replace(/[^0-9.]/g, ""));
    const cat = iCat >= 0 ? (cols[iCat] ?? "") : "";
    items.push({
      id: newId().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40),
      nameEN: name.slice(0, 120),
      nameTH: ((iTH >= 0 ? cols[iTH] : "") || name).slice(0, 120),
      price: Number.isFinite(price) && price >= 0 ? Math.min(price, 1_000_000) : 0,
      ...(cat ? { category: cat.slice(0, 60) } : {}),
    });
  }
  return items.length ? { ok: true, items: items.slice(0, 1000) } : { ok: false };
}

export const CSV_TEMPLATE =
  "﻿Category,Item,Name_TH,Price\r\nDrinks,Iced tea,ชาเย็น,35\r\nDrinks,Water,น้ำเปล่า,15\r\nMains,Fried rice,ข้าวผัด,70\r\n";
