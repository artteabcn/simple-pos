/**
 * Legal texts for Simple POS, adapted from Resumai's (CVarkadya/src/content/legal.ts): same company, same structure.
 * Written in Thai and English; French and German visitors see the English text with a note.
 * DRAFT for the owner's review: change the wording freely, but keep TERMS_VERSION in step so that the
 * acceptance recorded at sign-up says which text the customer agreed to.
 */
export const COMPANY = {
  legalName: "Thai Online Solutions Co., Ltd.",
  legalNameTh: "บริษัท ไทย ออนไลน์ โซลูชั่นส์ จำกัด",
  brand: "Arkadya.tech",
  product: "Simple POS",
  email: "hello@arkadya.tech",
  address: "Khanom, Nakhon Si Thammarat 80210, Thailand",
  addressTh: "อำเภอขนอม จังหวัดนครศรีธรรมราช 80210",
  /** DBD (Department of Business Development) registration / tax ID, as published in Resumai's legal pages. */
  taxId: "0845567012791",
  updated: "2026-10-04",
};

/** The date of the current Terms and Privacy Policy. Stored with every sign-up. */
export const TERMS_VERSION = COMPANY.updated;

export type LegalKind = "terms" | "privacy" | "refunds";
type Doc = { title: string; html: string };

const c = COMPANY;

export const LEGAL: Record<LegalKind, { th: Doc; en: Doc }> = {
  terms: {
    th: {
      title: "ข้อกำหนดการใช้งาน",
      html: `
<p>ปรับปรุงล่าสุด: ${c.updated}</p>
<p>${c.product} (“บริการ”) ให้บริการโดย ${c.brand} ซึ่งดำเนินการโดย ${c.legalNameTh} (“บริษัท”) การสมัครหรือใช้บริการถือว่าคุณยอมรับข้อกำหนดนี้</p>
<h2>1. บริการ</h2><p>${c.product} เป็นเครื่องคิดเงิน (POS) บนเว็บสำหรับร้านอาหารและร้านค้าเล็ก ๆ ใช้จัดการเมนู สร้างบิล บันทึกการชำระเงิน (เงินสด พร้อมเพย์ บัตร) พิมพ์ใบเสร็จ ดูประวัติการขาย และดาวน์โหลดข้อมูล รองรับภาษาไทย อังกฤษ ฝรั่งเศส และเยอรมัน บริการนี้ <strong>บันทึก</strong>การขายของคุณ ไม่ได้รับชำระเงินแทนคุณ ลูกค้าจ่ายเงินให้คุณโดยตรง (เงินสด บัญชีพร้อมเพย์ของคุณ หรือเครื่องรูดบัตรของคุณ)</p>
<h2>2. บัญชี อุปกรณ์ และ PIN</h2><ul><li>คุณเข้าสู่ระบบด้วยลิงก์ที่ส่งไปยังอีเมลของคุณ โปรดรักษาความปลอดภัยของอีเมลนั้น</li><li>อุปกรณ์แต่ละเครื่องมีกุญแจของตัวเอง คุณรับผิดชอบการใช้งานบนอุปกรณ์ของคุณและพนักงานของคุณ หากอุปกรณ์สูญหาย โปรดแจ้งเรา เราสามารถปิดการใช้งานอุปกรณ์นั้นได้</li><li>PIN ผู้จัดการป้องกันการแก้ไขเมนู ราคา และการตั้งค่า คุณรับผิดชอบการเก็บ PIN ให้ปลอดภัย</li><li>บริษัทอาจระงับบัญชีที่ใช้งานผิดวัตถุประสงค์</li></ul>
<h2>3. ข้อมูลของคุณ</h2><p>คุณเป็นเจ้าของข้อมูลร้านของคุณ (เมนู ราคา บิล การตั้งค่า) เราเก็บข้อมูลนี้เพื่อให้บริการ และคุณดาวน์โหลดยอดขายเป็นสเปรดชีตได้ทุกเมื่อ คุณรับผิดชอบความถูกต้องของราคา การตั้งค่า VAT และใบเสร็จ รวมถึงภาระทางภาษีของร้านคุณ ใบเสร็จจากบริการนี้ไม่รับประกันว่าตรงตามข้อกำหนดของใบกำกับภาษีทุกกรณี โปรดปรึกษานักบัญชีของคุณ</p>
<h2>4. การชำระเงิน</h2><ul><li>ค่าติดตั้งบริการเป็นการชำระครั้งเดียวต่อร้าน และบริการปรับแต่งเพิ่มเติมเป็นทางเลือก ราคาแสดงเป็นเงินบาทก่อนที่คุณจะชำระ</li><li>การชำระเงินดำเนินการผ่าน Stripe (พร้อมเพย์หรือบัตร)</li><li>บริการปรับแต่ง: คุณแจ้งความต้องการผ่านแบบฟอร์มหรือ LINE และเราตกลงขอบเขตงานกับคุณทางอีเมลหรือ LINE</li><li>บริษัทอาจเปลี่ยนราคาสำหรับลูกค้าใหม่ได้ตลอดเวลา การเปลี่ยนราคาไม่มีผลต่อร้านที่ชำระเงินแล้ว</li></ul>
<h2>5. การให้บริการและการใช้งานแบบออฟไลน์</h2><p>บริการให้ “ตามสภาพ” เราพยายามให้บริการต่อเนื่องแต่ไม่รับประกันว่าจะไม่หยุดชะงัก เมื่อไม่มีอินเทอร์เน็ต ยอดขายจะถูกบันทึกในอุปกรณ์ก่อนและส่งเข้าบัญชีของคุณเมื่อเชื่อมต่อได้อีกครั้ง โปรดอย่าล้างข้อมูลเบราว์เซอร์ของอุปกรณ์ก่อนที่ยอดขายจะถูกส่ง หากเราจะปิดบริการ เราจะแจ้งล่วงหน้าอย่างน้อย 30 วันทางอีเมล และให้คุณดาวน์โหลดข้อมูลของคุณได้</p>
<h2>6. การใช้งานที่เหมาะสม</h2><p>ห้ามใช้บริการในทางที่ผิดกฎหมาย ห้ามพยายามหลบเลี่ยงหรือทำลายระบบความปลอดภัย และห้ามนำบริการไปขายต่อหรือให้บริการแก่บุคคลอื่นโดยไม่ได้รับอนุญาต</p>
<h2>7. ทรัพย์สินทางปัญญา</h2><p>ซอฟต์แวร์และแบรนด์ ${c.product} เป็นทรัพย์สินของบริษัท คุณได้รับสิทธิ์ใช้บริการสำหรับร้านของคุณ ข้อมูลของร้านเป็นของคุณ</p>
<h2>8. การระงับและการสิ้นสุด</h2><p>บริษัทอาจระงับหรือยุติบัญชีที่ใช้งานผิดข้อกำหนด เมื่อมีการคืนเงินเต็มจำนวน เครื่องคิดเงินจะถูกปิดใช้งาน (ดู นโยบายการคืนเงิน) คุณขอให้ลบบัญชีและข้อมูลได้ทุกเมื่อ</p>
<h2>9. ข้อจำกัดความรับผิด</h2><p>บริษัทไม่รับประกันยอดขาย ผลทางภาษี หรือผลลัพธ์ทางธุรกิจ และรับผิดไม่เกินจำนวนเงินที่คุณชำระใน 12 เดือนล่าสุด</p>
<h2>10. การเปลี่ยนแปลงข้อกำหนด</h2><p>เราอาจปรับปรุงข้อกำหนดนี้ โดยจะระบุวันที่ปรับปรุงไว้ที่ด้านบน การใช้บริการต่อหลังการปรับปรุงถือว่าคุณยอมรับข้อกำหนดที่ปรับปรุงแล้ว</p>
<h2>11. กฎหมายที่ใช้บังคับ</h2><p>ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย</p>
<h2>12. ติดต่อ</h2><p>${c.legalNameTh} · ${c.addressTh} · เลขทะเบียนนิติบุคคล/เลขประจำตัวผู้เสียภาษี ${c.taxId} · ${c.email}</p>`,
    },
    en: {
      title: "Terms of Service",
      html: `
<p>Last updated: ${c.updated}</p>
<p>${c.product} (the “Service”) is provided by ${c.brand}, operated by ${c.legalName} (the “Company”). By signing up or using the Service you agree to these terms.</p>
<h2>1. The Service</h2><p>${c.product} is a web-based point of sale (till) for restaurants and small shops. It lets you manage a menu, build bills, record payments (cash, PromptPay, card), print receipts, see your sales history and download your data, in Thai, English, French and German. The Service <strong>records</strong> your sales; it does not collect payments for you. Your customers pay you directly (cash, your own PromptPay account, your own card machine).</p>
<h2>2. Account, devices and PIN</h2><ul><li>You sign in with a link sent to your email address. Keep that mailbox secure.</li><li>Each device has its own key. You are responsible for activity on your and your staff’s devices. If a device is lost, tell us and we can switch it off.</li><li>The manager PIN protects the menu, prices and settings. Keeping it safe is your responsibility.</li><li>We may suspend accounts that are used abusively.</li></ul>
<h2>3. Your data</h2><p>You own your shop’s data (menu, prices, bills, settings). We store it to provide the Service, and you can download your sales as a spreadsheet at any time. You are responsible for the accuracy of your prices, VAT settings and receipts and for your shop’s tax obligations. Receipts produced by the Service are not guaranteed to meet every tax-invoice rule; please check with your accountant.</p>
<h2>4. Payment</h2><ul><li>The setup fee is a one-time payment per shop; curated customisation is an optional extra. Prices are in Thai Baht and shown before you pay.</li><li>Payments are processed by Stripe (PromptPay or card).</li><li>Customisation: you tell us what you need through the request form or LINE, and we agree the scope with you by email or LINE.</li><li>We may change prices for new customers at any time. A price change does not affect a shop that has already paid.</li></ul>
<h2>5. Availability and offline use</h2><p>The Service is provided “as is”. We work to keep it running but cannot promise it will never be interrupted. Without internet, sales are saved on the device first and sent to your account when the connection returns; please do not clear the browser data of a device before its sales have been sent. If we ever close the Service we will give at least 30 days’ notice by email and let you download your data.</p>
<h2>6. Acceptable use</h2><p>Do not use the Service for anything unlawful, try to break or bypass its security, or resell it or provide it to others without permission.</p>
<h2>7. Intellectual property</h2><p>The software and the ${c.product} brand belong to the Company. You receive the right to use the Service for your shop. Your shop’s data remains yours.</p>
<h2>8. Suspension and ending</h2><p>We may suspend or end an account that breaks these terms. After a full refund the till is switched off (see the Refund Policy). You may ask us to delete your account and data at any time.</p>
<h2>9. Limitation of liability</h2><p>We do not guarantee sales, tax outcomes or business results. Our liability is limited to the amount you paid in the last 12 months.</p>
<h2>10. Changes to these terms</h2><p>We may update these terms and will show the date of the latest update at the top. If you keep using the Service after an update, you accept the updated terms.</p>
<h2>11. Governing law</h2><p>These terms are governed by the laws of Thailand.</p>
<h2>12. Contact</h2><p>${c.legalName} · ${c.address} · DBD / Tax ID ${c.taxId} · ${c.email}</p>`,
    },
  },
  privacy: {
    th: {
      title: "นโยบายความเป็นส่วนตัว",
      html: `
<p>ปรับปรุงล่าสุด: ${c.updated}</p>
<p>${c.legalNameTh} (“ผู้ควบคุมข้อมูล”) ให้ความสำคัญกับข้อมูลส่วนบุคคลของคุณตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)</p>
<h2>ข้อมูลที่เราเก็บ</h2><ul><li>ข้อมูลบัญชี: อีเมลและชื่อร้านที่คุณให้ตอนสมัคร ภาษาที่เลือก</li><li>ข้อมูลร้าน: เมนูและราคา และรายละเอียดที่คุณเลือกกรอก เช่น ที่อยู่ เบอร์โทร เลขประจำตัวผู้เสียภาษี หมายเลขพร้อมเพย์</li><li>ข้อมูลการขาย: รายการในบิล จำนวนเงิน วิธีชำระ เวลา และข้อความที่คุณพิมพ์เอง เช่น ชื่อโต๊ะหรือชื่อลูกค้า</li><li>ข้อมูลอุปกรณ์: ชื่ออุปกรณ์ที่ตั้งตอนเข้าสู่ระบบและเวลาที่ใช้งานล่าสุด</li><li>คำขอบริการปรับแต่ง: ชื่อ อีเมล เบอร์โทรหรือ LINE ID และรายละเอียดที่คุณเขียน</li><li>ข้อมูลการชำระเงิน: ประมวลผลโดย Stripe เราเก็บเพียงรหัสรายการ จำนวนเงิน และเวลา ไม่เก็บเลขบัตร</li><li>ข้อมูลทางเทคนิค เช่น IP เพื่อความปลอดภัย</li></ul>
<h2>ข้อมูลลูกค้าของคุณ</h2><p>หากคุณพิมพ์ชื่อลูกค้าลงในบิล คุณเป็นผู้ควบคุมข้อมูลนั้น และเราประมวลผลแทนคุณเพื่อให้บริการเท่านั้น โปรดพิมพ์เท่าที่จำเป็น</p>
<h2>วัตถุประสงค์</h2><p>เพื่อให้บริการเครื่องคิดเงิน เก็บและซิงก์ข้อมูลระหว่างอุปกรณ์ ประมวลผลการชำระเงิน ส่งอีเมลที่เกี่ยวข้องกับบัญชี ตอบคำขอของคุณ และป้องกันการใช้งานผิดวัตถุประสงค์ ฐานทางกฎหมาย: การปฏิบัติตามสัญญา และประโยชน์โดยชอบด้วยกฎหมายด้านความปลอดภัย เราไม่ขายข้อมูลของคุณและไม่แสดงโฆษณา</p>
<h2>ผู้ประมวลผลข้อมูล</h2><p>Cloudflare (โฮสติ้งและฐานข้อมูล), Stripe (ชำระเงิน), Resend (อีเมล), LINE (หากคุณติดต่อเราทาง LINE) ข้อมูลอาจถูกประมวลผลนอกประเทศไทยภายใต้มาตรการคุ้มครองที่เหมาะสม</p>
<h2>ระยะเวลาเก็บรักษา</h2><p>เก็บตราบเท่าที่บัญชียังใช้งาน และลบภายใน 30 วันหลังคุณขอลบบัญชี ยกเว้นข้อมูลธุรกรรมการชำระเงินที่กฎหมายกำหนดให้เก็บ หลังการคืนเงิน เราเก็บข้อมูลการขายของคุณไว้เพื่อให้คุณขอสำเนาได้ และลบเมื่อคุณขอ</p>
<h2>สิทธิของคุณ</h2><p>คุณมีสิทธิขอเข้าถึง แก้ไข ลบ โอนย้าย คัดค้าน หรือถอนความยินยอม และร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล ติดต่อ ${c.email}</p>
<h2>คุกกี้และที่เก็บข้อมูลในเบราว์เซอร์</h2><p>เราไม่ใช้คุกกี้ติดตามหรือโฆษณา เครื่องคิดเงินเก็บข้อมูลร้านของคุณ กุญแจอุปกรณ์ และภาษาที่เลือกไว้ในเบราว์เซอร์ของอุปกรณ์ เพื่อให้ใช้งานได้แม้ไม่มีอินเทอร์เน็ต</p>`,
    },
    en: {
      title: "Privacy Policy",
      html: `
<p>Last updated: ${c.updated}</p>
<p>${c.legalName} (the “Controller”) protects your personal data in accordance with Thailand’s Personal Data Protection Act B.E. 2562 (PDPA).</p>
<h2>Data we collect</h2><ul><li>Account data: the email address and shop name you give at sign-up, and your language</li><li>Shop data: your menu and prices, and details you choose to enter such as address, phone number, tax ID and PromptPay number</li><li>Sales data: bill items, amounts, payment method, times, and text you type yourself such as a table or customer name</li><li>Device data: the device name set when signing in and when it was last used</li><li>Customisation requests: your name, email, phone or LINE ID and the details you write</li><li>Payment data: processed by Stripe; we keep only the payment reference, amount and time and never store card numbers</li><li>Technical data such as IP address, for security</li></ul>
<h2>Your customers’ data</h2><p>If you type customers’ names on bills, you are the controller of that data and we process it on your behalf, only to provide the Service. Please type only what you need.</p>
<h2>Purposes</h2><p>To provide the till, store and sync your data between devices, process payments, send account emails, answer your requests and prevent abuse. Legal bases: performance of contract, and legitimate interest in security. We do not sell your data and we do not show advertising.</p>
<h2>Processors</h2><p>Cloudflare (hosting and database), Stripe (payments), Resend (email), LINE (if you contact us there). Data may be processed outside Thailand with appropriate safeguards.</p>
<h2>Retention</h2><p>We keep data while your account is active and delete it within 30 days of an account-deletion request, except payment transaction records we must keep by law. After a refund we keep your sales data so you can ask for a copy, and delete it when you ask.</p>
<h2>Your rights</h2><p>You may request access, correction, deletion, portability, object, or withdraw consent, and complain to the PDPC. Contact ${c.email}.</p>
<h2>Cookies and browser storage</h2><p>We use no tracking or advertising cookies. The till stores your shop data, the device key and your language in the device’s browser so that it keeps working without internet.</p>`,
    },
  },
  refunds: {
    th: {
      title: "นโยบายการคืนเงิน",
      html: `
<p>ปรับปรุงล่าสุด: ${c.updated}</p>
<ul><li>คุณขอคืนเงินค่าติดตั้งเต็มจำนวนได้ภายใน 14 วันหลังชำระเงิน</li><li>บริการปรับแต่งขอคืนเงินได้หากเรายังไม่ได้เริ่มงาน</li><li>หลังคืนเงินเต็มจำนวน เครื่องคิดเงินของคุณจะถูกปิดใช้งานโดยอัตโนมัติ ข้อมูลการขายของคุณยังถูกเก็บไว้ คุณขอสำเนาข้อมูลหรือขอให้ลบได้</li><li>หากชำระเงินแล้วแต่เข้าใช้งานไม่ได้ กรุณาติดต่อเรา เราจะแก้ไขให้ภายใน 2 วันทำการ</li></ul>
<p>ติดต่อ ${c.email} หรือ LINE พร้อมอีเมลที่ใช้สมัคร การคืนเงินจะกลับไปยังช่องทางชำระเงินเดิม (พร้อมเพย์อาจคืนผ่านการโอนเงิน)</p>`,
    },
    en: {
      title: "Refund Policy",
      html: `
<p>Last updated: ${c.updated}</p>
<ul><li>You can ask for a full refund of the setup fee within 14 days of paying.</li><li>Curated customisation can be refunded if we have not started work.</li><li>After a full refund your till is switched off automatically. Your sales data is kept; you can ask for a copy or ask us to delete it.</li><li>If you paid but cannot get in, contact us and we will fix it within 2 business days.</li></ul>
<p>Contact ${c.email} or LINE with the email you signed up with. Refunds go back to the original payment method (PromptPay refunds may be made by bank transfer).</p>`,
    },
  },
};

/** The Thai text for Thai visitors, the English text for everyone else (French and German get a note on the page). */
export function legalDoc(kind: LegalKind, locale: string): { doc: Doc; translated: boolean } {
  const lang = locale === "th" ? "th" : "en";
  return { doc: LEGAL[kind][lang], translated: locale === "th" || locale === "en" };
}
