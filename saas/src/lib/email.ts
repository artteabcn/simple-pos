import type { Locale } from "../i18n/utils";

export type MailEnv = {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
};

export type Mail = { to: string; subject: string; html: string };

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

type Button = { label: string; href: string };

/** Plain, table-based HTML that renders in every mail app. All text is escaped. */
function shell(title: string, body: string, buttons: Button[], footer: string): string {
  const btn = buttons
    .map(
      (b) =>
        `<tr><td style="padding-top:14px"><a href="${esc(b.href)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:700;font-size:16px">${esc(b.label)}</a></td></tr>`,
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#fafaf9;font-family:'Noto Sans Thai',Arial,sans-serif;color:#1c1917">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:22px;font-weight:800;color:#0f766e">Simple POS</td></tr>
<tr><td style="padding-top:20px;font-size:20px;font-weight:700">${esc(title)}</td></tr>
<tr><td style="padding-top:12px;font-size:16px;line-height:1.6;color:#44403c">${esc(body)}</td></tr>
${btn}
<tr><td style="padding-top:28px;font-size:12px;color:#78716c">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
}

const FOOTER: Record<Locale, string> = {
  en: "Simple POS by Arkadya.tech. If you did not expect this email, you can ignore it.",
  th: "Simple POS โดย Arkadya.tech หากคุณไม่ได้คาดหวังอีเมลนี้ สามารถเพิกเฉยได้",
  fr: "Simple POS par Arkadya.tech. Si vous n'attendiez pas cet e-mail, vous pouvez l'ignorer.",
  de: "Simple POS von Arkadya.tech. Wenn Sie diese E-Mail nicht erwartet haben, können Sie sie ignorieren.",
};

const LOGIN: Record<Locale, { subject: string; title: string; body: string; open: (shop: string) => string }> = {
  en: { subject: "Your Simple POS sign-in link", title: "Sign in to your till", body: "Press the button to open your till on this device. The link works once and for 15 minutes.", open: (s) => `Open ${s}` },
  th: { subject: "ลิงก์เข้าสู่ระบบ Simple POS", title: "เข้าสู่เครื่องคิดเงินของคุณ", body: "กดปุ่มเพื่อเปิดเครื่องคิดเงินบนอุปกรณ์นี้ ลิงก์ใช้ได้ครั้งเดียวและมีอายุ 15 นาที", open: (s) => `เปิด ${s}` },
  fr: { subject: "Votre lien de connexion Simple POS", title: "Connectez-vous à votre caisse", body: "Appuyez sur le bouton pour ouvrir votre caisse sur cet appareil. Le lien fonctionne une seule fois, pendant 15 minutes.", open: (s) => `Ouvrir ${s}` },
  de: { subject: "Ihr Simple-POS-Anmeldelink", title: "Bei Ihrer Kasse anmelden", body: "Tippen Sie auf die Schaltfläche, um Ihre Kasse auf diesem Gerät zu öffnen. Der Link funktioniert einmal und 15 Minuten lang.", open: (s) => `${s} öffnen` },
};

const WELCOME: Record<Locale, { subject: string; title: string; body: string; open: string }> = {
  en: { subject: "Your Simple POS till is ready", title: "Thank you, your payment was received", body: "Your till is ready. Press the button to open it on any phone or tablet. The link works once and for 15 minutes; you can always ask for a new one on the sign-in page.", open: "Open my till" },
  th: { subject: "เครื่องคิดเงิน Simple POS ของคุณพร้อมแล้ว", title: "ขอบคุณ เราได้รับการชำระเงินแล้ว", body: "เครื่องคิดเงินของคุณพร้อมใช้งาน กดปุ่มเพื่อเปิดบนมือถือหรือแท็บเล็ตเครื่องไหนก็ได้ ลิงก์ใช้ได้ครั้งเดียวและมีอายุ 15 นาที คุณขอลิงก์ใหม่ได้เสมอที่หน้าเข้าสู่ระบบ", open: "เปิดเครื่องคิดเงิน" },
  fr: { subject: "Votre caisse Simple POS est prête", title: "Merci, votre paiement a bien été reçu", body: "Votre caisse est prête. Appuyez sur le bouton pour l'ouvrir sur n'importe quel téléphone ou tablette. Le lien fonctionne une seule fois, pendant 15 minutes ; vous pouvez toujours en demander un nouveau sur la page de connexion.", open: "Ouvrir ma caisse" },
  de: { subject: "Ihre Simple-POS-Kasse ist bereit", title: "Vielen Dank, Ihre Zahlung ist eingegangen", body: "Ihre Kasse ist bereit. Tippen Sie auf die Schaltfläche, um sie auf einem beliebigen Handy oder Tablet zu öffnen. Der Link funktioniert einmal und 15 Minuten lang; auf der Anmeldeseite können Sie jederzeit einen neuen anfordern.", open: "Meine Kasse öffnen" },
};

export type ShopLink = { name: string; url: string };

export function loginMail(to: string, locale: Locale, links: ShopLink[]): Mail {
  const c = LOGIN[locale];
  return { to, subject: c.subject, html: shell(c.title, c.body, links.map((l) => ({ label: c.open(l.name), href: l.url })), FOOTER[locale]) };
}

export function welcomeMail(to: string, locale: Locale, url: string): Mail {
  const c = WELCOME[locale];
  return { to, subject: c.subject, html: shell(c.title, c.body, [{ label: c.open, href: url }], FOOTER[locale]) };
}

export type SendResult = { sent: boolean };

/** Sends through Resend. Without an API key nothing is sent (local development). Never throws: a mail problem must not break a payment. */
export async function sendMail(env: MailEnv, mail: Mail, fetchFn: typeof fetch = fetch): Promise<SendResult> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.log(`[email] not sent (no RESEND_API_KEY): "${mail.subject}" to ${mail.to}`);
    return { sent: false };
  }
  try {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {}),
      }),
    });
    if (!res.ok) console.error("Resend error", res.status);
    return { sent: res.ok };
  } catch (e) {
    console.error("Resend failed", e instanceof Error ? e.message : e);
    return { sent: false };
  }
}
