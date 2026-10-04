import { describe, expect, it } from "vitest";
import { CSV_TEMPLATE, decodeCsvBytes, menuFromCsv, parseCsv } from "./csv";

const ids = (): (() => string) => {
  let n = 0;
  return () => `i${++n}`;
};
const buf = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const csv = 'Category,Item,Name_TH,Price_THB\r\nBeers,"Chang, small",เบียร์ช้าง,60\r\nFood,"Pad ""Thai""",ผัดไทย,"1,200"\r\n';

describe("csv", () => {
  it("strips a BOM and parses quotes, commas and escaped quotes", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(csv)]);
    const rows = parseCsv(decodeCsvBytes(buf(bytes)));
    expect(rows[0]?.[0]).toBe("Category");
    expect(rows[1]?.[1]).toBe("Chang, small");
    expect(rows[2]?.[1]).toBe('Pad "Thai"');
  });
  it("decodes a Windows-874 file (Thai Excel) correctly", () => {
    const w874 = Uint8Array.from(
      [...csv].map((ch) => {
        const c = ch.charCodeAt(0);
        return c >= 0x0e01 && c <= 0x0e5b ? c - 0x0e01 + 0xa1 : c;
      }),
    );
    expect(parseCsv(decodeCsvBytes(buf(w874)))[1]?.[2]).toBe("เบียร์ช้าง");
  });
  it("builds menu items: loose headers, Thai column, price with a thousands comma", () => {
    const r = menuFromCsv(csv, ids());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ nameEN: "Chang, small", nameTH: "เบียร์ช้าง", price: 60, category: "Beers" });
    expect(r.items[1]?.price).toBe(1200);
  });
  it("reports a file without name and price columns", () => {
    expect(menuFromCsv("a,b\r\n1,2\r\n", ids()).ok).toBe(false);
    expect(menuFromCsv("Item,Price\r\n", ids()).ok).toBe(false);
  });
  it("the downloadable example file imports cleanly", () => {
    const r = menuFromCsv(decodeCsvBytes(buf(new TextEncoder().encode(CSV_TEMPLATE))), ids());
    expect(r.ok && r.items.length).toBe(3);
  });
});
