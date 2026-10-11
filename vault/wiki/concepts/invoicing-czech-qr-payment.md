---
title: QR platba (SPD) na faktuře
type: concept
domain: invoicing
status: current
tags: [qr, spd, iban, security]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [invoicing, invoicing-pdf-rendering, access-security-invariants]
---

# QR platba (SPD) na faktuře

Faktura nese QR kód ve formátu české QR Platby (SPD 1.0), který banka načte jako platební příkaz.

## The Problem It Solves

Odběratel zaplatí bez opisování účtu, částky a variabilního symbolu. Pole jsou ale z části uživatelská, takže řetězec nesmí jít zmanipulovat.

## How It Works

1. `src/app/api/invoices/[id]/pdf/route.ts::GET` zavolá `generateQrPaymentDataUrl`, jen když má dodavatel `bankAccount` i `bankCode` a `totalAmount > 0`. Zpráva pro příjemce je `Faktura <číslo>`.
2. `src/server/pdf/czech-payment.ts::czechAccountToIban` převede číslo účtu `[předčíslí-]číslo/kód banky` na IBAN:
   - kód banky musí mít 4 číslice, předčíslí se doplní na 6 a číslo na 10 číslic,
   - kontrolní číslice = `98 - mod97(BBAN + "123500")` (CZ00 přepsáno na čísla).
   - Neplatný vstup vrací `null`, a pak se QR nevytvoří.
3. `generateQrPaymentDataUrl` složí řetězec oddělený `*`: `SPD*1.0`, `ACC:<IBAN>`, `AM:<částka na 2 desetinná místa>`, `CC:CZK`, volitelně `X-VS:<VS>` a `MSG:<zpráva>`.
4. `QRCode.toDataURL(spd, { margin: 1, width: 160 })` vrátí PNG data URI. Šablona ho vloží do `<img>` s popiskem „QR platba“ (`invoice-template.ts::renderInvoiceHtml`), velikost 125 px.

## Implementation

- `src/server/pdf/czech-payment.ts::czechAccountToIban`, `::generateQrPaymentDataUrl`, `::sanitizeSpdText`.
- Variabilní symbol faktury je default číslo faktury (`invoice.createDraft`) a jde změnit v editoru. Je to tedy uživatelské pole.
- Konstantní symbol se do SPD nedostane, jen do PDF.

### Sanitizace

`sanitizeSpdText`:

- normalizuje do NFD a odstraní diakritiku (SPD povoluje jen ASCII),
- nahradí `*` a `:` mezerou, aby šlo vložit další pole (např. jiný `ACC`),
- ořízne na 60 znaků.

Použije se na `X-VS` i `MSG`. Bez toho by VS typu `1*ACC:CZ...` přepsal cílový účet. Invariant viz [[access-security-invariants]].

## Trade-offs

⚠️ `sanitizeSpdText` nezakazuje jiné znaky než `*` a `:` (např. nealfanumerické ASCII znaky zůstanou). Zda je to pro čtečky banky problém, kód neřeší.
⚠️ Měna je pevně `CZK`, jen české účty (IBAN s prefixem `CZ`).
⚠️ Chyba generování se v route spolkne (`.catch(() => null)`), PDF pak vznikne bez QR bez upozornění.
⚠️ `czech-payment.ts` je `server-only`, šablona dostává QR jako hotový data URI přes `InvoicePdfData.qrDataUrl`.

## Related Concepts

- [[invoicing-pdf-rendering]] — kam se QR vkládá a jak se escapuje atribut `src`.
