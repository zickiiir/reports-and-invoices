---
title: Alias výkazu v názvu souboru umožňuje path traversal
type: issue
domain: timesheet
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-10-11
related: [timesheet-disk-storage, timesheet-parser, access-security-invariants, timesheet]
---

# Alias výkazu v názvu souboru umožňuje path traversal

Alias z textu výkazu se vkládá do názvu souboru bez validace, takže zápis může skončit mimo `DATA_DIR`.

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

`src/server/timesheet/storage.ts::saveTimesheet` zapisuje `Výkaz_${alias}_${period}.htm` přes `path.join`. Alias je libovolný token bez mezer (`RE_TOKEN`), po `normalizeAlias` jen velkými písmeny; `/` a `..` zůstanou. Validace `userId` (UUID) a `period` (`YYYYMM`) alias nepokrývá, i když `CLAUDE.md` popisuje ochranu cest jako úplnou. Omezení: název vždy končí `_YYYYMM.htm` a cílová složka musí existovat.

## Why Not Fixed Now

Nebylo to v daném rozsahu práce (wiki), navíc je třeba nejdřív ověřit, jestli jde zápis opravdu provést. Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Validovat alias stejně přísně jako `userId` a `period` (povolit jen bezpečnou množinu znaků) a po složení cesty ověřit, že leží uvnitř `DATA_DIR/{userId}/{period}/`. Přidat test. Nesmí se změnit stávající názvy souborů běžných aliasů.
