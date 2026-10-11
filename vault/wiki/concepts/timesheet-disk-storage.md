---
title: Ukládání výkazů na disk
type: concept
domain: timesheet
status: current
tags: [storage, filesystem, security, timesheet]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [timesheet, timesheet-files-on-disk-not-in-db, timesheet-parser, access-security-invariants, timesheet-input-format]
---

# Ukládání výkazů na disk

Výkazy leží v souborovém systému pod `DATA_DIR/{userId}/{YYYYMM}/`. Modul `src/server/timesheet/storage.ts` je jediné místo, které s těmito cestami pracuje. Proč na disku a ne v DB: [[timesheet-files-on-disk-not-in-db]].

## The Problem It Solves

Cesta k souboru se skládá z hodnot, které přijdou od klienta (`userId`, `period`). Bez validace by šlo přes `path.join` číst nebo psát mimo datový adresář (path traversal). Viz [[access-security-invariants]].

## How It Works

### Kořen dat

`getDataRoot()` vrací `path.resolve(process.cwd(), env.DATA_DIR)`. `DATA_DIR` má v `src/env.js` default `./data`. V Dockeru je `DATA_DIR=/data` a adresář je mountovaný jako volume `app-data` (`docker-compose.yml`, `Dockerfile`). Kořen se vyhodnocuje líně (ne jako konstanta modulu), protože modul se importuje i kvůli typům v grafu tRPC routerů a `next build` nemusí mít `env.DATA_DIR` k dispozici.

### Rozložení souborů

| Soubor | Obsah |
|---|---|
| `{userId}/{YYYYMM}/prace{YYYYMM}.txt` | surový text výkazu (`filename.ts::suggestedFilename`) |
| `{userId}/{YYYYMM}/Výkaz_{ALIAS}_{YYYYMM}.htm` | odvozené HTML jednoho aliasu (`parse.ts::renderTimesheetHtml`) |

Operace:

- `saveTimesheet(userId, period, content)` — vytvoří adresář (`mkdir recursive`), zapíše surový soubor, přeparsuje a zapíše `.htm` pro každý alias. Vrací výsledek parseru.
- `readTimesheetRaw` — vrací obsah, nebo prázdný řetězec při `ENOENT`.
- `listPeriods(userId)` — adresáře odpovídající `YYYYMM`, seřazené sestupně.
- `timesheetExists` — `stat` na surový soubor.
- `parseTimesheetLive` — tenký obal nad `parseTimesheet`.

### Validace cest

- `UUID_RE` ověří `userId` (`assertSafeUserId`, chyba `Neplatné userId pro přístup k souborům výkazů`).
- `PERIOD_RE` (`^\d{6}$`) ověří `period` (`assertSafePeriod`).
- Obě kontroly proběhnou v `userRoot` a `periodDir`, tedy před každým `path.join`.
- Kontrola je i v routeru (`timesheet.ts::periodSchema`, `z.string().uuid()`) a v download/report routách (`PERIOD_RE`). `storage.ts` je ale poslední obrana, protože volání se do něj dostanou i z jiných míst.

### Název souboru při importu

`filename.ts::parsePeriodFromFilename` vytáhne období z názvu `prace202607DB.txt` a podobných (volitelný příznak dodavatele „DB" a volitelná přípona, viz [[timesheet-input-format]]). Měsíc mimo 01–12 vrací `null`. Pokryto v `filename.test.ts`.

## Implementation

- `src/server/timesheet/storage.ts`: `saveTimesheet`, `readTimesheetRaw`, `listPeriods`, `timesheetExists`, `assertSafeUserId`, `assertSafePeriod`.
- `src/server/timesheet/filename.ts`: `parsePeriodFromFilename`, `suggestedFilename`.
- `src/env.js`: `DATA_DIR`.

## Trade-offs

- Odvozená `.htm` se zapisují, ale aplikace je nikde nečte. Report route generuje HTML z aktuálního surového textu (`src/app/api/timesheets/report/route.ts::GET`). Soubory slouží jako výstup kompatibilní s `prace.pl -d`.
- `saveTimesheet` nemaže `.htm` souborů aliasů, které z textu zmizely. Zůstanou na disku zastaralé.
- Zápis není atomický (přímý `writeFile`). Souběžné uložení stejného období není řešeno (nejisté, jestli to v praxi vadí).
- Zálohování: viz [[timesheet-files-on-disk-not-in-db]].

## Related Concepts

- [[timesheet-parser]] — vytváří obsah `.htm`
- [[timesheet-editor-and-import]] — volající strana

## Open Questions

- ⚠️ Alias z výkazu (`\S+`, jen velká písmena a bez diakritiky) jde bez další kontroly do názvu souboru `Výkaz_${person.alias}_${period}.htm` v `saveTimesheet` a do `path.join`. Alias obsahující `/` a `..` (např. `X/../../../Y`) se po normalizaci cesty teoreticky dostane z `periodDir` ven, protože validace `userId`/`period` se alias netýká. Soubor by měl vždy příponu `_YYYYMM.htm`. Podle čtení kódu, netestováno. Potvrdit a opravit (povolit jen bezpečné znaky v aliasu).
- `UUID_RE` je case-insensitive. Na case-insensitive souborovém systému by se tak jeden uživatel mohl dvěma zápisy `userId` dostat do stejného adresáře. Nejisté, UUID z DB jsou malá písmena.
