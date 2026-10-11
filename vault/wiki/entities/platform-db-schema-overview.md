---
title: Přehled DB schématu
type: entity
domain: platform
status: current
tags: [data-model, drizzle, postgres, migrations]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [platform, platform-env-variables, platform-dev-environment, platform-docker-production, access-users-and-roles, invoicing-invoices-and-items]
---

# Přehled DB schématu

Mapa všech tabulek a enumů v Postgresu. Detaily polí jsou na stránkách [[access-users-and-roles]] a [[invoicing-invoices-and-items]].

## Overview

- **Purpose**: jediný zdroj pravdy o struktuře DB.
- **Path**: `src/server/db/schema.ts`, `src/server/db/index.ts`, `drizzle.config.ts`, `drizzle/`.
- **Status**: aktivní.

## Prefix a casing

- Všechny tabulky vznikají přes `createTable = pgTableCreator(name => "reports_and_invoices_" + name)` (`src/server/db/schema.ts::createTable`). Díky tomu může DB sdílet instanci s jinými projekty.
- Enumy mají ve jménu stejný prefix, např. `reports_and_invoices_user_role`.
- `casing: "snake_case"` musí být shodné v `drizzle.config.ts` a v `src/server/db/index.ts::db`. TS pole jsou camelCase, sloupce snake_case. Při rozdílu by se app a `drizzle-kit` neshodly na názvech sloupců.
- `drizzle.config.ts` má `tablesFilter: ["reports_and_invoices_*"]` a záměrně neimportuje `~/env` (CLI běží mimo Next.js, alias `~` nefunguje). Vyžaduje jen `DATABASE_URL`.

## Tabulky

| Tabulka (bez prefixu) | Export | Obsah |
|---|---|---|
| `user` | `users` | dodavatelé, přihlašovací údaje, role, `managerId`, fakturační údaje, předvolby editoru a vzhledu, Nextcloud konfigurace |
| `payer` | `payers` | plátce (skutečný fakturační subjekt); patří uživateli |
| `customer` | `customers` | odběratel = alias z výkazu; patří uživateli a plátci |
| `invoice` | `invoices` | hlavička faktury |
| `invoice_item` | `invoiceItems` | položky faktury |
| `invoice_number_counter` | `invoiceNumberCounters` | poslední pořadové číslo na uživatele a období |

Nejsou tu žádné tabulky NextAuth — session je JWT a adaptér se nepoužívá (`src/server/db/schema.ts::users` komentář).

## Vztahy

- `users.managerId` → `users.id`, `onDelete: set null` (hierarchie senior → podřízení).
- `payers.userId`, `customers.userId`, `invoices.userId`, `invoiceNumberCounters.userId` → `users.id`, `onDelete: cascade`.
- `customers.payerId` a `invoices.payerId` → `payers.id`, `onDelete: restrict` (plátce s odběrateli nebo fakturami nejde smazat).
- `invoiceItems.invoiceId` → `invoices.id`, `onDelete: cascade`.
- Unikátní: `customer_user_alias_unique (userId, alias)`, `invoice_user_number_unique (userId, number)`, `invoice_number_counter_unique (userId, period)`. Indexy na `userId` a `payerId`.

## Enumy

| Enum | Hodnoty |
|---|---|
| `userRoleEnum` | `super_user`, `senior_programmer`, `developer` |
| `invoiceStatusEnum` | `draft`, `issued`, `paid` |
| `editorKeybindingEnum` | `emacs`, `vim` |
| `cursorStyleEnum` | `line`, `block` |
| `colorSchemeEnum` | `auto`, `light`, `dark` |
| `primaryColorEnum` | `blue`, `indigo`, `violet`, `grape`, `pink`, `red`, `orange`, `teal`, `green` |
| `invoiceNumberingScopeEnum` | `month`, `year` |

Typy `UserRole`, `EditorKeybinding`, `ColorSchemePreference`, `CursorStyle`, `InvoiceNumberingScope`, `PrimaryColor` se odvozují z `enumValues`, takže se dají importovat i do klientských komponent bez tahání `postgres` klienta.

## JSON a nestandardní sloupce na `users`

- `invoiceDateRules` (jsonb, typ `InvoiceDateRules`) — pravidla předvyplnění dat faktury.
- `workdays` (jsonb `number[]`, default `[1,2,3,4,5]`), `hoursPerWorkday`, `monthlyHoursGoal` — widget minimální vytíženosti.
- `nextcloudUrl`, `nextcloudUsername`, `nextcloudAppPasswordEnc`, `nextcloudRemotePath`, `nextcloudSyncedPeriods` (jsonb `string[]`) — viz [[nextcloud-sync-conflict-handling]].

## Co v DB není

- **Výkazy.** Surový text a vygenerované HTML leží na disku pod `DATA_DIR/{userId}/{YYYYMM}/` (`src/server/timesheet/storage.ts`, validace `UUID_RE` a `PERIOD_RE`). DB drží jen odvozená metadata. Viz [[timesheet]].
- Session (JWT), rate limit loginu (in-memory).

## Migrace

- Skripty: `db:generate` (`drizzle-kit generate`), `db:migrate` (`drizzle-kit migrate`), `db:push` (`drizzle-kit push`), `db:studio` (`package.json::scripts`).
- **Vývoj** synchronizuje schéma přes `db:push` (lokálně ručně, v `docker-compose.dev.yml` automaticky s `--force` — jednorázová dev DB, jinak by `push` čekal na interaktivní potvrzení).
- **Produkce** spouští `drizzle-kit migrate` v `docker-entrypoint.sh` při každém startu kontejneru.
- Adresář `drizzle/` obsahuje jedinou migraci `0000_charming_valkyrie.sql` a journal `drizzle/meta/_journal.json` s jedním záznamem. Obsahuje všech 6 tabulek a 7 enumů.

⚠️ Riziko: protože se ve vývoji používá `db:push`, změna `schema.ts` se do produkce dostane jen tehdy, když se před nasazením spustí `pnpm db:generate` a vygenerovaná migrace se commitne. Bez toho `drizzle-kit migrate` v produkci nic nezmění. V repu není kontrola, která by to hlídala (nenalezena).

## Relationships

- [[access-users-and-roles]] — tabulka `user`, role, hierarchie.
- [[invoicing-invoices-and-items]] — `invoice`, `invoice_item`, čítače.
- [[platform-env-variables]] — `DATABASE_URL`.
- [[platform-docker-production]] — migrace v entrypointu.
- [[platform]] — doména.
