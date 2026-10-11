---
title: Předvyplnění dat a položek faktury
type: concept
domain: invoicing
status: current
tags: [dates, line-items, defaults]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [invoicing, invoicing-creation-flow, invoicing-invoices-and-items, invoicing-payers-and-customers]
---

# Předvyplnění dat a položek faktury

Datum vystavení, DUZP a splatnost se počítají z období výkazu podle pravidel uživatele. Položka faktury vzniká z hodin za alias v období.

## The Problem It Solves

Uživatel fakturuje každý měsíc stejným způsobem. Appka mu data a text položky předvyplní a on je v editoru jen upraví.

## How It Works

### Data

- `src/server/invoicing/dates.ts::computeInvoiceDates` bere `{ year, month }` období (měsíc 1–12) a pravidla `InvoiceDateRules`.
- Pravidlo (`DateRule` v `src/server/db/schema.ts`) má dva tvary:
  - `lastDayOfPeriodMonth` — poslední den měsíce výkazu.
  - `dayOfNextMonth` s `day` — dané číslo dne v měsíci po období. Den mimo rozsah měsíce (31. v únoru) se ořízne na konec měsíce (`resolveDateRule`).
- Výchozí pravidla `defaultInvoiceDateRules`: vystavení a DUZP poslední den období, splatnost 15. následujícího měsíce.
- Pravidla jsou jsonb sloupec `users.invoiceDateRules`. Když je `null`, `createDraft` použije výchozí.
- Výstup: `issueDate`, `dueDate`, `performanceDate` jako `YYYY-MM-DD` a `periodLabel` s českým názvem měsíce (`MONTH_NAMES_CS`, např. „Červenec“).
- Vstupní `period` je měsíc výkazu (odpracovaný), ne měsíc vystavení. Docstring v kódu mluví o „faktuře za červenec“ s datem vystavení 30. června, tedy o výkazu za červen. Počítá se vždy od měsíce výkazu.

### Text položky

- `src/server/invoicing/line-item.ts::applyLineItemTemplate` nahradí `{alias}` v šabloně. Bez šablony použije `DEFAULT_LINE_ITEM_TEMPLATE` = `Dle výkazu {alias}`.
- Šablona je `users.defaultLineItemTemplate`. Odběratel nese vlastní `customers.defaultLineItemText`, ten má přednost.
- `customer.create` (`src/server/api/routers/customer.ts`) text a sazbu doplní při založení odběratele z uživatelských výchozích hodnot (`users.defaultLineItemTemplate`, `users.defaultHourlyRate`).

### Položka z hodin

Pro každého nearchivovaného odběratele plátce, který má v období hodiny, vznikne jeden řádek: `name` = text odběratele nebo šablona, `quantity` = hodiny aliasu z parseru výkazu, `unitPrice` = `customers.defaultHourlyRate` (nebo 0). Detail v [[invoicing-creation-flow]].

## Implementation

- `src/server/invoicing/dates.ts::computeInvoiceDates`, `::defaultInvoiceDateRules`.
- `src/server/invoicing/line-item.ts::applyLineItemTemplate`, `::DEFAULT_LINE_ITEM_TEMPLATE`.
- Volání: `src/server/api/routers/invoice.ts::invoiceRouter` (`createDraft`).

## Trade-offs

⚠️ Hodiny aliasu se párují podle shody `customers.alias` se jménem sekce ve výkazu. Jiný zápis aliasu ve výkazu hodiny nenajde.
⚠️ Předvyplněná data jsou jen výchozí hodnoty. Po uložení konceptu se z pravidel nepřepočítávají.

## Related Concepts

- [[invoicing-numbering]] — číslo se také odvozuje z období.
- [[invoicing-payers-and-customers]] — zdroj sazby a textu.
