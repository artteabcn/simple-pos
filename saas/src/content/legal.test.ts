import { describe, expect, it } from "vitest";
import { COMPANY, LEGAL, TERMS_VERSION, legalDoc, type LegalKind } from "./legal";

const KINDS: LegalKind[] = ["terms", "privacy", "refunds"];

describe("legal texts", () => {
  it("exist in Thai and English for every document, with the company details", () => {
    for (const k of KINDS) {
      for (const lang of ["th", "en"] as const) {
        const d = LEGAL[k][lang];
        expect(d.title.length, `${k}.${lang} title`).toBeGreaterThan(3);
        expect(d.html, `${k}.${lang} date`).toContain(COMPANY.updated);
      }
    }
    for (const lang of ["th", "en"] as const) {
      const html = LEGAL.terms[lang].html;
      expect(html).toContain(lang === "th" ? COMPANY.legalNameTh : COMPANY.legalName);
      expect(html).toContain(COMPANY.email);
      expect(html).toContain(COMPANY.taxId);
    }
  });
  it("have no leftovers from the template (undefined, unfilled placeholders) and balanced tags", () => {
    for (const k of KINDS) {
      for (const lang of ["th", "en"] as const) {
        const html = LEGAL[k][lang].html;
        expect(html, `${k}.${lang}`).not.toMatch(/undefined|\$\{|\[object/);
        for (const tag of ["h2", "ul", "li", "p", "strong"]) {
          const open = (html.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length;
          const close = (html.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
          expect(open, `${k}.${lang} <${tag}>`).toBe(close);
        }
      }
    }
  });
  it("the Thai texts are really Thai and the English ones are not", () => {
    for (const k of KINDS) {
      expect(LEGAL[k].th.html).toMatch(/[฀-๿]{20}/);
      expect(LEGAL[k].en.html).not.toMatch(/[฀-๿]{5}/);
    }
  });
  it("stay consistent with each other and with the product", () => {
    // 30 days: deletion after a request (privacy) and notice before closing (terms)
    expect(LEGAL.privacy.en.html).toContain("30 days");
    expect(LEGAL.privacy.th.html).toContain("30 วัน");
    expect(LEGAL.terms.en.html).toContain("30 days");
    // the refund rule the code implements: a full refund switches the till off and keeps the data
    expect(LEGAL.refunds.en.html).toMatch(/switched off/);
    expect(LEGAL.refunds.th.html).toContain("ปิดใช้งาน");
    // no advertising and no card numbers, as built
    expect(LEGAL.privacy.en.html).toMatch(/do not show advertising/);
    expect(LEGAL.privacy.en.html).toMatch(/never store card numbers/);
  });
  it("the version stored at sign-up is the date of the texts", () => {
    expect(TERMS_VERSION).toBe(COMPANY.updated);
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("Thai visitors get Thai, English visitors English, French and German get English with a note", () => {
    expect(legalDoc("terms", "th")).toMatchObject({ translated: true, doc: LEGAL.terms.th });
    expect(legalDoc("terms", "en")).toMatchObject({ translated: true, doc: LEGAL.terms.en });
    for (const l of ["fr", "de"]) expect(legalDoc("terms", l)).toMatchObject({ translated: false, doc: LEGAL.terms.en });
  });
});
