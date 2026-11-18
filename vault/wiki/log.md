# Wiki Log

Append-only operation log. Newest entries at the bottom.

## [2026-10-11] init | vault scaffolded
Created the vault skeleton, the folder set from `.claude/wiki.config.json`, and the scratch folder.
No pages yet.

## [2026-10-11] document | initial documentation of all domains
Documented timesheet, invoicing, nextcloud, access and a new cross-cutting domain platform (registered in `.claude/wiki.config.json`). 42 pages written as-built from code; domain landing pages, index and overview linked. Not written: `invoicing-payment-method-bank-transfer` (merged into `invoicing-pdf-rendering`) and `access-penetration-test-findings` (no report in the repo).

## [2026-10-11] issue | known defects filed from initial documentation
Zapsáno 16 stránek do `issues/` (zjištění z čtení kódu, neověřená); odkazy z landing stránek domén. Řešení odloženo.

## [2026-11-05] update | timesheet report export and workload weeks
Report route: každý výkaz v hromadném PDF začíná na nové stránce, přibyl `format=zip` s HTML výkazy. Odpracovanost: týden bez pracovního dne a bez zapsané práce se vynechává. Upraveny `timesheet-parser`, `timesheet-editor-and-import`, `timesheet-workload-and-task-summaries`.

## [2026-11-12] update | invoice numbering: free numbers and release on delete
Číslování: volná čísla v řadě s chronologickým předvýběrem při zakládání faktury (1.6.0) a vrácení čítače při smazání posledního konceptu (1.6.1). Upraveny `invoicing-numbering` a issue `invoicing-numbering-gaps` (část vyřešena, zbytek dál otevřený).

## [2026-11-18] decision | flat-tax income counted by due date
Nové rozhodnutí `invoicing-flat-tax-income-by-due-date`: přehled pásma paušální daně přiřazuje fakturu do roku podle splatnosti (náhrada za datum úhrady, které appka nemá). Uživatel rozhodl logiku ponechat, napojení na bankovní API je odložené. Odkaz přidán do `invoicing`.

## [2026-11-18] update | invoices without a timesheet, numbering by issue date
Faktura jde založit bez výkazu (`fromTimesheet`, číselnou řadu určí datum vystavení); předvýběr volného čísla se řídí datem vystavení místo měsíce výkazu. Opraveno pole Rok (posílalo text) a obnovení stavu v editoru po uložení. Upraveny `invoicing-numbering`, `invoicing-creation-flow`, `invoicing-invoices-and-items`.
