---
title: Editor výkazů, uložení a import
type: concept
domain: timesheet
status: current
tags: [editor, import, ui, timesheet]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [timesheet, timesheet-parser, timesheet-disk-storage, timesheet-workload-and-task-summaries, timesheet-local-folder-sync, access-users-and-roles, access-role-visibility, nextcloud-sync-conflict-handling, invoicing-pdf-rendering]
---

# Editor výkazů, uložení a import

Stránka `/timesheets` je CodeMirror editor surového textu s živým přepočtem, náhledem HTML/PDF, stažením a hromadným importem starých souborů.

## The Problem It Solves

Výkaz je soubor, který se ve skutečnosti neustále ukládá ([[source-2026-zadani-original-brief]]). Editor musí fungovat jako textový editor s obvyklými zkratkami a přitom okamžitě ukázat hodiny, přesčasy a chyby.

## How It Works

### Stránka a oprávnění

`src/app/(app)/timesheets/page.tsx::TimesheetsPage` načte `api.user.me()` a `api.timesheet.visibleUsers()` a předá je do `TimesheetEditor`. Výběr „Za koho" se zobrazí, když je viditelných uživatelů víc než jeden (`timesheetRouter.visibleUsers` používá `getReadableTimesheetUserIds`). Senior tak čte výkazy podřízených ([[access-role-visibility]]).

- `canEdit = isOwner || me.role === "super_user"`. Ostatní vidí badge „Jen ke čtení".
- Server: `listPeriods` a `read` kontrolují `assertCanReadTimesheet`, `save` a `importBatch` kontrolují `assertOwnerOrSuperUser` (`src/server/api/routers/timesheet.ts::timesheetRouter`).
- Stav (`userId`, `period`) je v URL přes `nuqs` (`useQueryStates`). Levý panel seskupuje období po letech.

### Editor

- CodeMirror 6 se sadou `basicSetup`, zalamováním řádků a keymapou `emacs()` nebo `vim()` podle `editorKeybinding`. `Mod-s` (Ctrl/Cmd+S) s `Prec.highest` spouští uložení.
- Nastavení editoru (zkratky, styl kurzoru `line`/`block`, čísla řádků) patří uživateli. Ukládá je `api.user.updateEditorPreferences` (`src/server/api/routers/user.ts`, sloupce `editorKeybinding`, `cursorStyle`, `showLineNumbers` v `users`; viz [[access-users-and-roles]]). Popover má explicitní tlačítko „Uložit". Změna editor znovu vytvoří.
- Načtený obsah se vkládá s `Transaction.addToHistory.of(false)`, takže první Undo nesmaže celý výkaz. Kurzor se po otevření dává na konec (nový den se přidává dolů). Refetch po uložení nepřepíše rozepsaný text (`dirtyRef`, `loadedKeyRef`).
- Živý přepočet: `updateListener` volá `parseTimesheet(text, period)` přímo v prohlížeči (parser je sdílený modul, [[timesheet-parser]]). Tabulka „Přehled" ukazuje hodiny po aliasech, sazbu z `customer.list` (`defaultHourlyRate`), součet v Kč, přesčasy a nerozpoznané řádky.
- Panel napravo doplňuje `WorkloadCard` (jen vlastní výkaz) a modal úkolů ([[timesheet-workload-and-task-summaries]]).

### Uložení

`timesheet.save` → `saveTimesheet` ([[timesheet-disk-storage]]) → `syncTimesheetToNextcloud` (z `src/server/nextcloud/sync.ts`, nikdy nevyhazuje) → vrací výsledek parseru plus `nextcloudSync` (`"synced" | "conflict" | "failed" | "not-configured"`). Klient (`saveMutation.onSuccess`) pak:

1. zobrazí „Výkaz uložen" a invaliduje dotazy,
2. zkusí `writeFileToSyncDirectory` do lokální složky ([[timesheet-local-folder-sync]]),
3. podle `nextcloudSync` zobrazí notifikaci (modrá = synced, oranžová = conflict s odkazem na Nastavení, červená = failed).

Konflikty řeší [[nextcloud-sync-conflict-handling]].

### Náhled a stažení

- Tlačítka HTML/PDF jsou aktivní jen bez neuložených změn (`dirty`), protože route čte uložený soubor. `openPreview` otevře `ReportPreviewModal` s iframe na `/api/timesheets/report?userId&period&alias&format`.
- `src/app/api/timesheets/report/route.ts::GET` ověří přihlášení a `assertCanReadTimesheet`, vyparsuje uložený text, pro vybrané aliasy složí `renderTimesheetBody` (každý výkaz na nové stránce) a pro `format=pdf` volá `renderHtmlToPdf` ([[invoicing-pdf-rendering]]). Odpověď je `inline`. `format=zip` vrací jako přílohu `Vykazy_HTML_{YYYYMM}.zip` se samostatným `.htm` pro každý alias (tlačítko „HTML ZIP"; znaky aliasu mimo písmena, číslice, `_` a `-` se v názvu souboru nahrazují `_`). Chyby: 401, 400, 403, 404 (alias bez záznamů).
- Stahování surových souborů: `src/app/api/timesheets/download/route.ts::GET`. Jedno období vrací `prace{YYYYMM}.txt` (`text/plain`), víc období ZIP (`jszip`) `vykazy_{první}-{poslední}.zip`. Kontroluje přihlášení, formát období a `assertCanReadTimesheet`.
- `ReportPreviewModal` stahuje přes `fetch` + blob, aby šlo `inline` hlavičku použít pro iframe.
- Odkazy „Fakturovat" vedou na `/invoices/new?year&month&alias` (jen vlastní výkaz, viz [[invoicing]]).

### Hromadný import

`timesheet-import-modal.tsx::TimesheetImportModal`: drag & drop souborů (`@mantine/dropzone`, více najednou), období se odvodí z názvu (`parsePeriodFromFilename`) a jde ručně opravit. Tabulka řádků má badge „nový" / „přepíše existující" / „nerozpoznáno". Tlačítko Importovat je aktivní, jen když mají všechny řádky platné období. Volá `timesheet.importBatch`, které pro každý soubor uloží výkaz a zavolá Nextcloud sync. Odpověď nese za soubor `period`, `totalHours`, `errors`, `nextcloudSync`.

Vzor „tabulka s náhledem před potvrzením" sdílí i Nextcloud synchronizace ([[nextcloud-sync-conflict-handling]]). Rozdíl: import nemá serverový náhled a kolize s existujícím výkazem **přepíše** (upozorní jen badge). Konfliktní soubor na Nextcloudu se nepřepíše.

## Implementation

- `src/app/(app)/timesheets/timesheet-editor.tsx::TimesheetEditor`
- `src/app/(app)/timesheets/timesheet-import-modal.tsx::TimesheetImportModal`
- `src/app/(app)/timesheets/task-summary-modal.tsx::TaskSummaryModal`
- `src/components/report-preview-modal.tsx::ReportPreviewModal`
- `src/server/api/routers/timesheet.ts::timesheetRouter`
- `src/app/api/timesheets/report/route.ts`, `src/app/api/timesheets/download/route.ts`

## Trade-offs

- `parseTimesheet` běží v klientském bundlu i na serveru. Parser proto nesmí importovat nic server-only.
- Import přepíše existující období bez serverové kontroly. Uživatel vidí jen badge.
- Import ukládá soubory sekvenčně a při chybě uprostřed zůstanou předchozí uložené.

## Related Concepts

- [[timesheet-parser]], [[timesheet-disk-storage]], [[timesheet-local-folder-sync]]

## Open Questions

- tRPC `timesheet.parseLive` a `storage.ts::parseTimesheetLive` UI nevolá (editor parsuje lokálně). Pravděpodobně mrtvý kód.
- Download route nevaliduje `userId` jako UUID před `assertCanReadTimesheet`. Špatné hodnoty skončí jako 403 nebo chyba ve `storage.ts`.
- Report route převádí alias na velká písmena, ale neodstraňuje diakritiku jako `normalizeAlias`. Alias s diakritikou v URL by nenašel záznamy (v UI se ale posílají aliasy z parseru).
