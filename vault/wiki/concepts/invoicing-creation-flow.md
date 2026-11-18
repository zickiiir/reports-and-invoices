---
title: Vznik faktury od plátce po uložený koncept
type: concept
domain: invoicing
status: current
tags: [flow, trpc, invoices, authorization]
created: 2026-10-11
updated: 2026-11-18
sources: [code-inspection]
related: [invoicing, invoicing-numbering, invoicing-dates-and-line-items, invoicing-invoices-and-items, invoicing-pdf-rendering, timesheet-disk-storage, access-role-visibility]
---

# Vznik faktury od plátce po uložený koncept

Uživatel vybere plátce a měsíc, appka vytvoří koncept s položkou za každý alias s hodinami, uživatel ho upraví a stáhne PDF.

## The Problem It Solves

Ruční fakturace znamená opisovat hodiny z výkazů. `createDraft` je opíše sám a editor dovolí upravit cokoli před vystavením.

## How It Works

### 1. Formulář nové faktury

- `src/app/(app)/invoices/new/page.tsx::NewInvoicePage` načte plátce a odběratele a plátce s `archived` vynechá.
- `src/app/(app)/invoices/new/new-invoice-form.tsx::NewInvoiceForm` nabízí plátce, měsíc plnění (default minulý měsíc), rok a konstantní symbol. Z query parametru `alias` předvybere plátce daného aliasu.
- Volba „Bez výkazu“ skryje měsíc a rok a ukáže „Datum vystavení“ (default dnes). Číselnou řadu pak určí rok data vystavení, viz [[invoicing-numbering]].
- Pod výběrem plátce vypíše aliasy, které faktura zahrne. Číslo a variabilní symbol ukazuje jako náhled z `invoice.previewNumber`.

### 2. `invoice.createDraft`

`src/server/api/routers/invoice.ts::invoiceRouter` (`createDraft`):

1. Načte plátce a zavolá `assertOwnerOrSuperUser(ctx.session.user, payer.userId)`.
2. Načte vlastníka (dodavatele) podle `payer.userId`, ne podle přihlášeného. Faktura tedy patří vlastníku plátce.
3. Vybere nearchivované odběratele plátce.
4. Spočítá data z pravidel vlastníka ([[invoicing-dates-and-line-items]]).
5. Jen u faktury z výkazu přečte surový výkaz `readTimesheetRaw(payer.userId, period)` a zparsuje ho `parseTimesheet`. Hodiny podle jména sekce jsou zdroj množství, viz [[timesheet-disk-storage]]. Faktura bez výkazu výkaz nečte a dostane jeden prázdný řádek.
   - Data faktury bez výkazu (`computeManualInvoiceDates`): vystavení i plnění = zadané datum, splatnost podle pravidel, jako by měsíc vystavení byl vykazovaný měsíc. `sourceYear`/`sourceMonth` = rok a měsíc vystavení, `fromTimesheet = false`.
6. Pro každého odběratele s hodinami > 0 vytvoří řádek. Pokud žádný alias nemá hodiny, vloží jeden prázdný řádek (množství 0) podle prvního odběratele, aby šel koncept hned upravit.
7. Součet = suma `round2(quantity * unitPrice - discount)`.
8. Rezervuje číslo ([[invoicing-numbering]]). Variabilní symbol default = číslo faktury.
9. Vloží `invoices` (stav `draft`) a `invoiceItems` a vrátí fakturu s plátcem a položkami.

Chybějící soubor výkazu v kroku 5 řeší `readTimesheetRaw`. Chování pro prázdný výkaz nebylo ověřováno.

### 3. Editor

- `src/app/(app)/invoices/[id]/page.tsx::InvoiceDetailPage` volá `invoice.get` (kontrola vlastníka) a při chybě vrací 404.
- `invoice-editor.tsx::InvoiceEditor` drží položky a metadata v lokálním stavu. Uložení volá `invoice.update` a pak `router.refresh()`. Bez refreshe by odznak stavu a tlačítko „Smazat“ ukazovaly stav z načtení stránky, protože `invoice` je prop ze serverové stránky.
- Přepínač „Faktura podle výkazu“ mění `fromTimesheet`. Bez něj editor nenabízí kartu „Výkazy k faktuře“. Seznam faktur ukazuje u takové faktury štítek „bez výkazu“.
- `invoice.update` přepočítá `totalAmount` na serveru, v transakci přepíše pole faktury a smaže a znovu vloží všechny položky (nové `id` řádků). Položek musí být alespoň jedna (`min(1)`).
- Editor nabízí PDF faktury (route [[invoicing-pdf-rendering]]) a PDF výkazů aliasů plátce za dané období. Aliasy bere z `timesheet.read` a z odběratelů plátce.
- `invoice.delete` povolí jen stav `draft`, jinak `BAD_REQUEST` „Smazat lze jen fakturu ve stavu koncept.“

### 4. Seznam

`invoices-list.tsx::InvoicesList` volá `invoice.list` s filtrem stavu (záložky Vše, Koncept, Vystavena, Zaplacena v query parametru `status`). Seznam řadí podle `createdAt` sestupně. Sloupec „Odběratel“ ukazuje `payer.companyName`.

## Implementation

Procedury `invoiceRouter`: `list`, `get`, `previewNumber`, `numberSequence`, `setNumberSequence`, `createDraft`, `update`, `delete`.

### Kontrola vlastnictví

Každá procedura volá `assertOwnerOrSuperUser` (viz [[access-role-visibility]]). Vlastníka bere z `payer.userId` nebo `invoice.userId`. `list` bere volitelné `userId`, default je přihlášený. `protectedProcedure` sama kontroluje jen přihlášení. `numberSequence` a `setNumberSequence` pracují vždy s přihlášeným uživatelem.

## Trade-offs

⚠️ `invoice.update` přijme libovolný `status` z enumu, bez pořadí `draft → issued → paid`. Vystavenou fakturu jde dál měnit a přepsat její položky.
⚠️ Po vystavení se neuzamyká číslo, data ani položky.
⚠️ `createDraft` nemá transakci (rezervace čísla, vložení faktury, vložení položek jsou tři příkazy).
⚠️ Datum v `update` je libovolný řetězec (`z.string()`), validuje až DB při zápisu do `date`.

## Related Concepts

- [[invoicing-invoices-and-items]] — struktura tabulek.
- [[invoicing-pdf-rendering]] — výstup faktury.
