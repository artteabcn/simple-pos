// Local end-to-end check of payments -> shop -> till sync against `npm run dev` (port 4321) with a local D1.
// Run the dev server first (see MEMORY.HTML), then: node scripts/e2e-local.mjs. Uses the test secrets from .dev.vars.
import { createHmac } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const BASE = "http://127.0.0.1:4321";
const SECRET = "whsec_local_test_secret_123";
const MIRROR = (process.env.USERPROFILE ?? "").split("\\").join("/") + "/_mig/simple-pos-saas";
const SESSION = "cs_test_e2eSESSION1234567890";
let pass = 0, fail = 0;
const ok = (cond, msg, extra) => { (cond ? pass++ : fail++); console.log((cond ? "PASS  " : "FAIL  ") + msg + (cond ? "" : "  -> " + JSON.stringify(extra))); };

const sql = (text) => {
  writeFileSync(MIRROR + "/e2e-seed.sql", text);
  execSync("npx wrangler d1 execute DB --local --file e2e-seed.sql", { cwd: MIRROR, stdio: "pipe" });
};
const sign = (body, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex")}`;
const post = (path, body, headers = {}) => fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const event = (id, type, obj) => JSON.stringify({ id, type, data: { object: { id: SESSION, ...obj } } });
const webhook = (body, sig) => post("/api/stripe/webhook", body, sig === null ? {} : { "stripe-signature": sig ?? sign(body) });

sql("DELETE FROM customization_requests; DELETE FROM manager_sessions; DELETE FROM login_links; DELETE FROM devices; DELETE FROM records; DELETE FROM payments; DELETE FROM shops; DELETE FROM signups; DELETE FROM stripe_events;");
// ---- seed: a signup that Stripe checkout would have created (we do not call Stripe here)
const now = new Date().toISOString(), later = new Date(Date.now() + 3600e3).toISOString();
sql(`INSERT OR REPLACE INTO signups (id, slug, shop_name, email, customisation, locale, amount_expected, stripe_session_id, status, expires_at, created_at, updated_at)
     VALUES ('sg_e2e','e2e-cafe','E2E Cafe','owner@example.com',0,'en',49900,'${SESSION}','pending','${later}','${now}','${now}');`);

// ---- checkout input validation and the Stripe-unavailable path (dummy key: Stripe will refuse)
let r = await post("/api/checkout", { shopName: "", slug: "x", email: "bad", locale: "en" });
ok(r.status === 400, "checkout rejects an invalid form", r.status);
r = await post("/api/checkout", "not json");
ok(r.status === 400, "checkout rejects non-JSON", r.status);

// ---- webhook security
const paid = event("evt_e2e_1", "checkout.session.completed", { payment_status: "paid", amount_total: 49900, currency: "thb", payment_intent: "pi_e2e" });
r = await webhook(paid, "t=1,v1=deadbeef");
ok(r.status === 400, "webhook: forged signature refused", r.status);
r = await webhook(paid, null);
ok(r.status === 400, "webhook: missing signature refused", r.status);
r = await webhook(paid, sign(paid, Math.floor(Date.now() / 1000) - 3600));
ok(r.status === 400, "webhook: old (replayed) signature refused", r.status);
r = await webhook(paid + " ", sign(paid));
ok(r.status === 400, "webhook: tampered body refused", r.status);

// ---- payment -> shop
const unpaid = event("evt_e2e_0", "checkout.session.completed", { payment_status: "unpaid", amount_total: 49900, currency: "thb" });
r = await webhook(unpaid);
ok(r.status === 200, "webhook: unpaid session acknowledged, nothing created yet", r.status);
let claim = await post("/api/claim", { sessionId: SESSION });
ok(claim.status === 202, "claim: 202 while the payment is not confirmed", claim.status);

r = await webhook(paid);
let b = await r.json();
ok(r.status === 200 && b.result === "created", "webhook: confirmed payment creates the shop", b);
r = await webhook(paid);
b = await r.json();
ok(r.status === 200 && b.duplicate === true, "webhook: the same event again does nothing", b);
r = await webhook(event("evt_e2e_2", "checkout.session.async_payment_succeeded", { payment_status: "paid", amount_total: 49900, currency: "thb" }));
b = await r.json();
ok(b.result === "duplicate", "webhook: a second event for the same payment makes no second shop", b);

// ---- claim
r = await post("/api/claim", { sessionId: "nope" });
ok(r.status === 400, "claim: malformed session id refused", r.status);
r = await post("/api/claim", { sessionId: "cs_test_unknownunknown123" });
ok(r.status === 202, "claim: unknown session waits (never reveals anything)", r.status);
claim = await post("/api/claim", { sessionId: SESSION });
const c1 = await claim.json();
ok(claim.status === 200 && c1.token?.startsWith("tk_") && c1.slug === "e2e-cafe", "claim: owner receives the till key", c1);

// ---- till sync over HTTP
const auth = { authorization: `Bearer ${c1.token}` };
r = await post("/api/till/sync", { saved: [], paid: [], since: null });
ok(r.status === 401, "sync: no key refused", r.status);
r = await post("/api/till/sync", { saved: [], paid: [], since: null }, { authorization: "Bearer tk_wrong" });
ok(r.status === 401, "sync: wrong key refused", r.status);
r = await post("/api/till/sync", { saved: "oops", paid: [], since: null }, auth);
ok(r.status === 400, "sync: invalid body refused", r.status);
r = await post("/api/till/sync", { saved: [{ id: "x", updatedAt: "2026-10-04T12:00:00.000Z", label: "<img onerror=1>", lines: [{ itemId: "a'b", nameEN: "x", nameTH: "x", price: 1, qty: 1 }], discountPct: 0, servicePct: 0, vatMode: "none", subtotal: 1, discount: 0, service: 0, vat: 0, total: 1 }], paid: [], since: null }, auth);
ok(r.status === 400, "sync: a record with an unsafe item id is refused", r.status);

const t0 = new Date().toISOString();
const bill = { id: "bill1", updatedAt: t0, label: "Table 1", lines: [{ itemId: "m1", nameEN: "Pad Thai", nameTH: "ผัดไทย", price: 80, qty: 30 }], discountPct: 0, servicePct: 0, vatMode: "inclusive", subtotal: 2400, discount: 0, service: 0, vat: 157, total: 2400, method: "cash", received: 3000, paidAt: t0 };
const config = { profile: { name: "E2E Cafe", taxId: "", tel: "", address: "", currency: "฿", logo: "", promptpay: "0812345678", vatMode: "inclusive" }, menu: [{ id: "m1", nameEN: "Pad Thai", nameTH: "ผัดไทย", price: 80 }], updatedAt: t0 };
r = await post("/api/till/sync", { config, saved: [], paid: [bill], since: null }, auth);
b = await r.json();
ok(r.status === 200 && b.paid.length === 1 && b.paid[0].total === 2400, "sync: a 2,400 sale is stored with the exact total", b);

// a second till (same key, empty) receives everything, including Thai text and the settings
r = await post("/api/till/sync", { saved: [], paid: [], since: null }, auth);
b = await r.json();
ok(b.paid[0]?.lines[0]?.nameTH === "ผัดไทย" && b.config?.profile.promptpay === "0812345678", "sync: second till gets the sale (Thai intact) and the shop settings", b);

// delete from one till, stale copy from another cannot bring it back
const later1 = new Date(Date.now() + 5000).toISOString();
await post("/api/till/sync", { saved: [], paid: [{ id: "bill1", deleted: true, updatedAt: later1, paidAt: t0 }], since: null }, auth);
r = await post("/api/till/sync", { saved: [], paid: [bill], since: null }, auth);
b = await r.json();
ok(b.paid.find((x) => x.id === "bill1")?.deleted === true, "sync: a delete wins over a stale copy", b);

// now that the till has synced, claiming again is refused
r = await post("/api/claim", { sessionId: SESSION });
ok(r.status === 409, "claim: after the first sync the key cannot be fetched again (409)", r.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
