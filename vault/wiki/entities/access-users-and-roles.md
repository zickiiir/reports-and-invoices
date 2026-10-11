---
title: Uživatelé a role (tabulka users)
type: entity
domain: access
status: current
tags: [data-model, users, roles]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [access, access-role-visibility, access-user-administration, platform-db-schema-overview, nextcloud-password-encryption]
---

# Uživatelé a role (tabulka users)

Tabulka `users` drží účet, roli, hierarchii, údaje dodavatele pro fakturaci, osobní nastavení a Nextcloud konfiguraci. Uživatel je zároveň „dodavatel“ faktur.

## Overview

- **Purpose**: účty a jejich nastavení; vlastník dat v `payers`, `customers`, `invoices`.
- **Path**: `src/server/db/schema.ts::users`, `userRoleEnum`; zápisy v `src/server/api/routers/user.ts::userRouter`.
- **Status**: aktivní. Název v DB má prefix `reports_and_invoices_` (`createTable`). Mapa celého schématu: [[platform-db-schema-overview]].

## Tables

`users` (`src/server/db/schema.ts::users`):

| Skupina | Sloupce |
|---|---|
| Účet | `id` (uuid), `email` (unique), `passwordHash` (bcrypt), `name` (jméno/firma na faktuře), `firstName`, `lastName` (jen pro admin přehled, u starších účtů mohou chybět) |
| Role | `role` (`userRoleEnum`: `super_user`, `senior_programmer`, `developer`, default `developer`), `managerId` (self-FK na `users.id`, `onDelete: set null`) |
| Fakturační údaje dodavatele | `street`, `city`, `zip`, `ico`, `dic`, `phone`, `invoiceEmail`, `bankAccount`, `bankCode`, `signatureImageUrl` (text, data URL) |
| Fakturace | `invoiceDateRules` (jsonb `InvoiceDateRules`), `invoiceNumberingScope` (`month`/`year`), `defaultLineItemTemplate`, `defaultHourlyRate` |
| Editor | `editorKeybinding` (`emacs`/`vim`), `cursorStyle` (`line`/`block`), `showLineNumbers` |
| Vzhled | `colorScheme` (`auto`/`light`/`dark`), `primaryColor` (9 hodnot z `primaryColorEnum`) |
| Vytížení | `workdays` (jsonb `number[]`, ISO 1–7, default Po–Pá), `hoursPerWorkday` (default 8), `monthlyHoursGoal` (null = dosažitelné maximum) |
| Nextcloud | `nextcloudUrl`, `nextcloudUsername`, `nextcloudAppPasswordEnc` (AES-256-GCM, viz [[nextcloud-password-encryption]]), `nextcloudRemotePath`, `nextcloudSyncedPeriods` (jsonb `string[]`) |
| Časy | `createdAt`, `updatedAt` |

`usersRelations`: `manager` (one) a `subordinates` (many) přes `managerId`, dále `payers`, `customers`, `invoices`. Mazání uživatele kaskádově maže jeho `payers`, `customers`, `invoices`, `invoiceNumberCounters`. Žádná procedura uživatele nemaže.

## Entities & Models

- `UserRole` (typ odvozený z `userRoleEnum.enumValues`) se exportuje ze `schema.ts`, aby ho šlo importovat v klientských komponentách. `src/server/auth/config.ts` ho znovu exportuje a rozšiřuje typy `Session`, `User`, `JWT` o `role` a `managerId`.
- `publicUserColumnFlags` / `publicUserColumnRefs` v `user.ts` omezují seznam uživatelů pro admina na `id`, `email`, `name`, `firstName`, `lastName`, `role`, `managerId` (bez `passwordHash`).
- Zápisové procedury nastavení (`updateEditorPreferences`, `updateColorScheme`, `updatePrimaryColor`, `updateWorkloadSettings`, …) cílí vždy na řádek aktuálního uživatele. Přehled guardů je v [[access-role-visibility]].

## Relationships

- [[access-role-visibility]] — jak role a `managerId` řídí viditelnost
- [[access-user-administration]] — zakládání účtů a změna role
- [[platform-db-schema-overview]] — ostatní tabulky
- [[access]] — doména
