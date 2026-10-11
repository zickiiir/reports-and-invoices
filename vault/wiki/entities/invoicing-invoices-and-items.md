---
title: Faktury a položky (invoices, invoiceItems, invoiceNumberCounters)
type: entity
domain: invoicing
status: current
tags: [data-model, invoices, enums]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [invoicing, invoicing-payers-and-customers, invoicing-numbering, invoicing-creation-flow, platform-db-schema-overview]
---

# Faktury a položky (invoices, invoiceItems, invoiceNumberCounters)

Tři tabulky pro fakturu, její řádky a počítadlo čísel, plus dva enumy.

## Overview

- **Purpose**: uložit fakturu, její položky a stav číselné řady.
- **Path**: `src/server/db/schema.ts::invoices`, `::invoiceItems`, `::invoiceNumberCounters`, `::invoiceStatusEnum`, `::invoiceNumberingScopeEnum`.
- **Status**: aktivní. Všechny tabulky a enumy mají prefix `reports_and_invoices_` (`createTable` v `src/server/db/schema.ts`). Celková mapa schématu: [[platform-db-schema-overview]].
- Výkazy samotné v DB nejsou, leží na disku ([[timesheet-disk-storage]]).

## Tables

### `invoices` (`reports_and_invoices_invoice`)

- `userId` — vlastník (dodavatel), FK `cascade`. `payerId` — FK na `payers`, `restrict`.
- `number` — `varchar(20)`, unikátní spolu s `userId` (`invoice_user_number_unique`).
- `variableSymbol`, `constantSymbol` — `varchar(30)`, volitelné.
- `issueDate`, `dueDate`, `performanceDate` — `date`, volitelné (vystavení, splatnost, DUZP).
- `periodLabel` — `varchar(32)`, český název měsíce („Červenec“).
- `sourceYear`, `sourceMonth` — období výkazu, ze kterého faktura vznikla. Editor z nich znovu odvodí výkazy k faktuře.
- `status` — `invoiceStatusEnum`, default `draft`.
- `currency` — `varchar(3)`, default `CZK`. Kód ji nikde nemění ani nezobrazuje, PDF píše vždy „Kč“.
- `totalAmount` — `numeric(12,2)`, default `0`. Přepočítává se při každém `createDraft` a `update` na serveru, ne z klienta.
- `note` (text), `createdAt`, `updatedAt`. Indexy `invoice_user_idx`, `invoice_payer_idx`.

### `invoiceItems` (`reports_and_invoices_invoice_item`)

- `invoiceId` — FK `cascade` (smazání faktury smaže řádky).
- `position` — pořadí řádku, `name` (`varchar(500)`), `quantity`, `unitPrice`, `discount`, `vatRate` (`numeric(5,2)`), `total` (`numeric(12,2)`).
- Řádek nemá vazbu na alias ani odběratele. Jméno položky jde přejmenovat, vazba se odvozuje znovu z plátce a období (komentář v `src/app/(app)/invoices/[id]/invoice-editor.tsx`).
- Index `invoice_item_invoice_idx`.

### `invoiceNumberCounters` (`reports_and_invoices_invoice_number_counter`)

- `userId` (FK `cascade`), `period` (`varchar(6)`), `lastSequence` (integer, default `0`).
- Unikátní `invoice_number_counter_unique` na `(userId, period)`. Tabulka nemá primární klíč, cílem upsertu je právě tato dvojice. Mechanismus v [[invoicing-numbering]].

Migrace: `drizzle/0000_charming_valkyrie.sql` (`invoice_user_number_unique`, `invoice_number_counter_unique`).

## Entities & Models

- `invoiceStatusEnum` (`reports_and_invoices_invoice_status`): `draft` (koncept), `issued` (vystavena), `paid` (zaplacena). Popisky v `src/app/(app)/invoices/[id]/invoice-editor.tsx::STATUS_LABEL`.
  - Mazat jde jen `draft` (`invoice.delete`).
  - Jinak kód stavy nijak neomezuje: `invoice.update` přijme libovolný stav z enumu.
- `invoiceNumberingScopeEnum` (`reports_and_invoices_invoice_numbering_scope`): `month` (default) nebo `year`. Je to sloupec `users.invoiceNumberingScope`, ne faktury.
- Relace: `invoicesRelations` (`user`, `payer`, `items`), `invoiceItemsRelations` (`invoice`).
- Částky jsou v DB `numeric` a drizzle je vrací jako řetězce, router převádí `String(...)` / `Number(...)`.

## Relationships

- [[invoicing-payers-and-customers]] — plátce faktury.
- [[invoicing-creation-flow]] — jak řádky vznikají a mění se.
- [[invoicing-numbering]] — pole `number` a počítadlo.
- [[invoicing]] — doména.
