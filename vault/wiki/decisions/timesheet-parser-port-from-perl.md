---
title: Přepis prace.pl do TypeScriptu
type: decision
domain: timesheet
status: active
tags: [decision, parser, perl, migration]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [timesheet, timesheet-parser, timesheet-input-format, source-2026-zadani-original-brief]
---

# Přepis prace.pl do TypeScriptu

Skript `perl-app/prace.pl` byl přepsán do `src/server/timesheet/parse.ts::parseTimesheet`, aby parser šel použít přímo v appce (editor, router, reporty).

## Context

Původní proces: `cat prace*.txt | ./prace.pl 202608` vygeneruje HTML pro každého dodavatele, ten se pak ručně nahrává do PHP generátoru PDF. Autor zadání ho označil za „pomerne zbytecne slozity" a navrhl vše sloučit do jedné aplikace (`zadani.md`, úvod).

## Decision

Přepsat `prace.pl` do TypeScriptu „at je snadna integrace" (`zadani.md`). Parser je čistá funkce `parseTimesheet(raw, period)`, vrací strukturu `timesheets` / `errors` navrženou v zadání a navíc `perPerson` pro generování HTML. Hlavička `parse.ts` označuje soubor za „TypeScript rewrite of `perl-app/prace.pl`" a testy to ověřují (`parse.test.ts`). Vstupní formát je beze změny: [[timesheet-input-format]].

## Alternatives Considered

Zadání neuvádí odmítnuté alternativy (např. volat Perl z appky). Z dokumentů plyne jen motivace „snadná integrace" a zabalení do Dockeru. Další zdůvodnění v repu není.

## Consequences

Co se zachovalo (porovnání `prace.pl` a `parse.ts`):

- stejná pravidla rozpoznání řádků a jejich pořadí (komentář, `#TODO` blok, minuty, čas, tři tvary data, popis, alias, „Neznám"),
- uzavírací čas jako začátek dalšího záznamu,
- normalizace aliasu (velká písmena, odstranění diakritiky, `NFD` + `\pM`),
- úprava popisu (`s/^-\s*//; s/^--/-/`),
- formát hodin `H:MM` (`hodin()` v Perlu, `formatHoursColon` v TS),
- tvar názvu `Výkaz_{ALIAS}_{období}.htm` a HTML tabulka (Datum, Popis, Hodiny),
- přesčas = součet aliasu za den nad 8 hodin.

Co se změnilo nebo vypadlo:

- **Výstup**: místo řádků `kdo|soubor|hodiny` a `pres|…` na stdout je JSON-like objekt (`timesheets`, `errors`, `perPerson`).
- **Chyby** nesou číslo řádku (`Řádek N: Neznám: …`). Zadání uvádí příklad bez čísla řádku (`"Neznám: XYZ"`).
- **Přes půlnoc**: Perl vypsal `Warning` při záporné délce, TS přičte 24 h.
- **Vypuštěno**: parametr období z příkazové řádky (nahrazen argumentem `period`), přepínač `-d` (adresář, řeší `storage.ts`), filtr `f=` (nahrazen výběrem aliasů v UI), řádek `Suma|all|…Kč` s pevnou sazbou 650 Kč/h (sazby jsou nyní per odběratel, `customers.defaultHourlyRate`).
- **Přidáno**: pole `line` u záznamů (skok v editoru z přehledu úkolů), ISO datum má stejné pořadí jako v Perlu, ale zapisuje se přímo jako `YYYY-MM-DD`.
- Řazení řádků tabulky: Perl `sort` textu řádku, TS řadí podle data a `idx`.
- Perl ukládal `kdo` jako bajty po `decode_utf8`; TS pracuje s řetězci Unicode.

Dopady: parser běží i v prohlížeči (živý přepočet), viz [[timesheet-parser]]. Původní `perl-app/` zůstává v repu jako reference a vzorová data (`perl-app/prace202607DB.txt`).

## Status

Aktivní. Port je hotový a pokrytý testy `parse.test.ts` (ne všechny okrajové případy, viz [[timesheet-parser]]).
