import { describe, expect, it } from "vitest";
import { calcTotals, cashSuggestions, formatBaht, formatMoney } from "./calc";
import { crc16, promptPayPayload } from "./promptpay";
import { mergeLists, stamp, tombstone, type SyncRecord } from "./merge";
import { ShopProfileSchema, SlugSchema, LogoUrlSchema } from "../validations/shop";
import { LOCALES, pickLocale, useTranslations } from "../../i18n/utils";

describe("calcTotals", () => {
  it("VAT included: total unchanged, vat = 7/107", () => {
    const t = calcTotals(1070, 0, 0, "inclusive");
    expect(t.total).toBe(1070);
    expect(t.vat).toBeCloseTo(70, 5);
  });
  it("VAT added on top", () => {
    const t = calcTotals(1000, 0, 0, "exclusive");
    expect(t.vat).toBeCloseTo(70, 5);
    expect(t.total).toBeCloseTo(1070, 5);
  });
  it("discount then service, no VAT", () => {
    const t = calcTotals(1000, 10, 10, "none");
    expect(t.discount).toBe(100);
    expect(t.service).toBe(90);
    expect(t.total).toBe(990);
  });
  it("formatBaht keeps numbers as numbers (the 2,400 -> 2 bug)", () => {
    expect(formatBaht(2400, "en-GB")).toBe("2,400");
    expect(parseFloat(formatBaht(2400, "en-GB"))).toBe(2); // why we never parse the display string
  });
});

describe("cash and money display", () => {
  it("suggests the amounts a customer would hand over", () => {
    expect(cashSuggestions(35)).toEqual([50, 100, 500, 1000]);
    expect(cashSuggestions(420)).toEqual([450, 500, 1000]);
    expect(cashSuggestions(419.5)).toEqual([450, 500, 1000]);
    expect(cashSuggestions(450)).toEqual([500, 1000]);
    expect(cashSuggestions(1000)).toEqual([1050, 1100, 1500, 2000]);
  });
  it("shows satang only when there are some", () => {
    expect(formatMoney(2400, "en-GB", "฿")).toBe("฿2,400");
    expect(formatMoney(419.5, "en-GB", "฿")).toBe("฿419.50");
    expect(formatMoney(1188, "de-DE", "฿")).toBe("฿1.188");
  });
});

describe("promptPayPayload", () => {
  it("matches the payload decoded from a verified scannable QR", () => {
    expect(promptPayPayload("0812345678", 2400)).toBe(
      "00020101021229370016A000000677010111011300668123456785802TH530376454072400.0063047EDF",
    );
  });
  it("accepts a 13-digit ID and ignores separators", () => {
    const p = promptPayPayload("1-2345-67890-12-3", 10);
    expect(p).toContain("0213" + "1234567890123");
    expect(p.endsWith(crc16(p.slice(0, -4)))).toBe(true);
  });
  it("rejects invalid lengths instead of producing a bad QR", () => {
    expect(promptPayPayload("12345", 10)).toBe("");
    expect(promptPayPayload("", 10)).toBe("");
  });
});

describe("mergeLists", () => {
  const t = (s: number) => new Date(Date.UTC(2026, 9, 4, 12, 0, s)).toISOString();
  const bill = (id: string, s: number): SyncRecord => ({ id, label: id, total: s, paidAt: t(s), updatedAt: t(s) });

  it("keeps bills from two devices", () => {
    expect(mergeLists([bill("a", 1)], [bill("b", 2)], 500).map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("a delete beats a stale copy", () => {
    const a = stamp(bill("a", 1));
    const dead = { ...tombstone(a, new Date(t(30))) };
    const merged = mergeLists([bill("a", 1)], [dead], 500, Date.parse(t(31)));
    expect(merged.find((x) => x.id === "a")?.deleted).toBe(true);
  });
  it("legacy bills without id get one stable id", () => {
    const legacy = { label: "old", total: 5, paidAt: t(5) };
    const once = mergeLists([{ ...legacy }], [{ ...legacy }], 30);
    expect(once).toHaveLength(1);
  });
  it("ids are made safe for HTML attributes", () => {
    expect(stamp({ id: "x');alert(1);//" }).id).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("caps live records and drops old tombstones", () => {
    const many = Array.from({ length: 40 }, (_, i) => bill("b" + i, i));
    expect(mergeLists(many, [], 30)).toHaveLength(30);
    const old = { id: "z", deleted: true, updatedAt: "2020-01-01T00:00:00.000Z", paidAt: "2020-01-01T00:00:00.000Z" };
    expect(mergeLists([old], [], 30)).toHaveLength(0);
  });
});

describe("validation", () => {
  it("slug: no path tricks", () => {
    expect(SlugSchema.safeParse("Jira-Bottega").success).toBe(true);
    expect(SlugSchema.safeParse("../etc").success).toBe(false);
    expect(SlugSchema.safeParse("a").success).toBe(false);
  });
  it("logo: only http(s) or site-relative", () => {
    expect(LogoUrlSchema.safeParse("https://x.com/a.png").success).toBe(true);
    expect(LogoUrlSchema.safeParse("/data/logos/a.png").success).toBe(true);
    expect(LogoUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
  });
  it("shop profile applies safe defaults", () => {
    const p = ShopProfileSchema.parse({ name: "Wassana" });
    expect(p.vatMode).toBe("inclusive");
    expect(p.currency).toBe("฿");
  });
});

describe("i18n", () => {
  const flat = (o: unknown, prefix = ""): string[] =>
    Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
      typeof v === "object" && v !== null ? flat(v, prefix + k + ".") : [prefix + k],
    );
  const entries = (o: unknown, prefix = ""): [string, string][] =>
    Object.entries(o as Record<string, unknown>).flatMap(([k, v]): [string, string][] =>
      typeof v === "object" && v !== null ? entries(v, prefix + k + ".") : [[prefix + k, String(v)]],
    );
  const placeholders = (s: string): string => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

  it("every locale has exactly the same keys", () => {
    const base = flat(useTranslations("en")).sort();
    for (const l of LOCALES) expect(flat(useTranslations(l)).sort()).toEqual(base);
  });
  it("no empty text, and every language uses the same {placeholders}", () => {
    const en = new Map(entries(useTranslations("en")));
    for (const l of LOCALES) {
      for (const [key, value] of entries(useTranslations(l))) {
        expect(value.trim(), `${l}.${key} is empty`).not.toBe("");
        expect(placeholders(value), `${l}.${key} placeholders`).toBe(placeholders(en.get(key) ?? ""));
      }
    }
  });
  it("picks the first supported browser language, else English", () => {
    expect(pickLocale(["es-ES", "de-AT", "en"])).toBe("de");
    expect(pickLocale(["th-TH"])).toBe("th");
    expect(pickLocale(["ja"])).toBe("th");
    expect(pickLocale([])).toBe("th");
  });
});
