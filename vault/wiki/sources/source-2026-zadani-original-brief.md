---
title: Původní zadání (zadani.md)
type: source
domain: timesheet
status: historical
tags: [source, brief, requirements]
created: 2026-10-11
updated: 2026-10-11
related: [timesheet, timesheet-parser-port-from-perl, timesheet-editor-and-import, invoicing]
---

# Původní zadání (zadani.md)

- **What it is**: soubor `zadani.md` v kořeni repozitáře, volně psané zadání vlastníka projektu (česky, bez diakritiky).
- **Where it came from**: leží v repu jako výchozí brief. Odkazuje na adresáře mimo repo (`invoice-frontend`, `invoice-generator`, `invoice-pdf`). Ty tu nejsou a nejsou zde popsány.

## Key Takeaways

- **Technický základ**: T3 stack (App Router, Drizzle, NextAuth, Tailwind, tRPC), `pnpm`, komponenty Mantine, **celé řešení zabalené v Dockeru**, aby bylo snadno přenositelné.
- **Cíl**: sloučit správu výkazů a faktur do jedné aplikace. Dosavadní proces: ze souboru `perl-app/prace202607DB.txt` vygeneruje `perl-app/prace.pl` HTML pro každého dodavatele, to se ručně nahrává do PHP generátoru PDF.
- **Přepis `prace.pl`** do TypeScriptu ([[timesheet-parser-port-from-perl]]) jako jednoduchý endpoint, který zpracuje právě zobrazený výkaz a řekne přesné hodiny a případně výdělek.
- **Navržená struktura výstupu**: `timesheets[]` s poli `name`, `filepath` (např. `202601/Výkaz_KM_202601.htm`), `hours`, `overtime[]` (`date`, `hours`) a `errors[]` (např. `"Neznám: XYZ"`). Parser ([[timesheet-parser]]) ji dodržuje, jen chyby mají navíc číslo řádku.
- **UI**: zobrazení adresářové struktury po letech a měsících; editor ve stylu Emacsu s klasickými zkratkami (Ctrl/Cmd+S), protože soubor se bude stále reálně ukládat. Implementace: [[timesheet-editor-and-import]] (CodeMirror, Emacs i Vim).
- **Dodavatelé a odběratelé**: dodavatel = uživatel appky s vlastními výkazy a fakturami. Odběratel = položka `name` z výstupu parseru. Hodinové sazby předvyplnitelné per odběratel.
- **Faktury**: automatická číselná řada, předvyplnění dat (vystavení = poslední den měsíce, splatnost = 15. následujícího měsíce, plnění = poslední den měsíce, každé parametrizovatelné), položka „Dle výkazu {ALIAS}" s možností ruční úpravy, přidání i smazání položek, generování PDF přes Puppeteer. Ukázky PDF: `pdf-examples/` (`202609.pdf`, `HV - Výkaz 202607.pdf`). Detaily viz [[invoicing]].

## What It Changed in the Wiki

- [[timesheet-parser-port-from-perl]] — motivace přepisu
- [[timesheet-editor-and-import]] — požadavky na UI editoru
- [[timesheet]] — vymezení domény
- Poznámka: zadání neřeší ukládání výkazů do DB ani na disk výslovně. Rozhodnutí je popsáno v [[timesheet-files-on-disk-not-in-db]].
