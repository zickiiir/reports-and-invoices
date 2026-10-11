---
title: Číslování faktur
type: concept
domain: invoicing
status: current
tags: [numbering, concurrency, drizzle]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [invoicing, invoicing-invoices-and-items, invoicing-creation-flow]
---

# Číslování faktur

Číslo faktury se přiděluje atomickým upsertem do tabulky `invoiceNumberCounters`, bez explicitního zamykání.

## The Problem It Solves

Dvě souběžné žádosti nesmí dostat stejné číslo. Starý postup četl logy (`logs/invoicesXX20YY.log`), komentář v `src/server/invoicing/numbering.ts::reserveInvoiceNumber` říká, že kód nahrazuje logiku z `functions.php`.

## How It Works

- Klíč řady `period` (`numberingPeriodKey`): scope `month` dává `YYYYMM`, scope `year` dává `YYYY`.
- Scope je sloupec `users.invoiceNumberingScope` vlastníka faktury, default `month`.
- `reserveInvoiceNumber` volá `INSERT ... (userId, period, lastSequence = 1) ON CONFLICT (userId, period) DO UPDATE SET lastSequence = lastSequence + 1 RETURNING lastSequence`. Jeden příkaz vloží nebo zvýší řádek, takže Postgres souběh serializuje na unikátním klíči.
- Číslo = `period` + pořadí doplněné na 2 číslice, např. `20260701` (měsíční řada) nebo `202603` (roční řada, 3. faktura roku).
- `padStart(2, "0")` nic neořezává: od 100. faktury v řadě má pořadí 3 číslice.

## Implementation

- `src/server/invoicing/numbering.ts::numberingPeriodKey`, `::reserveInvoiceNumber`, `::setInvoiceNumberSequence`.
- `src/server/db/schema.ts::invoiceNumberCounters` — unikátní `(userId, period)` je cíl `onConflictDoUpdate`, viz [[invoicing-invoices-and-items]].
- `src/server/api/routers/invoice.ts::invoiceRouter`:
  - `createDraft` volá `reserveInvoiceNumber` s `year`/`month` období výkazu (`sourceYear`, `sourceMonth`), ne s datem vystavení.
  - `previewNumber` a `numberSequence` jen čtou počítadlo a vrací další číslo, nic nerezervují.
  - `setNumberSequence` ručně přepíše „poslední použité číslo“ (0–99) přes `setInvoiceNumberSequence`, určeno pro opravu v nastavení (např. přechod z jiného systému uprostřed roku).

## Trade-offs

⚠️ Rezervace není v jedné transakci s vložením faktury. Pokud `insert` faktury selže po rezervaci, vznikne v řadě díra.
⚠️ Smazání konceptu (`invoice.delete`) počítadlo nesnižuje, číslo se znovu nepoužije.
⚠️ `previewNumber` je jen náhled. Mezi náhledem a `createDraft` může číslo vzít jiná žádost.
⚠️ Při změně `invoiceNumberingScope` zůstanou stará počítadla pod starými klíči. Kód je nemigruje.
⚠️ `setNumberSequence` povoluje jen 0–99, i když `reserveInvoiceNumber` umí víc.

## Related Concepts

- [[invoicing-creation-flow]] — kdy se číslo rezervuje.
- [[invoicing-dates-and-line-items]] — druhá věc předvyplněná z období.
