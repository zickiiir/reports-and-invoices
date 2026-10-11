---
title: PDF faktury (HTML šablona a Puppeteer)
type: concept
domain: invoicing
status: current
tags: [pdf, puppeteer, xss, template]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [invoicing, invoicing-czech-qr-payment, invoicing-creation-flow, access-security-invariants]
---

# PDF faktury (HTML šablona a Puppeteer)

Faktura se vykreslí do HTML řetězce a headless Chromium (Puppeteer) z něj udělá A4 PDF.

## The Problem It Solves

Faktura musí být tisknutelný daňový doklad s QR platbou. HTML šablona jde snadno stylovat a Puppeteer ji převede na PDF bez dalších knihoven.

## How It Works

1. `src/app/api/invoices/[id]/pdf/route.ts::GET` ověří přihlášení (`auth()`, jinak 401).
2. Načte fakturu s plátcem a položkami (404, když neexistuje) a zavolá `assertOwnerOrSuperUser(session.user, invoice.userId)` (jinak 403).
3. Načte dodavatele z `users` podle `invoice.userId`, ne podle přihlášeného uživatele. PDF super_usera obsahuje údaje majitele faktury.
4. Pokud má dodavatel `bankAccount` a `bankCode` a částka je větší než 0, vygeneruje QR (`generateQrPaymentDataUrl`, chyba se spolkne a QR se vynechá), viz [[invoicing-czech-qr-payment]].
5. `src/server/pdf/invoice-template.ts::renderInvoiceHtml` poskládá HTML z `InvoicePdfData`. Položky se řadí podle `position`.
6. `src/server/pdf/render.ts::renderHtmlToPdf` otevře stránku, nastaví obsah (`waitUntil: "load"`) a vyrobí PDF formátu A4 s nulovými okraji a `printBackground`.
7. Odpověď má `Content-Type: application/pdf` a `Content-Disposition: inline; filename="Faktura-<číslo>.pdf"`.

UI otevře URL v `ReportPreviewModal` (`src/app/(app)/invoices/[id]/invoice-editor.tsx::openInvoicePreview`).

### Obsah šablony

- Hlavička „Faktura – daňový doklad“, období („Fakturováno za“) a číslo.
- Bloky Dodavatel a Odběratel (plátce `companyName`, adresa, IČ, DIČ).
- Mřížka: datum vystavení, splatnosti, uskutečnění plnění, forma úhrady, variabilní a konstantní symbol (jen když jsou vyplněné).
- Tabulka položek s pevným rozložením (`table-layout: fixed`, `colgroup`), aby se číselné sloupce neposouvaly podle délky textu.
- Součet „Celkem k úhradě“ v Kč, číslo účtu, text „Neplátce DPH“, podpis (obrázek) a QR.
- Poznámka pod tabulkou, když je vyplněná.

### Forma úhrady

Šablona vždy tiskne pevný text „Bankovním převodem“ (`invoice-template.ts::renderInvoiceHtml`, pole `Forma úhrady`). Není to pole faktury ani nastavení. Změnu na výslovný bankovní převod nese commit `6e3203f` („spell out the payment method on the invoice as bank transfer“). Další zdůvodnění se v dokumentaci projektu nenašlo. Pro tuto změnu proto není samostatná decision stránka.

## Implementation

- `src/server/pdf/invoice-template.ts::renderInvoiceHtml`, `::InvoicePdfData`.
- `src/server/pdf/render.ts::renderHtmlToPdf`, `::getBrowser` — jedna sdílená instance prohlížeče v `globalThis.browser`, protože start Chromia je drahý. Spouští se s `--no-sandbox --disable-setuid-sandbox`, `executablePath` z `env.PUPPETEER_EXECUTABLE_PATH`.
- `render.ts` i `czech-payment.ts` začínají `import "server-only"`. `invoice-template.ts` tento import nemá.
- `pdf-examples/` ve složce repa obsahuje ukázková PDF (`202609.pdf`, `HV - Výkaz 202607.pdf`), kód ne.

## Obrana proti injekci do HTML

Chromium běží bez sandboxu (nutné bez dodatečných Docker capabilities), takže escapování je jediná obrana proti injekci do vykreslovaného HTML. Invarianty viz [[access-security-invariants]].

- `escapeHtml` nahrazuje `&`, `<`, `>`. Používá se pro všechny textové hodnoty (jméno, adresa, IČ, DIČ, telefon, e-mail, název položky, symboly, číslo, období, poznámka, číslo účtu).
- `escapeAttr` = `escapeHtml` plus `"` → `&quot;`. Používá se pro hodnoty v atributu `src` (`supplier.signatureImageUrl`, `data.qrDataUrl`). Bez toho by šel atribut předčasně uzavřít a vložit spustitelné HTML/JS.
- Číselné hodnoty jdou přes `money` a `toLocaleString`, `vatRate` se vkládá jako číslo (v route přes `Number(...)`).
- `signatureImageUrl` je sloupec `users.signatureImageUrl` (text), po escapování se z něj stane `src` obrázku. Jaké schéma URL smí obsahovat, kód nekontroluje. Chromium proto může načíst libovolnou URL, kterou si dodavatel zvolí. ⚠️ Nejasné: zda to je záměr (odkaz na obrázek podpisu) a zda je to riziko pro SSRF z kontejneru. Ověřit.

## Trade-offs

⚠️ `puppeteer.launch` je lazy a výsledek se drží v globálu. Při pádu Chromia kód prohlížeč znovu nespouští (neověřeno, žádné odpojení `disconnected` v kódu).
⚠️ Neexistuje rate limit na generování PDF.
⚠️ Jazyk a měna jsou pevné (`cs-CZ`, „Kč“), i když `invoices.currency` existuje.

## Related Concepts

- [[invoicing-czech-qr-payment]] — QR v patičce.
- [[invoicing-creation-flow]] — odkud se PDF otevírá.
