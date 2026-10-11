---
title: Import a lokální sync přepisují soubory bez ptaní, zůstávají zastaralé .htm
type: issue
domain: timesheet
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-10-11
related: [timesheet-editor-and-import, timesheet-local-folder-sync, timesheet-disk-storage, timesheet]
---

# Import a lokální sync přepisují soubory bez ptaní, zůstávají zastaralé .htm

Hromadný import a záloha do lokální složky přepisují existující data bez serverové kontroly, a smazané aliasy nechávají na disku staré soubory.

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

`importBatch` v `src/server/api/routers/timesheet.ts` přepíše existující období bez kontroly na serveru, UI jen ukazuje odznak „přepíše existující“. Lokální sync (`src/components/local-sync.ts`) přepisuje existující soubory bez ptaní; ve volání z importu chybí. `saveTimesheet` nemaže `.htm` pro aliasy, které z textu zmizely. Nepoužívaný kód: `storage.ts::parseTimesheetLive`, `timesheetExists`, tRPC `timesheet.parseLive`. Route pro stažení neověřuje `userId` jako UUID před `assertCanReadTimesheet`; report route na rozdíl od `normalizeAlias` neodstraňuje diakritiku.

## Why Not Fixed Now

Jde o chování, které je zčásti vědomé (UI to ukazuje), a vyžaduje rozhodnutí o UX. Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Zvážit serverovou kontrolu přepisu v importu, úklid zastaralých `.htm` a odstranění mrtvého kódu. Sjednotit normalizaci aliasu v report route.
