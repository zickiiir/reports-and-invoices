---
title: Formát vstupního textu výkazu
type: reference
subtype: catalog
domain: timesheet
status: current
tags: [reference, catalog, timesheet, syntax]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [timesheet, timesheet-parser, timesheet-disk-storage]
---

# Formát vstupního textu výkazu

Katalog řádků, které `src/server/timesheet/parse.ts::parseTimesheet` rozpoznává. Otevři ho, když potřebuješ vědět, jak zapsat datum, čas, popis nebo alias. Algoritmus popisuje [[timesheet-parser]].

Příklady vycházejí ze vzorového souboru `perl-app/prace202607DB.txt`. Řádky se vyhodnocují v pořadí z tabulky níže. Úvodní a koncové mezery se ignorují.

## Rules / Entries

| Řádek | Regex v kódu | Význam | Příklad |
|---|---|---|---|
| prázdný | — | přeskočí se | |
| `#TODO` kdekoli v řádku | `RE_TODO_MARKER` | přepíná režim ignorování; vše mezi dvěma takovými řádky se přeskočí | `#TODO` … `#TODO` |
| začíná `#` | `RE_COMMENT` | komentář | `# poznámka` |
| `H:MM` | `RE_TIME` | čas; první otevře interval, druhý ho uzavře a vytvoří záznam; uzavírací čas je zároveň začátek dalšího | `10:00` |
| celé číslo | `RE_MINUTES` | délka záznamu v minutách; jen pokud už je nastaveno datum | `45` |
| `d.m.yyyy` | `RE_DATE_DMY` | datum s rokem | `2.7.2026` |
| `d.m.` | `RE_DATE_DM` | datum bez roku; rok se vezme z období (`period`) | `23.7.` |
| `yyyy-mm-dd` | `RE_DATE_ISO` | ISO datum | `2026-07-02` |
| začíná `-` | `RE_DESC` | popis záznamu; první řádek je název úkolu, další jsou podřádky | `- Servis eshop` |
| jedno slovo bez mezer | `RE_TOKEN` | alias zákazníka (např. `KM`, `DELUS`) | `KM` |
| cokoli jiného | — | chyba `Řádek N: Neznám: …` | `Oprava bez pomlčky` |

## Pravidla chování

- **Interval.** Záznam vznikne, až když je otevřený čas i neprázdný popis. Čas bez popisu jen přepíše otevřený čas. Příklad ze vzoru: `13:00`, `- Integrace IMOS`, `13:30` je záznam 30 minut.
- **Řetězení.** Uzavírací čas je začátek dalšího záznamu. Další popis a čas tedy stačí bez opakování začátku.
- **Přes půlnoc.** `22:00` … `1:00` dává 3 hodiny (záporný rozdíl se opraví o 24 h).
- **Alias.** Převede se na velká písmena a bez diakritiky. Platí až do dalšího řádku s aliasem. Záznam bez předchozího aliasu se zahodí bez chyby.
- **Alias uprostřed intervalu.** Změna aliasu nenuluje otevřený čas. Vzor má sekvenci `KM`, `10:00`, `- popis`, `10:30`, `DELUS`, `13:00`: záznam 10:00–10:30 patří `KM`, `13:00` pak otevře nový interval pro `DELUS`.
- **Popis.** `-` a mezery za ní se odstraní. `-- text` se uloží jako `- text` (podřádek). Podřádky se v souhrnech úkolů zobrazují bez pomlčky ([[timesheet-workload-and-task-summaries]]).
- **Minuty.** Samotné číslo ukončí záznam i bez času. Popis před ním se použije a otevřený čas se vynuluje.
- **Datum.** Platí do dalšího data. Při změně data se `alias` ani otevřený čas nenulují.
- **Přesčas.** Součet jednoho aliasu za den nad 8 hodin se hlásí jako přesčas.
- **Rok bez zadání.** `d.m.` bere rok z prvních čtyř číslic `period`.

## Pojmenování souboru

Soubor se na disku jmenuje `prace{YYYYMM}.txt` (`src/server/timesheet/filename.ts::suggestedFilename`). Import rozpozná období z názvu `prace202607DB.txt`, `prace202607.txt`, `prace202607DB` i `prace202607` (`parsePeriodFromFilename`, nezáleží na velikosti písmen, měsíc musí být 01–12). Viz [[timesheet-disk-storage]].

## Exceptions

- Čas se nevaliduje na rozsah. `25:99` projde jako čas.
- Řádek s mezerou uvnitř, který nezačíná `-` ani `#` (např. `Oprava bez pomlčky`), je chyba, nikoli alias. Typická chyba uživatele: zapomenutá pomlčka u popisu.
- Dvoumístný rok (`2.7.26`) projde jako rok `26`; chování není pokryto testem (nejisté).
- Řádek s jedním slovem bez pomlčky (např. zapomenutý popis o jednom slově) se bere jako nový alias.
