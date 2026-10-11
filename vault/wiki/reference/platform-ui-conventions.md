---
title: UI konvence
type: reference
subtype: convention
domain: platform
status: current
tags: [reference, convention, ui, mantine, tables]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [platform, platform-tech-stack-and-conventions, timesheet-editor-and-import, nextcloud-sync-conflict-handling]
---

# UI konvence

Sdílené vzory, které mají nové seznamy, modály a formuláře dodržet. Otevři před přidáním tabulky, modálu nebo nastavení.

## Rules / Entries

### Tabulky

- Každá tabulka (zákazníci, plátci, faktury, admin uživatelé) používá hook `src/components/use-table-ui-state.ts::useTableUiState(key)`. Klíč musí být unikátní na stránku. V kódu jsou použité klíče `customers`, `payers`, `invoices`, `users`.
- Hook ukládá hustotu řádků (`density`, default `xs`) a viditelnost sloupcových filtrů a globálního vyhledávání do `localStorage` pod klíčem `table-ui:<key>` (`useLocalStorage` z `@mantine/hooks`).
- Vyhledávání a filtry jsou defaultně **vždy zapnuté** (`showColumnFilters: true`, `showGlobalFilter: true`), na rozdíl od defaultu `mantine-react-table`. Uživatel je může vypnout, volba se pamatuje.
- Použití v tabulce: `state: { ...tableUiState.state }` a předat `onDensityChange`, `onShowColumnFiltersChange`, `onShowGlobalFilterChange` (vzor: `src/app/(app)/invoices/invoices-list.tsx::InvoicesList`).
- Běžné volby tabulek: `enableColumnActions: false`, `mantineTableProps: { striped: true, highlightOnHover: true }`, klik na řádek otevře detail.
- Datumy se formátují `dayjs(...).format("D. M. YYYY")`, částky `toLocaleString("cs-CZ")` + „Kč“.

### Filtr stavu

- Filtr sloupce se stavem je `filterVariant: "select"` s `mantineFilterSelectProps: { searchable: false, data: [...] }`, tedy ne combobox s volným textem (`invoices-list.tsx`, `customers-table.tsx`, `payers-table.tsx`).
- Seznam faktur má navíc záložky (`Tabs`) podle stavu `draft` / `issued` / `paid` / vše.

### Modály „náhled a potvrzení“

Použité pro import výkazů (`src/app/(app)/timesheets/timesheet-import-modal.tsx`, viz [[timesheet-editor-and-import]]) a ruční synchronizaci s Nextcloudem (`src/app/(app)/settings/nextcloud-sync-modal.tsx::NextcloudSyncModal`, viz [[nextcloud-sync-conflict-handling]]).

1. Nejdřív read-only náhled (query s `enabled: opened`).
2. Tabulka řádků s checkboxy a barevným badge stavu (`STATUS_BADGE`: nový, již synchronizováno, koliduje, nepodařilo se ověřit).
3. Výchozí výběr se **odvozuje** přes `useMemo` z dat náhledu (nové a známé řádky zaškrtnuté, kolize a chyby ne).
4. Ruční změna uživatele žije v nullable `useState<Set<string> | null>(null)`. `selected = manualSelection ?? defaultSelection`. Po první ruční změně přebírá override.
5. Zavření modálu jde jen přes `handleClose`, který override vynuluje, aby další otevření začalo čerstvým náhledem.
6. Potvrzovací tlačítko je `disabled`, dokud nic není vybráno, a v popisku ukazuje počet.

Proč `useMemo` + nullable override a ne `useEffect` + `setState`: pravidlo `react-hooks/set-state-in-effect` (z `eslint-config-next`) takový zápis zakazuje. Výjimky se potlačují jen s komentářem proč, např. detekce browser API po hydrataci (`src/app/(app)/settings/settings-form.tsx::SettingsForm`, `eslint-disable-next-line react-hooks/set-state-in-effect`).

Kolize se nikdy nepřepisují automaticky; uživatel je musí zaškrtnout vědomě.

### Nastavení se ukládá výslovně

Každá sekce nastavení má vlastní tlačítko „Uložit“ (`settings-form.tsx`: „Uložit profil“, „Uložit vzhled“, další „Uložit“). Změna hodnoty nikdy nepersistuje sama. Nové nastavení proto vždy spáruj s tlačítkem Save. (Pravidlo vychází i z preference uvedené v uživatelské paměti projektu; v kódu odpovídá chování `settings-form.tsx`.)

### Ostatní

- Notifikace přes `@mantine/notifications` (`notifications.show({ color, message })`), zelená pro úspěch, červená pro chybu.
- Texty UI jsou česky. Kód, identifikátory a názvy enumů anglicky.
- Téma: `src/mantine-theme.ts::theme`; uživatelská volba barevného schématu a primární barvy se ukládá na uživatele v DB (`users.colorScheme`, `users.primaryColor`) a synchronizuje se po loginu — viz [[platform-db-schema-overview]].
- Dialogy a PDF náhledy v iframe: PDF a report endpointy mají `X-Frame-Options: SAMEORIGIN`, zbytek appky `DENY` (`next.config.js::headers`), viz [[platform-tech-stack-and-conventions]].
- Patch `mantine-react-table` — viz [[platform-tech-stack-and-conventions]].

## Exceptions

- `invoices-list.tsx` filtruje stav zároveň záložkami a select filtrem; ostatní tabulky záložky nemají.
- `useTableUiState` je ve zdrojáku `use-table-ui-state.ts` používán jen v těchto čtyřech tabulkách. Novější tabulky (nejsou nalezeny) by ho měly použít také.
