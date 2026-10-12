/** CRC-16/CCITT-FALSE as required by EMVCo QR (poly 0x1021, init 0xFFFF). */
export function crc16(s: string): string {
  let c = 0xffff;
  for (let i = 0; i < s.length; i++) {
    c ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
  }
  return c.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * PromptPay payload (EMV merchant-presented QR) for a phone number (10 digits) or a
 * 13-digit citizen / tax ID. Returns "" when the id is empty or not a valid length.
 */
export function promptPayPayload(rawId: string, amount: number): string {
  const id = rawId.replace(/\D/g, "");
  if (id.length !== 10 && id.length !== 13) return "";
  const isPhone = id.length === 10;
  const acc = isPhone ? "0066" + id.slice(1) : id;
  const sub = (isPhone ? "01" : "02") + String(acc.length).padStart(2, "0") + acc;
  const aidAndSub = "0016A000000677010111" + sub;
  const mi = "29" + String(aidAndSub.length).padStart(2, "0") + aidAndSub;
  const amt = amount.toFixed(2);
  const amtTag = "54" + String(amt.length).padStart(2, "0") + amt;
  const noCrc = "000201010212" + mi + "5802TH5303764" + amtTag + "6304";
  return noCrc + crc16(noCrc);
}
