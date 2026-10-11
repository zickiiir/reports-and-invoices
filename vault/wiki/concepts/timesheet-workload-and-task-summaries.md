---
title: Odpracovanost a souhrny podle úkolů
type: concept
domain: timesheet
status: current
tags: [workload, tasks, summary, timesheet]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [timesheet, timesheet-parser, timesheet-editor-and-import, access-users-and-roles]
---

# Odpracovanost a souhrny podle úkolů

Dva přehledy nad výstupem parseru (`PersonTimesheet[]`): porovnání odpracovaných hodin s fondem (`workload.ts`) a součty času podle úkolu a podúkolu (`tasks.ts`). Oba jsou čisté funkce bez I/O.

## The Problem It Solves

Dodavatel chce vědět, jak stojí s hodinami vůči plánu měsíce, a kolik času šlo na který úkol nebo tiket. Parser dává jen součty po aliasech.

## How It Works

### Odpracovanost (`workload.ts`)

`computeWorkloadStats(today, settings, perPerson)` vrací `WorkloadStats` s týdny (`weeks`) a měsícem (`month`).

Vstup `WorkloadSettings` pochází z nastavení uživatele ([[access-users-and-roles]]): `workdays` (ISO 1 = pondělí … 7 = neděle), `hoursPerWorkday` a volitelný `monthlyHoursGoal`. Sloupce jsou v `src/server/db/schema.ts::users`.

- **Fond měsíce**: počet pracovních dnů × `hoursPerWorkday` (`maxTargetHours`).
- **Osobní cíl**: `monthlyHoursGoal`, jinak maximum. Denní tempo je `effectiveDailyRate = goalHours / pracovní dny měsíce`. Bez cíle se rovná `hoursPerWorkday`.
- **Týdny**: týden pondělí–neděle, první a poslední ořezané na hranice měsíce. `startDate`/`endDate` ukazují první a poslední skutečný pracovní den týdne. `notStarted` je pravda, když týden dnes ještě nezačal.
- **`buildProgress`**: cíl k dnešku = uplynulé pracovní dny × denní tempo. `actualHours` počítá všechny záznamy v kalendářním rozsahu (včetně víkendů). `diffHours = actualHours - targetHours` (záporné = pozadu).
- `today` musí ležet v měsíci, pro který je výkaz naparsovaný.

Použití: editor (jen pro vlastní výkaz, `isOwner`) a úvodní stránka (`src/app/(app)/page.tsx`). Referenční den v editoru: dnešek pro aktuální měsíc, poslední den měsíce pro minulý, první den pro budoucí. Počítá se z živého výsledku parseru, takže se aktualizuje při psaní.

Zobrazení: `src/components/workload-widget.tsx::WorkloadSection`. Hodiny se v UI vždy zaokrouhlují nahoru (`Math.ceil`). Sdílí ho karta na úvodní stránce i editor (`WorkloadCard` v `dashboard-cards.tsx`).

### Souhrny úkolů (`tasks.ts`)

Úkol = první popisný řádek záznamu. Zbylé řádky jsou podřádky (typicky číslo tiketu).

- `summarizeTasks` — součet minut podle `alias` + úkol. Klíč používá `normalize` (trim, sloučené mezery, malá písmena v locale `cs`), takže „Oprava exportu" a „oprava  exportu" se sečtou. Každý úkol má `details`: rozpad podle odlišné sady podřádků. Čas záznamu se mezi podřádky nedělí. Řazení: čas sestupně, pak alias, pak název.
- `UNTITLED_TASK` (`"(bez popisu)"`) — záznam bez popisu (např. holé minuty).
- `summarizeSubTasks` — součet podle jednotlivého podřádku napříč úkoly. Záznam s víc podřádky najednou (`shared`) se do `minutes` nepočítá, protože výkaz neříká, jak se čas dělí. Vypíše se zvlášť s číslem řádku. Stejný podřádek dvakrát v jednom záznamu se počítá jednou.
- `totalMinutesOfSubTasks` — celkový součet včetně sdílených záznamů, každý záznam jen jednou (klíč `alias:idx`).
- `cleanSubLine` odstraní pomlčku, kterou po parseru nese podřádek `-- …`.

UI `src/app/(app)/timesheets/task-summary-modal.tsx::TaskSummaryModal` má dva pohledy („Podle úkolů", „Podle podřádků (tiketů)"), filtr aliasu a hledání. Zobrazuje hodiny (`H:MM`) a MD. Člověkoden je pevně 8 hodin (`MINUTES_PER_MAN_DAY`), záměrně ne `hoursPerWorkday`. Tlačítko „řádek N" přeskočí v editoru na sdílený záznam (`onJumpToLine`).

## Implementation

- `src/server/timesheet/workload.ts`: `computeWorkloadStats`, `buildProgress`, `countWorkdays`.
- `src/server/timesheet/tasks.ts`: `summarizeTasks`, `summarizeSubTasks`, `totalMinutesOfSubTasks`, `UNTITLED_TASK`.
- Testy: `workload.test.ts` (ořezání týdnů, vlastní pracovní dny, osobní cíl 154 h = 7 h/den, hodiny mimo měsíc se nepočítají), `tasks.test.ts` (součty napříč dny, oddělení podle zákazníka, placeholder, sdílené záznamy).

## Trade-offs

- Pracovní dny určují jen cíl. Hodiny odpracované o víkendu se do skutečnosti počítají.
- Sdílené záznamy nejsou nikam přiřazeny. Uživatel je musí rozdělit ručně v textu.
- `tasks.ts` závisí na tom, že parser nechá `--` jako `- ` (viz [[timesheet-parser]]).

## Related Concepts

- [[timesheet-editor-and-import]] — kde se přehledy zobrazují
- [[timesheet-parser]] — zdroj dat
