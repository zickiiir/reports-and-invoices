---
title: Release a changelog
type: runbook
domain: platform
status: current
tags: [operations, runbook, release, changesets]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [platform, platform-docker-production, platform-testing-and-checks]
---

# Release a changelog

Jak se mění verze appky, kde vzniká changelog a jak se zobrazí v UI. Spouští se při každé netriviální změně a při vydání verze.

## Preconditions

- Čistý pracovní strom nebo alespoň vědomě oddělené nesouvisející změny.
- Prošlé `pnpm check` (a `pnpm build`, pokud se změna týká rout nebo konfigurace) — viz [[platform-testing-and-checks]].

## Mechanika

- Verzi a `CHANGELOG.md` spravuje Changesets (`@changesets/cli`, `.changeset/config.json`). Appka je `"private": true`, nic se nepublikuje na npm.
- Konfigurace: `commit: false`, `baseBranch: master`, `privatePackages: { version: true, tag: false }` — verze se bumpne, ale změny se nekomitují a netaguje se.
- Verze v `package.json::version` se zobrazuje v hlavičce (`src/app/(app)/layout.tsx` předává `packageJson.version` jako `appVersion` do `nav-shell`). Po nasazení tak jde poznat, zda běží aktuální kód. Verzi nikdy neupravuj ručně.
- Aktuálně nejsou v `.changeset/` žádné čekající changesety (jen `README.md` a `config.json`).

## Steps

1. Ke změně přidej changeset: `pnpm changeset` (typ bumpu `patch` / `minor` / `major` + krátký popis). Pravidlo projektu: k netriviální změně changeset patří, pokud uživatel výslovně neřekne jinak.
2. Soubor je `.changeset/<kebab-name>.md` s frontmatterem `"reports-and-invoices": patch` a krátkým českým popisem z pohledu uživatele (ne soubory a funkce). Text se objeví v `CHANGELOG.md` i v UI.
3. Vydání: `pnpm changeset:version` spotřebuje changesety, zapíše `CHANGELOG.md` a bumpne `package.json`. Nic nekomituje ani netaguje — zkontroluj diff a commitni ručně.
4. Nasazení viz [[platform-docker-production]].

## Release skill

`.claude/skills/release/SKILL.md` automatizuje postup pro agenta. Spouští se na pokyn „povyš verzi“, „bump version“, „vydej verzi“, „release“. Kroky:

1. Zjisti, co čeká (`git status`, `git diff`, existující changesety). Čistý strom bez changesetu = nic k vydání.
2. `pnpm check`, případně `pnpm build`.
3. Napiš changeset (pokud jej nepokrývá existující).
4. Commit změny samotné zvlášť (jen zdrojáky, ne verzové soubory), s konvenčním prefixem.
5. `pnpm changeset:version`.
6. Commit `chore: release X.Y.Z` s `package.json`, `CHANGELOG.md` a odstraněnými changesety.
7. `git push`.

Pravidla commitů: anglicky, vysvětlit proč (ne co), bez `Co-Authored-By`. Zákazy: nespouštět `pnpm prod:docker` ani sahat na kontejnery a volumes (produkce drží reálné výkazy), nepoužívat `--force`/`--no-verify`, nechat blok `nextjs-agent-rules` v `AGENTS.md` beze změny.

## Changelog v UI

- `src/app/(app)/changelog-modal.tsx::ChangelogModal` se otevře kliknutím na verzi v hlavičce, nadpis „Historie verzí“. Data se načtou, až když je modal otevřený (`enabled: opened`).
- Server: `src/server/api/routers/meta.ts::metaRouter.changelog` (`protectedProcedure`, bez kontroly vlastnictví — obsah je pro všechny stejný) čte `CHANGELOG.md` z `process.cwd()` při každém volání a vrací `parseChangelog`. Při chybě čtení vrací prázdný řetězec → modal ukáže „Historie verzí není k dispozici.“
- `src/server/changelog/parse.ts::parseChangelog` rozdělí markdown regexem `^## +(\S+)\s*$` na `{ version, body }`, nejnovější první. Text před prvním `## <verze>` zahodí. Test: `src/server/changelog/parse.test.ts`.
- Nadpisy sekcí Changesets (`Major Changes`, `Minor Changes`, `Patch Changes`) se v UI překládají na „Zásadní změny“, „Novinky“, „Opravy“ (`changelog-modal.tsx::SECTION_LABELS`).
- `Dockerfile` kopíruje `CHANGELOG.md` do image, jinak by modal v produkci byl prázdný.

## Verification

`git diff package.json CHANGELOG.md` ukáže novou verzi a záznam. Po nasazení je nová verze vidět v hlavičce.

## Rollback

Před commitem: `git checkout package.json CHANGELOG.md` a obnov smazané changeset soubory. Po pushi vydej opravnou verzi (nepřepisuj publikovanou historii).

## Failure Modes

- Jazyk changelogu se mísí: v `CHANGELOG.md` je záznam `1.2.2` v angličtině, ostatní česky. Skill vyžaduje češtinu.
- Rozbitá struktura `CHANGELOG.md` (jiný formát nadpisu verze) → `parseChangelog` verzi nenajde a modal je prázdný.
