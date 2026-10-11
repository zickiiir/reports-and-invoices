---
title: Nextcloud
type: domain
domain: nextcloud
status: current
tags: [domain, nextcloud, webdav, backup]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [nextcloud-webdav-client, nextcloud-ssrf-guard, nextcloud-password-encryption, nextcloud-sync-conflict-handling, nextcloud-one-way-sync, timesheet-local-folder-sync, timesheet-editor-and-import, access-security-invariants, timesheet, access]
---

# Nextcloud

Jednosměrná server-side záloha uložených výkazů na Nextcloud přes WebDAV.

## Overview

- **Purpose**: po uložení výkazu (a na vyžádání v Nastavení) zapsat surový text výkazu do složky na Nextcloudu uživatele.
- **Path**: `src/server/nextcloud/` (`client.ts`, `sync.ts`, `crypto.ts`, `ssrf-guard.ts`), router `src/server/api/routers/nextcloud.ts::nextcloudRouter`, UI `src/app/(app)/settings/settings-form.tsx` a `src/app/(app)/settings/nextcloud-sync-modal.tsx::NextcloudSyncModal`.
- **Status**: aktivní. Funguje v libovolném prohlížeči, protože běží na serveru.
- **Směr**: appka → Nextcloud. Appka z Nextcloudu nic nečte zpět (viz [[nextcloud-one-way-sync]]).

## Key Responsibilities

- Uložit připojení uživatele (URL, uživatel, aplikační heslo šifrovaně, vzdálená složka, default `/Vykazy`) do sloupců `nextcloud*` tabulky `users` (`src/server/db/schema.ts::users`).
- Ověřit připojení před uložením (`src/server/nextcloud/client.ts::testNextcloudConnection`).
- Automaticky zapsat výkaz po `timesheet.save` a `timesheet.importBatch` (`src/server/nextcloud/sync.ts::syncTimesheetToNextcloud`).
- Ručně zobrazit náhled a zapsat vybraná období (`previewSync`, `syncSelected`).
- Chránit appku před SSRF a heslo před únikem z DB.

## Rozdíl proti lokální složce

| | Nextcloud (tato doména) | Lokální složka |
|---|---|---|
| Kde běží | server (WebDAV) | čistě prohlížeč (File System Access API) |
| Prohlížeč | libovolný | jen Chrome/Edge |
| Ochrana před cizím souborem | `nextcloudSyncedPeriods` + kontrola existence | viz [[timesheet-local-folder-sync]] |

Obě cesty jdou zapnout nezávisle i společně. Lokální složka o Nextcloudu nic neví, protože do ní appka píše jako na disk (README.md, sekce Synchronizace výkazů).

## How It Fits

- `src/server/api/routers/timesheet.ts::timesheetRouter` volá `syncTimesheetToNextcloud` a výsledek (`nextcloudSync`) vrací frontendu, který ho ukáže v notifikaci. Viz [[timesheet-editor-and-import]] a [[timesheet]].
- Router `nextcloudRouter` používá jen `protectedProcedure` a sahá výhradně na řádek přihlášeného uživatele (`ctx.session.user.id`), takže nepotřebuje `assert*` helper z [[access]]. Obecné invarianty viz [[access-security-invariants]].
- Moduly `sync.ts`, `client.ts`, `crypto.ts`, `ssrf-guard.ts` importují `server-only`.

## Documentation Map

- [[nextcloud-webdav-client]] — kontrakt s Nextcloudem, klient, chyby
- [[nextcloud-ssrf-guard]] — DNS-resolve kontrola cílové adresy
- [[nextcloud-password-encryption]] — AES-256-GCM, klíč z `AUTH_SECRET`
- [[nextcloud-sync-conflict-handling]] — `nextcloudSyncedPeriods`, výsledky synchronizace, modal
- [[nextcloud-one-way-sync]] — proč je sync jednosměrný

## UI v Nastavení

`settings-form.tsx` zobrazí formulář (URL, uživatel, aplikační heslo, složka) nebo, pokud je připojeno, přehled s tlačítky "Synchronizovat teď" a "Odpojit". Po úspěšném `connect` se sám otevře `NextcloudSyncModal`. Heslo se nikdy nevrací klientovi (`nextcloudRouter.status` vrací jen url, username, remotePath).

## Known Issues / Not Yet Documented

- Klient nenastavuje žádné timeouty (viz [[nextcloud-webdav-client]]).
- `markPeriodsSynced` je read-modify-write bez transakce (viz [[nextcloud-sync-conflict-handling]]).
- Pokrytí SSRF guardu má mezery (viz [[nextcloud-ssrf-guard]]).
- Žádné testy pro modul `src/server/nextcloud/` (CLAUDE.md uvádí testy jen pro parser a pár čistých funkcí).

## Otevřené issues

- [[nextcloud-ssrf-guard-gaps]] — SSRF guard nepokrývá všechny rezervované rozsahy a má okno pro DNS rebinding
- [[nextcloud-sync-robustness]] — Nextcloud sync: bez timeoutů, zastaralá historie po přepojení, tiché selhání po rotaci AUTH_SECRET
