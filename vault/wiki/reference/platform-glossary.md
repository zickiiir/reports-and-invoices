---
title: Glosář
type: reference
subtype: glossary
domain: platform
status: current
tags: [reference, glossary, terminology]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [platform, access-users-and-roles, invoicing-invoices-and-items, invoicing-pdf-rendering, nextcloud-sync-conflict-handling, timesheet-editor-and-import]
---

# Glosář

Termíny, které se v kódu a UI používají česky nebo mají v projektu specifický význam. Anglické identifikátory v kódu zůstávají beze změny.

## Entries

| Termín | Význam | V kódu |
|---|---|---|
| **Výkaz** | Měsíční textový soubor odpracovaných hodin jednoho dodavatele. Není v DB, leží na disku. Viz [[timesheet-editor-and-import]] | `src/server/timesheet/storage.ts`, `DATA_DIR/{userId}/{YYYYMM}/` |
| **Období** (`period`) | Měsíc ve formátu `YYYYMM` (6 číslic). Identifikuje výkaz a čítač faktur | `src/server/timesheet/storage.ts::PERIOD_RE` |
| **Dodavatel** | Uživatel appky. Je to OSVČ / freelancer, který si vede vlastní výkazy a faktury, vystavuje je | `src/server/db/schema.ts::users` |
| **Odběratel / alias** | Zkratka z výkazu (např. `AC1`, `BETA`) s vlastní hodinovou sazbou. Vždy patří pod plátce | `src/server/db/schema.ts::customers` (pole `alias`) |
| **Plátce** | Skutečný fakturační subjekt (příjemce faktury). Jeden plátce může zastřešovat víc aliasů. Nelze smazat, pokud má odběratele nebo faktury | `src/server/db/schema.ts::payers` |
| **Role** | `super_user` (vše, zakládá účty), `senior_programmer` (své + read-only výkazy podřízených přes `managerId`), `developer` (jen své). Viz [[access-users-and-roles]] | `src/server/db/schema.ts::userRoleEnum` |
| **Podřízený** | Uživatel s `managerId` ukazujícím na seniora | `src/server/db/schema.ts::users` |
| **Faktura / položka** | Hlavička a řádky; položka se předvyplní za každý alias plátce s odpracovanými hodinami v období. Viz [[invoicing-invoices-and-items]] | `invoices`, `invoiceItems` |
| **Stav faktury** | `draft` (koncept), `issued` (vystavená), `paid` (zaplacená) | `src/server/db/schema.ts::invoiceStatusEnum` |
| **Číselná řada** | Čítač pořadí faktur na uživatele a období. Rozsah `month` (zvlášť na měsíc plnění) nebo `year` (jedna řada za rok) | `invoiceNumberCounters`, `invoiceNumberingScopeEnum` |
| **Datum vystavení / splatnosti / plnění** | `issueDate`, `dueDate`, `performanceDate`; předvyplňují se podle pravidel `InvoiceDateRules` | `src/server/db/schema.ts::invoices` |
| **DUZP** | Datum uskutečnění zdanitelného plnění. V UI a PDF se používá popisek „Datum uskut. plnění“ a v DB pole `performanceDate`. Zkratka DUZP sama se v kódu nevyskytuje | `src/server/pdf/invoice-template.ts` |
| **VS** | Variabilní symbol. Při vytvoření faktury se bez zadání převezme číslo faktury | `invoices.variableSymbol`, `src/server/api/routers/invoice.ts` |
| **KS** | Konstantní symbol (volitelný) | `invoices.constantSymbol` |
| **SPD** | „Short Payment Descriptor“, řetězec `SPD*1.0*...` v QR platbě; pole oddělená `*`, v hodnotách se `*` a `:` ořezávají (`sanitizeSpdText`), aby nešlo vložit další pole. Viz [[invoicing-pdf-rendering]] | `src/server/pdf/czech-payment.ts` |
| **IČ / DIČ** | Identifikační číslo (8 číslic) a daňové identifikační číslo (`CZ` + 8–10 číslic) — validace ve formuláři nastavení | `src/app/(app)/settings/settings-form.tsx::profileSchema` |
| **Aplikační heslo** | Heslo vytvořené v Nextcloudu speciálně pro appku (ne hlavní heslo účtu). Ukládá se šifrované AES-256-GCM | `src/server/nextcloud/crypto.ts`, `users.nextcloudAppPasswordEnc` |
| **WebDAV** | Protokol, kterým server-side sync zapisuje soubory do Nextcloudu. Jednosměrný (appka → Nextcloud) | `src/server/nextcloud/` |
| **Kolize (conflict)** | Soubor na Nextcloudu, který appka sama nevytvořila; bez výslovného potvrzení se nepřepíše. Viz [[nextcloud-sync-conflict-handling]] | `users.nextcloudSyncedPeriods` |
| **Lokální složka** | Alternativní záloha výkazů přes File System Access API (Chrome/Edge), běží v prohlížeči | `src/components/local-sync.ts` |
| **Root** | První `super_user` zakládaný seedem z `SEED_*` | `scripts/seed/users.ts::seedRootUser` |
| **Seed** | Idempotentní skript pro založení dat; `seed` = jen root (produkce), `seed:dev` = i demo data | `scripts/seed/` |
| **Changeset** | Soubor v `.changeset/` popisující změnu a typ bumpu verze. Viz [[platform-release-and-changelog]] | `.changeset/` |
| **Minimální vytíženost** | Widget na úvodní stránce porovnávající odpracované hodiny s cílem odvozeným z pracovních dnů a hodin | `src/server/timesheet/workload.ts` |

## Exceptions

- Některé pojmy z fakturace (číselná řada v roce, pravidla dat) jsou popsané podrobněji v [[invoicing-invoices-and-items]]. Tento glosář je jen rozcestník.
- Rozsah sloupce `invoiceNumberCounters.period` je `varchar(6)`; jak se `period` skládá pro rozsah `year`, tady není ověřeno.
