---
title: Fakturace
type: domain
domain: invoicing
status: current
tags: [domain, invoicing, pdf]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [invoicing-payers-and-customers, invoicing-invoices-and-items, invoicing-numbering, invoicing-dates-and-line-items, invoicing-creation-flow, invoicing-pdf-rendering, invoicing-czech-qr-payment, invoicing-payer-groups-customer-aliases, timesheet, access]
---

# Fakturace

Faktury za odpracované hodiny: plátci a odběratelé (aliasy z výkazu), číselná řada, předvyplnění dat, PDF s QR platbou.

## Overview

- **Purpose**: z hodin ve výkazu za období vytvořit koncept faktury pro plátce, upravit ho a vygenerovat PDF.
- **Path**: `src/server/invoicing/`, `src/server/pdf/`, `src/server/api/routers/invoice.ts`, `payer.ts`, `customer.ts`, `src/app/(app)/invoices|payers|customers/`, `src/app/api/invoices/[id]/pdf/route.ts`.
- **Status**: aktivní, jediná měna je CZK (`invoices.currency`), dodavatel je neplátce DPH (pevný text v šabloně, viz [[invoicing-pdf-rendering]]).

## Key Responsibilities

- Správa plátců a odběratelů ([[invoicing-payers-and-customers]]).
- Uložení faktury a položek ([[invoicing-invoices-and-items]]).
- Atomické přidělení čísla faktury ([[invoicing-numbering]]).
- Předvyplnění dat a textu položky ([[invoicing-dates-and-line-items]]).
- Celý postup od plátce po uloženou fakturu ([[invoicing-creation-flow]]).
- HTML šablona a render PDF ([[invoicing-pdf-rendering]]), QR platba ([[invoicing-czech-qr-payment]]).

## How It Fits

- Hodiny za alias čte z výkazu na disku, viz [[timesheet]] a [[timesheet-disk-storage]]. Fakturace nic do výkazu nezapisuje.
- Každý router a PDF route kontrolují vlastnictví přes `assertOwnerOrSuperUser`, viz [[access]] a [[access-role-visibility]].
- Údaje dodavatele (adresa, účet, podpis, pravidla dat, rozsah číslování) jsou sloupce tabulky `users`, viz [[platform-db-schema-overview]].

## Documentation Map

- [[invoicing-payers-and-customers]] — tabulky `payers` a `customers`
- [[invoicing-invoices-and-items]] — `invoices`, `invoiceItems`, `invoiceNumberCounters`, enumy
- [[invoicing-numbering]] — číselná řada
- [[invoicing-dates-and-line-items]] — data a text položky
- [[invoicing-creation-flow]] — procedury `invoiceRouter` a UI
- [[invoicing-pdf-rendering]] — šablona, Puppeteer, XSS
- [[invoicing-czech-qr-payment]] — SPD řetězec a QR
- [[invoicing-payer-groups-customer-aliases]] — proč faktura vzniká za plátce
- [[invoicing-flat-tax-income-by-due-date]] — pásmo paušální daně počítá příjem podle data splatnosti
- [[access-security-invariants]] — bezpečnostní invarianty (escapování, SPD)

## Known Issues / Not Yet Documented

- Číslo se rezervuje mimo transakci s vložením faktury, smazání konceptu číslo nevrací, viz [[invoicing-numbering]].
- Kód neomezuje přechody stavů faktury, viz [[invoicing-creation-flow]].
- `pdf-examples/` obsahuje jen ukázková PDF, ne kód.

## Otevřené issues

- [[invoicing-numbering-gaps]] — Číselná řada faktur: díry, žádné vracení čítače a přetečení formátu
- [[invoicing-status-and-data-rules]] — Stavy faktur bez kontroly přechodů, nepoužívaná měna, volné datumy
- [[invoicing-pdf-signature-and-qr-errors]] — PDF: nekontrolovaná URL podpisu a tiché selhání QR
