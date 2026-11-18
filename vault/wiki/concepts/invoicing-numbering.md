---
title: Číslování faktur
type: concept
domain: invoicing
status: current
tags: [numbering, concurrency, drizzle]
created: 2026-10-11
updated: 2026-11-18
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

### Volná čísla a předvýběr

- Volné číslo = pořadí 1..`lastSequence`, které nemá žádná faktura uživatele s číslem tvaru `${period}NN` (`src/server/invoicing/free-numbers.ts::freeSequences`). Vzniká zpětným zadáním faktury, smazáním faktury níž v řadě nebo selháním vložení.
- `getNumberingState` (`numbering.ts`) vrací `next`, `free` a `suggested`. `invoice.previewNumber` je posílá do formuláře nové faktury (`src/app/(app)/invoices/new/new-invoice-form.tsx`), který při existenci volných čísel ukáže výběr místo zašedlého náhledu.
- `suggestFreeSequence` předvybírá podle data vystavení (`issueDate`), ne podle měsíce výkazu. Pořadí v řadě má odpovídat pořadí vystavení a faktura bez výkazu může sdílet měsíc s fakturou z výkazu:
  - Existuje faktura vystavená později → jde se zpětně, předvybere se nejmenší díra mezi posledním číslem vystaveným do cílového data a prvním číslem vystaveným po něm (leden, když 02–13 jsou obsazené → 01).
  - Příklad 2025: `202503` vystavena 31. 3., `202505` za dubnový výkaz 30. 4., volná `202504` → faktura bez výkazu s datem 15. 4. dostane `202504`.
  - Faktura vystavená ve stejný den se řadí za existující.
  - Žádná faktura vystavená později → jde se dopředu, předvybere se jen díra nad posledním použitým číslem (smazaný koncept), jinak `next`.
  - Faktury bez `issueDate` se do porovnání nepočítají.
  - Bez jediné faktury v řadě se nic nepředvybírá: ručně posunutý čítač (přechod z jiného systému) by jinak nabízel čísla, která použil starý systém.
- `createDraft` přijme volitelné `number`, ale jen pokud ho server sám znovu spočítá jako volné; čítač se nemění. Souběh o stejné volné číslo zachytí unikátní `invoice_user_number_unique` (chyba `23505` → `CONFLICT`).

### Vrácení čísla při smazání

- `invoice.delete` volá v jedné transakci se smazáním `releaseInvoiceNumber`: `UPDATE ... SET lastSequence = seq - 1 WHERE lastSequence = seq`. Čítač se vrátí jen tehdy, když mazaný koncept držel poslední číslo řady, a jen o jeden krok — ne až k nejvyššímu použitému číslu, ze stejného důvodu jako výše (ručně nastavený čítač).
- Koncept bez `sourceYear`/`sourceMonth` nejde přiřadit k řadě, čítač se nemění. Faktura bez výkazu má `sourceYear`/`sourceMonth` z data vystavení, takže se vrací stejně.
- Předvýběr si nic neukládá, vždy se počítá z faktur, které v DB jsou. Smazání tak nemá co rozbít.

## Implementation

- `src/server/invoicing/numbering.ts::numberingPeriodKey`, `::reserveInvoiceNumber`, `::setInvoiceNumberSequence`, `::getNumberingState`, `::releaseInvoiceNumber`.
- `src/server/invoicing/free-numbers.ts::formatInvoiceNumber`, `::freeSequences`, `::suggestFreeSequence` — čisté funkce bez importu DB, aby je vitest načetl (nemá alias `~`); testy v `free-numbers.test.ts`.
- `src/server/db/schema.ts::invoiceNumberCounters` — unikátní `(userId, period)` je cíl `onConflictDoUpdate`, viz [[invoicing-invoices-and-items]].
- `src/server/api/routers/invoice.ts::invoiceRouter`:
  - `createDraft` a `previewNumber` berou `source`: buď `{ fromTimesheet: true, sourceYear, sourceMonth }`, nebo `{ fromTimesheet: false, issueDate }`. `resolveDraftSource` z něj odvodí rok a měsíc řady a data faktury. U výkazu řadu určuje období výkazu, bez výkazu datum vystavení.
  - `previewNumber` a `numberSequence` jen čtou počítadlo, nic nerezervují. `previewNumber` vrací `{ next, free, suggested, issueDate }`.
  - `setNumberSequence` ručně přepíše „poslední použité číslo“ (0–99) přes `setInvoiceNumberSequence`, určeno pro opravu v nastavení (např. přechod z jiného systému uprostřed roku).

## Trade-offs

⚠️ Rezervace není v jedné transakci s vložením faktury. Pokud `insert` faktury selže po rezervaci, vznikne v řadě díra (formulář ji pak nabídne jako volné číslo).
⚠️ Smazání konceptu níž v řadě čítač nevrací; číslo zůstane díra, kterou formulář nabídne jako volnou.
⚠️ Volná čísla pod ručně posunutým čítačem se nabízejí ve výběru (ne předvybraná) — mohl je použít předchozí systém.
⚠️ `previewNumber` je jen náhled. Mezi náhledem a `createDraft` může číslo vzít jiná žádost.
⚠️ Při změně `invoiceNumberingScope` zůstanou stará počítadla pod starými klíči. Kód je nemigruje.
⚠️ `setNumberSequence` povoluje jen 0–99, i když `reserveInvoiceNumber` umí víc.

## Related Concepts

- [[invoicing-creation-flow]] — kdy se číslo rezervuje.
- [[invoicing-dates-and-line-items]] — druhá věc předvyplněná z období.
