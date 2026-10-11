---
title: Odběratel (alias) je podřízen plátci a faktura vzniká za plátce
type: decision
domain: invoicing
status: active
tags: [decision, payers, customers]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [invoicing, invoicing-payers-and-customers, invoicing-creation-flow]
---

# Odběratel (alias) je podřízen plátci a faktura vzniká za plátce

Každý odběratel (alias z výkazu) patří právě pod jednoho plátce a faktura se zakládá za plátce, ne za alias.

## Context

Z README a komentářů v kódu: výkaz obsahuje aliasy (`AC1`, `BETA`), ale fakturu skutečně platí jeden subjekt. Jeden plátce (např. „Acme Software s.r.o.“) může zastřešovat víc aliasů, protože platí za víc týmů (`src/server/db/schema.ts::payers`, komentář u tabulky).

## Decision

- `customers.payerId` je povinný cizí klíč na `payers` (`src/server/db/schema.ts::customers`).
- Při zakládání faktury uživatel vybírá plátce. Appka přidá jednu položku za každý jeho alias s odpracovanými hodinami v období (README, „Datový model — plátce vs. odběratel“, `src/server/api/routers/invoice.ts::invoiceRouter`).
- Faktura nese `payerId`, ne odběratele (`invoices.payerId`). Položky aliasy nezachycují.

## Alternatives Considered

V dokumentaci projektu (README, CLAUDE.md) žádné odmítnuté alternativy zapsané nejsou. Z kódu je zřejmé jen to, co se nezvolilo: faktura per alias.

## Consequences

- Jedna faktura sloučí víc aliasů do víc řádků ([[invoicing-creation-flow]]).
- `onDelete: restrict` na `payerId` brání smazání plátce s odběrateli nebo fakturami. Vyřazení řeší `archived`, viz [[invoicing-payers-and-customers]].
- Vazba položky na alias se po úpravě jména ztrácí, editor ji odvozuje znovu z plátce a období.
- Alias musí být v rámci dodavatele unikátní (`customer_user_alias_unique`).

## Status

Aktivní. Stav odpovídá kódu k 2026-10-11.
