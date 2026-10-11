---
title: Plátci a odběratelé (payers, customers)
type: entity
domain: invoicing
status: current
tags: [data-model, payers, customers]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [invoicing, invoicing-invoices-and-items, invoicing-payer-groups-customer-aliases, access-role-visibility, platform-db-schema-overview]
---

# Plátci a odběratelé (payers, customers)

`payers` je skutečný fakturační subjekt, `customers` je alias z výkazu (např. `AC1`) podřízený jednomu plátci.

## Overview

- **Purpose**: plátce nese údaje pro blok „Odběratel“ na faktuře, odběratel nese sazbu a text položky pro alias.
- **Path**: `src/server/db/schema.ts::payers`, `src/server/db/schema.ts::customers`.
- **Status**: aktivní. Prefix tabulek je `reports_and_invoices_` (`src/server/db/schema.ts::createTable`), viz [[platform-db-schema-overview]].

## Tables

### `payers` (`reports_and_invoices_payer`)

- `userId` — vlastník (dodavatel), FK na `users`, `onDelete: cascade`.
- `companyName` (povinné), `street`, `city`, `zip`, `ico`, `dic` — fakturační údaje, vše kromě názvu volitelné.
- `archived` — boolean, default `false`.
- Index `payer_user_idx` na `userId`.

### `customers` (`reports_and_invoices_customer`)

- `userId` — vlastník, FK `cascade`.
- `payerId` — povinný FK na `payers`, `onDelete: restrict` (plátce s odběrateli nejde smazat).
- `alias` — `varchar(64)`, musí odpovídat jménu sekce ve výkazu.
- `defaultHourlyRate` — `numeric(10,2)`, volitelná sazba Kč/h.
- `defaultLineItemText` — `varchar(255)`, text položky faktury.
- `archived` — boolean, default `false`.
- Unikátní `customer_user_alias_unique` na `(userId, alias)` — alias je unikátní u jednoho dodavatele, ne globálně. Indexy `customer_user_idx`, `customer_payer_idx`.

Migrace: `drizzle/0000_charming_valkyrie.sql::customer_user_alias_unique`.

## Entities & Models

Relace v `src/server/db/schema.ts::payersRelations` (`user`, `customers`, `invoices`) a `customersRelations` (`user`, `payer`).

## Správa přes routery

- `src/server/api/routers/payer.ts::payerRouter` — `list`, `get`, `create`, `update`, `setArchived`. Název plátce musí být neprázdný.
- `src/server/api/routers/customer.ts::customerRouter` — stejné procedury. `customerInput` ořízne alias (`trim`) a převede na VELKÁ písmena, max 64 znaků.
- `customer.create` doplní chybějící `defaultLineItemText` z uživatelské šablony (`applyLineItemTemplate`) a chybějící sazbu z `users.defaultHourlyRate`, viz [[invoicing-dates-and-line-items]].
- Archivace je jediný způsob vyřazení. Kód nemá `delete` pro plátce ani odběratele. UI vypíná přepínač „aktivní“ a volá `setArchived` (`src/app/(app)/payers/payers-table.tsx`, `src/app/(app)/customers/customers-table.tsx`).
- Archivovaní odběratelé se při tvorbě faktury přeskakují (`invoice.createDraft` filtruje `customers.archived = false`).

## Autorizace

`list` bere volitelné `userId` a volá `assertOwnerOrSuperUser`. Čtení a změny kontrolují vlastníka přes `payer.userId` nebo `customer.userId`. Pravidla rolí viz [[access-role-visibility]].

⚠️ `payer.create` a `customer.create` zapisují `userId: ctx.session.user.id`, tedy přihlášeného uživatele. `customer.create` ověří vlastníka plátce, takže super_user zakládající odběratele pod cizím plátcem vytvoří řádek s vlastním `userId` a cizím `payerId`. Zda je to záměr, kód nedokládá.

⚠️ `customer.update` ani `payer.update` při změně `payerId` neověřují vlastníka cílového plátce. Změna `payerId` jde přes `customerInput.partial()`.

## Relationships

- [[invoicing-invoices-and-items]] — `invoices.payerId` ukazuje na `payers` (`restrict`).
- [[invoicing-payer-groups-customer-aliases]] — proč jeden plátce zastřešuje víc aliasů.
- [[invoicing]] — doména.
