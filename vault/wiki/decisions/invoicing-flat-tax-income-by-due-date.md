---
title: Příjem pro pásmo paušální daně se počítá podle data splatnosti
type: decision
domain: invoicing
status: active
tags: [decision, flat-tax, dashboard, income]
created: 2026-11-18
updated: 2026-11-18
sources: [code-inspection, user-decision]
related: [invoicing, invoicing-invoices-and-items, invoicing-dates-and-line-items]
---

# Příjem pro pásmo paušální daně se počítá podle data splatnosti

Přehled pásma paušální daně na dashboardu přiřazuje fakturu do roku podle data splatnosti (`dueDate`). Když splatnost chybí, použije datum vystavení (`issueDate`).

## Context

- Příjem OSVČ s daňovou evidencí patří do roku, kdy platba skutečně přišla. Rozhoduje datum úhrady, ne splatnost ani vystavení.
- Faktura v appce datum úhrady nemá. Stav `paid` neříká, kdy peníze přišly.
- Výpočet je v `src/server/invoicing/flat-tax-limit.ts::computeFlatTaxLimitStats`, datum vybírá `assumedPaymentDate`. Volá ho `src/app/(app)/page.tsx`, zobrazuje `src/app/(app)/dashboard-cards.tsx`.

## Decision

- Splatnost je vědomá náhrada za datum úhrady. Předpoklad: odběratel platí v den splatnosti.
- Do součtu jdou jen faktury `issued` a `paid`. Koncepty se sčítají zvlášť (`draftTotal`), jen pro informaci.
- Uživatel 2026-11-18 rozhodl, že tahle logika zůstane. Ruční zadávání data úhrady se teď nezavádí.

## Alternatives Considered

- **Ruční datum úhrady** (vyplnit třeba při přepnutí na `paid`): přesnější, ale znamená ruční práci navíc. Zatím odmítnuto.
- **Napojení na bankovní API**: datum úhrady by se bralo z příchozí platby. Odloženo do budoucna. Až vznikne, nahradí splatnost jako zdroj data.

## Consequences

- Faktura vystavená v prosinci se splatností v lednu se počítá do nového roku. To je správně, jen když platba opravdu přišla v lednu.
- Pozdní nebo předčasná platba přes přelom roku dá v přehledu jiný rok, než jaký platí pro daň. Přehled je jen informativní, daňové přiznání se z něj neodvozuje.

## Status

Aktivní. Stav odpovídá kódu k 2026-11-18.
