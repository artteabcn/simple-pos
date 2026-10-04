// Local end-to-end check of step 4 (sign-in links, per-device keys, manager PIN, landing page and search files)
// against `npm run dev` (port 4321) with a local D1 and the test values in .dev.vars
// (APP_SECRET and DEV_ECHO_LINKS=1 must be set there). Run: node scripts/e2e-auth.mjs
import { createHmac } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const BASE = "http://127.0.0.1:4321";
const SECRET = "whsec_local_test_secret_123";
const MIRROR = (process.env.USERPROFILE ?? "").split("\\").join("/") + "/_mig/simple-pos-saas";
const SESSION = "cs_test_authSESSION1234567890";
let pass = 0, fail = 0;
const ok = (cond, msg, extra) => { (cond ? pass++ : fail++); console.log((cond ? "PASS  " : "FAIL  ") + msg + (cond ? "" : "  -> " + JSON.stringify(extra))); };

const sql = (text) => { writeFileSync(MIRROR + "/auth-seed.sql", text); execSync("npx wrangler d1 execute DB --local --file auth-seed.sql", { cwd: MIRROR, stdio: "pipe" }); };
const post = (path, body, headers = {}) => fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const get = (path) => fetch(BASE + path);
const sign = (body) => { const t = Math.floor(Date.now() / 1000); return `t=${t},v1=${createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex")}`; };
const t0 = new Date().toISOString();
const sync = (token, extra = {}, headers = {}) => post("/api/till/sync", { saved: [], paid: [], since: null, ...extra }, { authorization: `Bearer ${token}`, ...headers });
const cfg = (name, at) => ({ profile: { name, taxId: "", tel: "", address: "", currency: "฿", logo: "", promptpay: "", vatMode: "inclusive" }, menu: [{ id: "m1", nameEN: "Tea", nameTH: "ชา", price: 35 }], updatedAt: at });

// ---- a paid shop (as the Stripe webhook would create it)
const now = new Date().toISOString(), later = new Date(Date.now() + 3600e3).toISOString();
sql(`DELETE FROM manager_sessions; DELETE FROM login_links; DELETE FROM devices; DELETE FROM records; DELETE FROM payments; DELETE FROM shops; DELETE FROM signups; DELETE FROM stripe_events;
INSERT INTO signups (id,slug,shop_name,email,customisation,locale,amount_expected,stripe_session_id,status,expires_at,created_at,updated_at) VALUES ('sg_a','auth-cafe','Auth Cafe','owner@example.com',0,'th',49900,'${SESSION}','pending','${later}','${now}','${now}');`);
const evt = JSON.stringify({ id: "evt_auth_1", type: "checkout.session.completed", data: { object: { id: SESSION, payment_status: "paid", amount_total: 49900, currency: "thb", payment_intent: "pi_a" } } });
let r = await fetch(BASE + "/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": sign(evt) }, body: evt });
ok(r.status === 200, "webhook creates the shop (and a welcome email attempt does not break it)", r.status);
let claim = await (await post("/api/claim", { sessionId: SESSION })).json();
const A = claim.token;
ok(A?.startsWith("tk_"), "first device key claimed", claim);
let b = await (await sync(A)).json();
ok(b.pinSet === false, "sync reports that no PIN is set yet", b.pinSet);

// ---- sign-in by emailed link
r = await post("/api/auth/request", { email: "not an email" });
ok(r.status === 400, "sign-in request: bad email refused", r.status);
r = await post("/api/auth/request", { email: "stranger@example.com", locale: "en" });
b = await r.json();
ok(r.status === 200 && b.ok === true && !b.devLinks, "sign-in request: unknown address gets the same answer and no link", b);
r = await post("/api/auth/request", { email: " Owner@Example.com ", locale: "th" });
b = await r.json();
ok(r.status === 200 && b.devLinks?.length === 1 && b.devLinks[0].includes("/th/login/verify#token=ll_"), "sign-in request: owner gets a link in their language (fragment, not query)", b);
const linkToken = b.devLinks[0].split("#token=")[1];
r = await post("/api/auth/verify", { token: linkToken, deviceName: "Back counter tablet" });
const dev = await r.json();
ok(r.status === 200 && dev.token?.startsWith("tk_") && dev.token !== A && dev.slug === "auth-cafe", "verify: link trades for a NEW device key for the right shop", dev);
const B = dev.token;
r = await post("/api/auth/verify", { token: linkToken });
ok(r.status === 400, "verify: the link cannot be used twice", r.status);
r = await post("/api/auth/verify", { token: "ll_" + "x".repeat(40) });
ok(r.status === 400, "verify: a made-up link is refused", r.status);
r = await post("/api/auth/verify", { token: A });
ok(r.status === 400, "verify: a device key is not accepted as a link", r.status);
ok((await sync(B)).status === 200 && (await sync(A)).status === 200, "both devices work side by side", null);

// ---- manager PIN
r = await post("/api/till/pin/unlock", { pin: "1234" }, { authorization: `Bearer ${A}` });
ok(r.status === 409, "pin: unlock before any PIN is set says so (409)", r.status);
r = await post("/api/till/pin/set", { pin: "12" }, { authorization: `Bearer ${A}` });
ok(r.status === 400, "pin: too short refused", r.status);
r = await post("/api/till/pin/set", { pin: "4821" });
ok(r.status === 401, "pin: setting needs a device key", r.status);
r = await post("/api/till/pin/set", { pin: "4821" }, { authorization: `Bearer ${A}` });
ok(r.status === 200, "pin: owner sets the PIN", r.status);
b = await (await sync(B)).json();
ok(b.pinSet === true, "pin: other devices learn that a PIN exists", b.pinSet);

r = await post("/api/till/pin/set", { pin: "9999" }, { authorization: `Bearer ${B}` });
ok(r.status === 403, "pin: staff cannot replace the PIN without knowing it", r.status);

// staff cannot change the menu; they can still sell
const bill = { id: "e2e-bill", updatedAt: t0, label: "Table 1", lines: [], discountPct: 0, servicePct: 0, vatMode: "none", subtotal: 10, discount: 0, service: 0, vat: 0, total: 10, method: "cash", paidAt: t0 };
const tA = new Date(Date.now() + 1000).toISOString();
b = await (await sync(B, { config: cfg("Staff rename", tA), paid: [bill] })).json();
ok(b.configRejected === true && b.paid.some((x) => x.id === "e2e-bill"), "pin: staff menu change rejected, but the sale is saved", { rej: b.configRejected, paid: b.paid?.length });

// wrong PINs, then the right one
let last;
for (let i = 1; i <= 2; i++) { last = await post("/api/till/pin/unlock", { pin: "0000" }, { authorization: `Bearer ${A}` }); }
b = await last.json();
ok(last.status === 401 && b.attemptsLeft === 3, "pin: wrong PIN counts down the tries left", b);
r = await post("/api/till/pin/unlock", { pin: "4821" }, { authorization: `Bearer ${A}` });
const unlock = await r.json();
ok(r.status === 200 && unlock.token?.startsWith("mg_"), "pin: right PIN gives a manager proof", unlock);

const tB = new Date(Date.now() + 2000).toISOString();
b = await (await sync(A, { config: cfg("Owner rename", tB) }, { "x-manager-token": unlock.token })).json();
ok(!b.configRejected, "pin: the manager can change settings", b);
b = await (await sync(B)).json();
ok(b.config?.profile.name === "Owner rename", "pin: other devices receive the manager's change", b.config?.profile?.name);

// the proof belongs to the device that earned it
const tC = new Date(Date.now() + 3000).toISOString();
b = await (await sync(B, { config: cfg("Stolen proof", tC) }, { "x-manager-token": unlock.token })).json();
ok(b.configRejected === true, "pin: a manager proof is useless on another device", b.configRejected);

// lockout
for (let i = 0; i < 5; i++) last = await post("/api/till/pin/unlock", { pin: "1111" }, { authorization: `Bearer ${B}` });
b = await last.json();
ok(last.status === 429 && b.retryAfterSec > 800, "pin: five wrong tries lock it for about 15 minutes", { status: last.status, b });
r = await post("/api/till/pin/unlock", { pin: "4821" }, { authorization: `Bearer ${A}` });
ok(r.status === 429, "pin: while locked even the right PIN is refused (on every device)", r.status);

// ---- landing page and search / AI files
r = await get("/en/");
let html = await r.text();
ok(r.status === 200 && /<h1[^>]*>[^<]*simple till/i.test(html), "landing: renders real content in HTML (no JavaScript needed)", r.status);
ok(/<link rel="canonical" href="https:\/\/[^"]+\/en\/"/.test(html) && html.includes('hreflang="th-TH"') && html.includes('hreflang="x-default"'), "landing: canonical and hreflang tags", null);
ok(html.includes('property="og:image"') && html.includes('og:image:width" content="1200"') && html.includes('twitter:card'), "landing: share tags with image size", null);
ok(html.includes("application/ld+json") && html.includes('"SoftwareApplication"') && html.includes('"FAQPage"') && html.includes('"priceCurrency":"THB"'), "landing: structured data (software, price, FAQ)", null);
for (const l of ["th", "fr", "de"]) {
  const h = await (await get(`/${l}/`)).text();
  ok(h.includes(`<html lang="${l}"`) && h.includes("<h1"), `landing: ${l} version served`, l);
}
r = await get("/en/app/");
ok((await r.text()).includes('content="noindex, nofollow"'), "the till page is kept out of search results", null);
r = await get("/robots.txt");
let txt = await r.text();
ok(r.status === 200 && r.headers.get("content-type").startsWith("text/plain") && txt.includes("Sitemap:") && txt.includes("User-agent: GPTBot") && txt.includes("User-agent: ClaudeBot") && txt.includes("Disallow: /api/"), "robots.txt: private paths blocked, AI crawlers named, sitemap linked", { s: r.status, ct: r.headers.get("content-type") });
r = await get("/sitemap.xml");
txt = await r.text();
const locs = [...txt.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const dates = [...txt.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
ok(r.status === 200 && r.headers.get("content-type").includes("xml") && locs.length === 12 && locs.every((u) => !/app|welcome|verify|api/.test(u)), "sitemap.xml: 12 public pages only (3 pages x 4 languages)", { n: locs.length });
ok(dates.every((d) => d <= new Date().toISOString().slice(0, 10)), "sitemap.xml: no date in the future", dates[0]);
r = await get("/llms.txt");
txt = await r.text();
ok(r.status === 200 && txt.includes("THB 499") && txt.includes("THB 299") && txt.includes("Thai, English, French, German"), "llms.txt: key facts match the product", r.status);
r = await get("/llms-full.txt");
txt = await r.text();
ok(r.status === 200 && txt.includes("Do I need a card machine?") && txt.includes("Rules and limits"), "llms-full.txt: FAQ and honest limits", r.status);
r = await get("/og.png");
const buf = Buffer.from(await r.arrayBuffer());
ok(r.status === 200 && r.headers.get("content-type") === "image/png" && buf.length > 10000 && buf.readUInt32BE(16) === 1200 && buf.readUInt32BE(20) === 630, "og.png: a real 1200x630 PNG (not an HTML fallback)", { type: r.headers.get("content-type"), bytes: buf.length });
r = await get("/favicon.svg");
ok(r.status === 200 && (await r.text()).startsWith("<svg"), "favicon is the project's own SVG", r.status);
r = await get("/api/health");
b = await r.json();
ok(r.status === 200 && b.ok === true, "health check: site up and database reachable", b);
r = await get("/does-not-exist.txt");
ok(r.status === 404, "a missing file is a real 404 (not a 200 fallback page)", r.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
