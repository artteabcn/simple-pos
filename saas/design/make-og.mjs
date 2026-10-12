// Renders public/og.png (1200x630): the picture shown when the site is shared on LINE, Facebook, WhatsApp...
// Thai headline (primary market), brand, and a QR code to the site. Run from the mirror folder:
//   node design/make-og.mjs            (uses PUBLIC_SITE_URL, default https://pos.arkadya.tech)
// Then decode public/og.png with a QR reader to prove the code scans (see MEMORY.HTML).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import QRCode from "qrcode";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const site = (process.env.PUBLIC_SITE_URL ?? "https://pos.arkadya.tech").replace(/\/+$/, "");
const target = `${site}/th/`;
const edge = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find((p) => {
  try {
    execFileSync(p, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});
if (!edge) throw new Error("No Edge or Chrome found to render the image");

const qr = await QRCode.toString(target, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0c4a45", light: "#ffffff" } });

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#fafaf9;font-family:"Leelawadee UI","Noto Sans Thai","Segoe UI",sans-serif;color:#1c1917;position:relative;overflow:hidden}
.band{position:absolute;left:0;top:0;bottom:0;width:22px;background:#0f766e}
.wrap{position:absolute;left:84px;top:70px;right:70px;bottom:60px;display:flex;justify-content:space-between;gap:56px}
.left{display:flex;flex-direction:column;justify-content:space-between;width:700px}
.brand{font-size:42px;font-weight:800;color:#0f766e;letter-spacing:-.5px}
h1{font-size:76px;line-height:1.2;font-weight:800;letter-spacing:-1px}
.sub{font-size:36px;color:#44403c;margin-top:22px;line-height:1.35}
.right{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}
.qr{width:300px;height:300px;background:#fff;border-radius:28px;padding:14px;box-shadow:0 30px 60px -30px rgba(15,118,110,.45);border:2px solid #e7e5e4}
.qr svg{width:100%;height:100%;display:block}
.url{font-size:26px;font-weight:700;color:#0f766e}
.chips{display:flex;gap:12px;margin-top:6px}
.chip{background:#ccfbf1;color:#115e59;border-radius:999px;padding:8px 20px;font-size:26px;font-weight:700}
</style></head><body><div class="band"></div><div class="wrap">
<div class="left"><div class="brand">Simple POS</div>
<div><h1>เครื่องคิดเงินง่าย ๆ<br>สำหรับร้านของคุณ</h1><p class="sub">แตะรายการ รับเงินสดหรือพร้อมเพย์ พิมพ์ใบเสร็จ</p></div>
<div class="chips"><span class="chip">ไทย</span><span class="chip">English</span><span class="chip">Français</span><span class="chip">Deutsch</span></div></div>
<div class="right"><div class="qr">${qr}</div><div class="url">${new URL(site).host}</div></div>
</div></body></html>`;

const out = join(root, "public", "og.png");
mkdirSync(dirname(out), { recursive: true });
const tmp = join(here, "og.html");
writeFileSync(tmp, html);
execFileSync(edge, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1200,630", `--screenshot=${out}`, pathToFileURL(tmp).href], { stdio: "ignore" });
console.log("wrote", out, "for", target);
