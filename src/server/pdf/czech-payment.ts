import "server-only";

import QRCode from "qrcode";

/**
 * Converts a Czech account number (prefix-number/bankCode) to an IBAN following the
 * standard ČNB (Czech National Bank) algorithm (mod-97 checksum over the rearranged
 * BBAN + "CZ00").
 */
export function czechAccountToIban(
  accountNumber: string,
  bankCode: string,
): string | null {
  const cleanBank = bankCode.replace(/\s/g, "");
  if (!/^\d{4}$/.test(cleanBank)) return null;

  const cleanAccount = accountNumber.replace(/\s/g, "");
  const [prefixRaw, baseRaw] = cleanAccount.includes("-")
    ? cleanAccount.split("-")
    : ["0", cleanAccount];
  const prefix = (prefixRaw ?? "0").padStart(6, "0");
  const base = (baseRaw ?? "").padStart(10, "0");
  if (!/^\d{6}$/.test(prefix) || !/^\d{10}$/.test(base)) return null;

  const bban = cleanBank + prefix + base; // 20 digits
  // Move "CZ00" to the end and convert the letters to numbers (C=12, Z=35), then mod 97.
  const rearranged = `${bban}123500`; // CZ00 -> C=12,Z=35,0,0
  const remainder = mod97(rearranged);
  const checkDigits = String(98 - remainder).padStart(2, "0");

  return `CZ${checkDigits}${bban}`;
}

function mod97(numericString: string): number {
  let remainder = 0;
  for (const digit of numericString) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}

/**
 * Builds a QR Platba SPD string (the Czech/Slovak bank payment standard) and returns
 * it as a PNG data URI that can be inserted directly into <img src>.
 *
 * @see https://qr-platba.cz/pro-vyvojare/specifikace-formatu/
 */
export async function generateQrPaymentDataUrl(params: {
  accountNumber: string;
  bankCode: string;
  amount: number;
  variableSymbol?: string | null;
  message?: string;
}): Promise<string | null> {
  const iban = czechAccountToIban(params.accountNumber, params.bankCode);
  if (!iban) return null;

  const parts = [
    "SPD*1.0",
    `ACC:${iban}`,
    `AM:${params.amount.toFixed(2)}`,
    "CC:CZK",
  ];
  // sanitizeSpdText strips "*"/":" — without this, variableSymbol (a user-editable
  // field on the invoice) could be used to inject another field into the SPD string,
  // e.g. a different ACC.
  if (params.variableSymbol) parts.push(`X-VS:${sanitizeSpdText(params.variableSymbol)}`);
  if (params.message) parts.push(`MSG:${sanitizeSpdText(params.message)}`);

  const spd = parts.join("*");
  return QRCode.toDataURL(spd, { margin: 1, width: 160 });
}

function sanitizeSpdText(text: string): string {
  // SPD only allows ASCII (diacritics need to be stripped) and disallows "*"/":".
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[*:]/g, " ")
    .slice(0, 60);
}
