---
title: Jednosměrná synchronizace s Nextcloudem
type: decision
domain: nextcloud
status: active
tags: [decision, nextcloud, sync]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [nextcloud, nextcloud-sync-conflict-handling, nextcloud-webdav-client, timesheet-local-folder-sync]
---

# Jednosměrná synchronizace s Nextcloudem

Sync jde jen z appky na Nextcloud a appka nikdy nepřepíše soubor, který sama nevytvořila, bez výslovného potvrzení.

## Context

Zdrojem pravdy o výkazech je disk appky (`DATA_DIR/{userId}/{YYYYMM}/`, `src/server/timesheet/storage.ts`). Nextcloud je záloha a volitelně sdílené místo. Uživatel může do stejné složky nahrávat soubory ručně. Dokumentace (README.md, CLAUDE.md) k tomu uvádí jen faktický popis, ne podrobnou diskusi.

## Decision

- Synchronizace je jednosměrná (appka → cíl). README.md: "appka odtamtud nic nečte zpátky". CLAUDE.md to opakuje u sekce Nextcloud sync.
- Appka nepřepíše soubor, který sama nevytvořila, bez výslovného potvrzení uživatele (README.md, sekce Synchronizace výkazů). V kódu to zajišťuje `nextcloudSyncedPeriods` a kontrola existence, viz [[nextcloud-sync-conflict-handling]].
- Kolize se řeší vědomě přes checkbox v modalu, ne automaticky (CLAUDE.md).
- Sync je best-effort: `syncTimesheetToNextcloud` nikdy nevyhazuje, aby selhání Nextcloudu neshodilo uložení výkazu (`src/server/nextcloud/sync.ts::syncTimesheetToNextcloud`).

## Alternatives Considered

Dokumentace žádné zamítnuté alternativy neuvádí. Z kódu plyne jen to, co v něm není: obousměrný sync, čtení ze vzdáleného úložiště (klient `src/server/nextcloud/client.ts` umí jen `exists` a zápis) ani automatické řešení konfliktů.

## Consequences

- Žádná logika sloučení ani detekce změn na straně Nextcloudu. Ručně upravený soubor, který appka už jednou zapsala, se při dalším uložení bez ptaní přepíše (cesta je pak "naše").
- Appka drží stav jen v `users.nextcloudSyncedPeriods`. Smaže se při `disconnect`.
- Uživatel s kolizí musí ručně otevřít modal "Synchronizovat teď".
- Lokální složka (viz [[timesheet-local-folder-sync]]) je nezávislá alternativa. Obě jdou použít zároveň.

## Status

Aktivní, popisuje stav v době dokumentace (2026-10-11). Landing page: [[nextcloud]].
