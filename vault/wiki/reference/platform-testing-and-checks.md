---
title: Testy a kontroly
type: reference
subtype: guide
domain: platform
status: current
tags: [reference, guide, testing, vitest, lint]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [platform, platform-release-and-changelog, platform-tech-stack-and-conventions, timesheet-editor-and-import]
---

# Testy a kontroly

Co automatické testy pokrývají, co ne, a které příkazy spustit před tvrzením, že je změna hotová.

## Příkazy

| Příkaz | Co dělá | Zdroj |
|---|---|---|
| `pnpm test` | `vitest run` | `package.json::scripts.test` |
| `pnpm typecheck` | `tsc --noEmit` | `package.json::scripts.typecheck` |
| `pnpm lint` / `pnpm lint:fix` | `eslint .` | `package.json::scripts.lint` |
| `pnpm check` | `eslint . && tsc --noEmit` (lint + typecheck, **bez testů**) | `package.json::scripts.check` |
| `pnpm build` | `next build` | `package.json::scripts.build` |
| `pnpm format:check` / `format:write` | Prettier (`ts`, `tsx`, `js`, `jsx`, `mdx`) | `package.json::scripts` |

`pnpm check` nespouští vitest. Pro úplnou kontrolu spusť `pnpm check` i `pnpm test`.

## Co pokrývá vitest

Všech pět testovacích souborů je v `src/server/`:

| Soubor | Testuje |
|---|---|
| `src/server/timesheet/parse.test.ts` | `parseTimesheet` — parser výkazu (port z Perlu) |
| `src/server/timesheet/filename.test.ts` | `parsePeriodFromFilename`, `suggestedFilename` |
| `src/server/timesheet/workload.test.ts` | `computeWorkloadStats` — widget vytíženosti |
| `src/server/timesheet/tasks.test.ts` | `summarizeTasks`, `summarizeSubTasks` — souhrn úkolů |
| `src/server/changelog/parse.test.ts` | `parseChangelog` |

Soubory `vitest.config.*` v repu nejsou (použit default). Testy importují relativně, ne přes alias `~`. Jde o čisté funkce bez DB a sítě.

CLAUDE.md a README zmiňují jen parser, `filename.ts` a `workload.ts`. Skutečně jsou pokryté i `tasks` a `changelog/parse`. Viz [[timesheet-editor-and-import]] pro logiku parseru.

## Co nepokrývá nic

- Žádné integrační ani E2E testy přes DB nebo HTTP.
- Neotestované je zejména: tRPC routery a autorizace (`src/server/access/visibility.ts`), číslování faktur, PDF a QR (SPD), Nextcloud klient, SSRF guard, šifrování, path traversal ochrana v `storage.ts`, rate limit loginu.
- Bezpečnostní invarianty tedy hlídá jen review a ruční pen-test, ne automatické testy (jiné testy v repu nenalezeny).

## ESLint

`eslint.config.js` skládá `eslint-config-next/core-web-vitals`, `typescript-eslint` (recommended, type-checked, stylistic) a plugin `drizzle`.

- `drizzle/enforce-delete-with-where` a `drizzle/enforce-update-with-where` jako `error` (objekty `db`, `ctx.db`) — brání hromadnému `UPDATE`/`DELETE` bez `where`.
- `consistent-type-imports` s `separate-type-imports`; `no-misused-promises` s `checksVoidReturn.attributes: false`.
- `no-unused-vars` jako `warn` (prefix `_` pro ignorované argumenty). `reportUnusedDisableDirectives: true`.
- Pravidla `react-hooks/*` (vč. `set-state-in-effect`) přicházejí přes `eslint-config-next`, ne z lokálního konfigu — viz [[platform-ui-conventions]].

## Kdy co spustit

1. Po každé netriviální změně: `pnpm check` a `pnpm test`.
2. Před tvrzením, že je něco produkčně hotové: `pnpm build`. Typecheck nezachytí Next.js build chyby (konflikty rout apod.) a `next build` navíc validuje env (`src/env.js`).
3. Před release: viz [[platform-release-and-changelog]].
4. Změna `schema.ts`: i `pnpm db:generate` — viz [[platform-db-schema-overview]].

⚠️ V repu nebyla nalezena CI konfigurace; kontroly se spouštějí ručně.
