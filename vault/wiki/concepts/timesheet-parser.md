---
title: Parser výkazu
type: concept
domain: timesheet
status: current
tags: [parser, timesheet]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [timesheet, timesheet-input-format, timesheet-parser-port-from-perl, timesheet-workload-and-task-summaries, timesheet-disk-storage]
---

# Parser výkazu

`src/server/timesheet/parse.ts::parseTimesheet` převede surový text měsíčního výkazu na záznamy po aliasech zákazníků, součty hodin a seznam přesčasových dnů. Je to přepis `perl-app/prace.pl` ([[timesheet-parser-port-from-perl]]). Syntaxi popisuje [[timesheet-input-format]].

## The Problem It Solves

Uživatel píše výkaz jako volný text. Appka z něj musí při každém stisku klávesy (živý přepočet v editoru) i při uložení spočítat hodiny na zákazníka a vyrobit HTML. Parser je čistá funkce bez I/O, takže běží v prohlížeči (editor) i na serveru (router, report).

## How It Works

Vstup: `raw` a `period` (`YYYYMM`). Z `period` se vezme rok pro data bez roku. Text se rozdělí na řádky (`\r\n`, `\r`, `\n`), z každého se ořežou koncové mezery. Parser drží stavový automat s proměnnými `kdo` (alias), `datum`, `od` (otevřený čas), `co` (popis).

Pořadí rozpoznání řádku:

1. Prázdný řádek se přeskočí.
2. Řádek s `#TODO` (`RE_TODO_MARKER`) přepne režim `todo`. V něm se vše ignoruje do dalšího `#TODO`.
3. Řádek začínající `#` (`RE_COMMENT`) je komentář.
4. Čas `H:MM` (`RE_TIME`). Má-li parser otevřený čas `od` a neprázdný popis `co`, uzavře záznam a koncový čas se stane novým `od`. Jinak jen nastaví `od`.
5. Samotné číslo (`RE_MINUTES`) při už nastaveném datu je záznam o dané délce v minutách. Nuluje `od` a `co`.
6. Datum `d.m.yyyy`, `d.m.` (rok z `period`) a `yyyy-mm-dd`.
7. Řádek začínající `-` je popis. Řádky se sbírají do jednoho záznamu.
8. Jediné „slovo" bez mezer je alias zákazníka. `normalizeAlias` ho převede na velká písmena a odstraní diakritiku (NFD + odstranění kombinujících znaků).
9. Cokoli jiného jde do `errors` jako `Řádek N: Neznám: …`.

Záznam (`TimesheetEntryRow`) nese `date`, `idx` (pořadí, začíná na 1000), `line` (řádek začátku záznamu: první popisný řádek, jinak řádek uzavírajícího času), `minutes`, `description`. `pushEntry` záznam zahodí, pokud ještě nebyl nastaven alias.

Výstup `ParseTimesheetResult`:

- `timesheets` — po aliasech seřazených `localeCompare`: `name`, `filepath` (`{period}/Výkaz_{ALIAS}_{period}.htm`), `hours` (zaokrouhleno na 2 desetinná místa), `overtime`.
- `errors` — nerozpoznané řádky.
- `perPerson` — detailní záznamy pro HTML a přehledy.

### Přesčasy

Přesčasový den je den, kde součet minut jednoho aliasu překročí 8 hodin (`minutes / 60 > 8`). Hranice se počítá po aliasech, ne přes všechny zákazníky dohromady. Výstup je seřazen podle data.

### Délka přes půlnoc

Záporný rozdíl časů se bere jako přechod přes půlnoc a přičte se 24 hodin (test „22:00–1:00 = 3 hodiny" v `parse.test.ts`). Původní Perl v tom případě jen vypsal varování.

### Renderování

- `formatHoursColon(minutes)` dává formát `H:MM` (shodný s `hodin()` v Perlu).
- `renderTimesheetBody(person, period)` vyrobí `<h1>` a tabulku (Datum, Popis, Hodiny) a řádek se součtem. Řádky jsou seřazeny podle data a `idx`.
- `renderTimesheetHtml` zabalí tělo do `<html>` s UTF-8 meta tagem. Report route skládá víc těl za sebe s `page-break-after`.

## Implementation

- `src/server/timesheet/parse.ts::parseTimesheet`, `normalizeAlias`, `stripDescriptionDash`, `renderTimesheetBody`, `renderTimesheetHtml`, `formatHoursColon`.
- Použití: `src/server/timesheet/storage.ts::saveTimesheet`, `src/server/api/routers/timesheet.ts::timesheetRouter`, `src/app/api/timesheets/report/route.ts::GET`, prohlížečová strana `src/app/(app)/timesheets/timesheet-editor.tsx::TimesheetEditor` (importuje parser přímo).
- Následné souhrny: [[timesheet-workload-and-task-summaries]].

### Pokryté testy

`src/server/timesheet/parse.test.ts` pokrývá: součty hodin po zákaznících, tvar `filepath`, chybu s číslem řádku pro řádek bez pomlčky, přesčas jen ve správném dni, pořadí a víceřádkový popis, číslo řádku záznamu, datum bez roku, přechod přes půlnoc. Test nepokrývá: ISO datum, minuty samostatným číslem, `#TODO` blok, komentáře, normalizaci diakritiky v aliasu.

## Trade-offs

- Pomlčka: `stripDescriptionDash` odstraní první `-` a mezery. Řádek `-- text` proto zůstane jako `- text` (podřádek si zachová jednu pomlčku). `tasks.ts::cleanSubLine` ji pak odstraní.
- Stav (`kdo`, `od`) se nenuluje při změně data. Chybějící uzavírací čas tak může spojit záznam přes dny. To odpovídá Perlu.
- Čas se nevaliduje na rozsah (`25:99` projde).
- Hodnoty `idx` se zvyšují i pro řádky, které nejsou záznam. Slouží jen k pořadí.

## Related Concepts

- [[timesheet-input-format]] — syntaxe s příklady
- [[timesheet-disk-storage]] — kam se výstup ukládá
- [[timesheet-parser-port-from-perl]] — rozdíly proti `prace.pl`

## Open Questions

- ⚠️ `renderTimesheetBody` vkládá `description` a `person.alias` do HTML bez escapování. HTML se vrací z `report/route.ts::GET` jako `text/html` (inline, do iframe) a renderuje se v Puppeteeru (PDF). Escapování (`escapeHtml`) existuje jen v šabloně faktury ([[access-security-invariants]], [[invoicing-pdf-rendering]]). Senior vidí výkazy podřízených, takže vstup z cizího účtu je reálný scénář. Potvrdit a případně založit issue.
- Datum ve tvaru `d.m.yy` (dvoumístný rok) projde `RE_DATE_DMY` a vyrobí rok `yy` doslova (např. `26-07-06`). Chování je neověřené testem.
- Samotné číslo před prvním datem (`datum` je prázdné) se nebere jako minuty, ale propadne až do `RE_TOKEN` a stane se aliasem.
