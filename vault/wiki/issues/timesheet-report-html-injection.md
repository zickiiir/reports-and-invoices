---
title: Report výkazu vkládá popis a alias do HTML bez escapování
type: issue
domain: timesheet
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-10-11
related: [timesheet-parser, timesheet-editor-and-import, invoicing-pdf-rendering, access-role-visibility, timesheet]
---

# Report výkazu vkládá popis a alias do HTML bez escapování

Text z výkazu se bez escapování dostává do HTML, které se zobrazuje v prohlížeči i renderuje v Puppeteeru.

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

`src/server/timesheet/parse.ts::renderTimesheetBody` vkládá `description` a alias do HTML bez escapování. Výsledek vrací `src/app/api/timesheets/report/route.ts` jako `text/html` a používá se i pro PDF. `escapeHtml` existuje jen v šabloně faktury (`src/server/pdf/invoice-template.ts`) a `CLAUDE.md` zmiňuje escapování jen tam. Senior čte výkazy podřízených, takže se k němu může dostat cizí text.

## Why Not Fixed Now

Je třeba nejdřív potvrdit reálný dopad (kde přesně se HTML zobrazuje a jaké hlavičky route posílá). Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Escapovat všechny textové a atributové hodnoty při renderu výkazu stejným vzorem jako v šabloně faktury (sdílený helper) a zvážit CSP/`Content-Disposition` pro report route.
