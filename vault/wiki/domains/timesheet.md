---
title: Výkazy práce
type: domain
domain: timesheet
status: current
tags: [domain, timesheet]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [timesheet-parser, timesheet-input-format, timesheet-disk-storage, timesheet-workload-and-task-summaries, timesheet-editor-and-import, timesheet-local-folder-sync, timesheet-files-on-disk-not-in-db, timesheet-parser-port-from-perl, source-2026-zadani-original-brief, invoicing, nextcloud, access]
---

# Výkazy práce

Výkaz je surový textový soubor za měsíc. Appka ho uloží na disk, parsuje při každé změně a z výsledku počítá hodiny, přesčasy, HTML/PDF výkazy a podklady pro faktury.

## Overview

- **Purpose**: nahradit ruční proces `cat prace*.txt | prace.pl` (viz [[timesheet-parser-port-from-perl]]).
- **Path**: `src/server/timesheet/` (parser, storage, workload, tasks, filename), `src/server/api/routers/timesheet.ts`, `src/app/(app)/timesheets/`, `src/app/api/timesheets/`, `src/components/local-sync.ts`.
- **Status**: aktivní.

## Key Responsibilities

- Převod surového textu na záznamy po zákaznických aliasech a dnech: `src/server/timesheet/parse.ts::parseTimesheet`.
- Ukládání výkazů na disk pod `DATA_DIR/{userId}/{YYYYMM}/` a generování odvozených `.htm` souborů: `src/server/timesheet/storage.ts::saveTimesheet`.
- Editor s živým přepočtem, import starých souborů, stažení, náhled HTML/PDF: `src/app/(app)/timesheets/timesheet-editor.tsx::TimesheetEditor`.
- Přehledy: odpracovanost proti fondu hodin (`workload.ts::computeWorkloadStats`) a souhrny podle úkolů (`tasks.ts::summarizeTasks`).
- Záloha do lokální složky v prohlížeči: `src/components/local-sync.ts`.

## How It Fits

- Router `src/server/api/routers/timesheet.ts::timesheetRouter` používá oprávnění z [[access]] (viz [[access-role-visibility]]). Čtení výkazu kontroluje `assertCanReadTimesheet`, zápis `assertOwnerOrSuperUser`.
- Po každém uložení volá `syncTimesheetToNextcloud` z domény [[nextcloud]] (viz [[nextcloud-sync-conflict-handling]]).
- Zákaznické aliasy z výkazu jsou základ položek faktur v [[invoicing]] (odkaz „Fakturovat" z editoru vede na `/invoices/new`). HTML výkazu se renderuje do PDF přes `src/server/pdf/render.ts` ([[invoicing-pdf-rendering]]).

## Documentation Map

- [[timesheet-parser]] — jak parser převádí text na strukturu
- [[timesheet-input-format]] — katalog syntaxe vstupního textu
- [[timesheet-disk-storage]] — soubory na disku, pojmenování, validace cest
- [[timesheet-workload-and-task-summaries]] — fond hodin a souhrny podle úkolů
- [[timesheet-editor-and-import]] — editor, uložení, náhled, stažení, import
- [[timesheet-local-folder-sync]] — záloha do lokální složky (File System Access API)
- [[timesheet-files-on-disk-not-in-db]] — rozhodnutí: výkazy na disku, ne v DB
- [[timesheet-parser-port-from-perl]] — rozhodnutí: přepis `prace.pl` do TS
- [[source-2026-zadani-original-brief]] — shrnutí původního zadání
- Související: [[access-security-invariants]], [[platform-db-schema-overview]]

## Known Issues / Not Yet Documented

- `renderTimesheetBody` neescapuje popisy ani alias do HTML (viz [[timesheet-parser]], sekce Open Questions).
- Alias z výkazu jde do názvu souboru bez sanitizace (viz [[timesheet-disk-storage]], sekce Open Questions).
- `parseTimesheetLive`, `timesheetExists` ve `storage.ts` a tRPC `timesheet.parseLive` nejsou v UI použity (editor volá `parseTimesheet` přímo v prohlížeči).

## Otevřené issues

- [[timesheet-alias-path-traversal]] — Alias výkazu v názvu souboru umožňuje path traversal
- [[timesheet-report-html-injection]] — Report výkazu vkládá popis a alias do HTML bez escapování
- [[timesheet-parser-validation-gaps]] — Parser výkazu nekontroluje rozsahy a má netestované okrajové případy
- [[timesheet-overwrite-and-stale-files]] — Import a lokální sync přepisují soubory bez ptaní, zůstávají zastaralé .htm
