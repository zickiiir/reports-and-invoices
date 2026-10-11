---
title: Výkazy leží na disku, ne v databázi
type: decision
domain: timesheet
status: active
tags: [decision, storage, backup]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [timesheet, timesheet-disk-storage, timesheet-parser-port-from-perl, platform-db-schema-overview]
---

# Výkazy leží na disku, ne v databázi

Surový text výkazu a vygenerované HTML se ukládají jako soubory pod `DATA_DIR/{userId}/{YYYYMM}/`. V databázi jsou jen odvozená metadata.

## Context

Původní proces pracoval se soubory `prace{YYYYMM}DB.txt` a výstupem `prace.pl` (`perl-app/prace.pl`, [[source-2026-zadani-original-brief]]). Zadání výslovně počítá s tím, že „soubor s vykazem se bude stale realne ukladat", jen se bude editovat v appce. Kód ([[timesheet-disk-storage]]) tento model drží.

## Decision

- Výkaz = textový soubor na disku (`src/server/timesheet/storage.ts::saveTimesheet`). To popisují `CLAUDE.md` („Výkazy samotné (surový text + vygenerovaná HTML) nejsou v DB") i `README.md` (sekce „Struktura").
- DB drží jen odvozená metadata: stav Nextcloud sync (`nextcloudSyncedPeriods` na `users`), číslování faktur a podobně ([[platform-db-schema-overview]]).
- Výkazy se editují a čtou jako celé soubory. Parser vždy čte celý text.

## Alternatives Considered

Dokumentace (`README.md`, `CLAUDE.md`, `zadani.md`) alternativy neuvádí. Z kódu a dokumentů lze odvodit jen důsledky, ne odmítnuté varianty:

- Ukládat text do sloupce v DB — v repu není a není zdůvodněno, proč ne. Nejisté.

## Consequences

- **Zálohování**: výkazy nejsou v `pgdata`. V produkci leží ve volume `app-data` (mountovaný na `/data`, `docker-compose.yml`). Zálohu je třeba dělat zvlášť pro `pgdata` i `app-data`. `README.md` upozorňuje, že `pnpm prod:docker:remove` (`down -v`) smaže obě volumes nevratně včetně všech výkazových souborů, zatímco obyčejný redeploy a `prod:docker:down` volumes nechají.
- **Konzistence**: DB a soubory nemají společnou transakci. Metadata a soubor se mohou rozejít.
- **Přenositelnost**: soubory jde stáhnout (ZIP) a zrcadlit na Nextcloud nebo do lokální složky ([[timesheet-local-folder-sync]]).
- **Bezpečnost**: cesty se skládají z uživatelských hodnot, proto validace `userId` a `period` v `storage.ts` je povinná ([[access-security-invariants]]).
- **Vícenásobná instance**: soubory ve volume předpokládají jednu instanci appky (stejně jako in-memory rate limit podle `CLAUDE.md`).

## Status

Aktivní od vzniku appky. Datum prvního commitu nezjišťováno.
