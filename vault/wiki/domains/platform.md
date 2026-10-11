---
title: Platform
type: domain
domain: platform
status: current
tags: [domain, platform, stack, docker, release]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [platform-tech-stack-and-conventions, platform-db-schema-overview, platform-env-variables, platform-dev-environment, platform-docker-production, platform-release-and-changelog, platform-ui-conventions, platform-testing-and-checks, platform-glossary]
---

# Platform

Technický základ appky „Výkazy a faktury“: stack, konfigurace, DB schéma, vývojové a produkční prostředí, release a sdílené UI konvence.

## Overview

- **Purpose**: vše, co není doménová logika výkazů, faktur, Nextcloudu ani přístupu — běh, build, konfigurace, deploy, verze.
- **Path**: kořen repozitáře (`package.json`, `Dockerfile`, `docker-compose*.yml`, `docker-entrypoint.sh`, `next.config.js`, `drizzle.config.ts`), `src/env.js`, `src/server/db/`, `src/trpc/`, `src/components/`, `scripts/seed/`, `.changeset/`.
- **Status**: aktivní. Self-hosted, jeden kontejner s appkou a jeden s Postgresem, bez Redis, fronty a reverse proxy (`docker-compose.yml`).
- **Verze**: `package.json::version` (v době psaní `1.2.4`) se zobrazuje v UI (`src/app/(app)/layout.tsx::appVersion`).

## Key Responsibilities

- Stack: Next.js App Router, tRPC v11, Drizzle ORM (Postgres), NextAuth v5, Mantine v9 — viz [[platform-tech-stack-and-conventions]].
- Schéma DB, prefix tabulek a migrace — viz [[platform-db-schema-overview]].
- Validace a katalog env proměnných — viz [[platform-env-variables]].
- Lokální vývoj a vývoj v Dockeru — viz [[platform-dev-environment]].
- Produkční Docker nasazení — viz [[platform-docker-production]].
- Release přes Changesets a changelog v UI — viz [[platform-release-and-changelog]].
- Sdílené UI vzory — viz [[platform-ui-conventions]].
- Testy a kontroly — viz [[platform-testing-and-checks]].
- Slovník pojmů — viz [[platform-glossary]].

## How It Fits

Platform neobsahuje doménovou logiku. Ostatní domény na ní stojí:

- [[timesheet]] ukládá výkazy na disk pod `DATA_DIR` (ne do DB) — viz [[platform-env-variables]].
- [[invoicing]] využívá Puppeteer s Chromiem z image — viz [[platform-docker-production]] a [[invoicing-pdf-rendering]].
- [[nextcloud]] a [[access]] používají `AUTH_SECRET` (šifrovací klíč, JWT session).
- Autorizace se nedělá na úrovni platformy: `protectedProcedure` ověřuje jen přihlášení (`src/server/api/trpc.ts::protectedProcedure`), vlastnictví řeší každý router — viz [[access-users-and-roles]].

## Documentation Map

- [[platform-tech-stack-and-conventions]] — stack, `proxy.ts`, webpack dev, patch mantine-react-table
- [[platform-db-schema-overview]] — tabulky, enumy, migrace
- [[platform-env-variables]] — env katalog
- [[platform-dev-environment]] — lokální vývoj, seed účty
- [[platform-docker-production]] — produkce, volumes, redeploy
- [[platform-release-and-changelog]] — Changesets, release skill
- [[platform-ui-conventions]] — tabulky, modály, ukládání nastavení
- [[platform-testing-and-checks]] — vitest, `pnpm check`
- [[platform-glossary]] — glosář

## Known Issues / Not Yet Documented

- README a kód se v drobnostech rozcházejí (kolize kontejnerů dev/prod, obsah testů) — detaily v jednotlivých stránkách.
- V `drizzle/` je jen migrace `0000`; vývoj používá `db:push` — viz [[platform-db-schema-overview]].
- Není CI konfigurace v repozitáři (nenalezena při inspekci).

## Otevřené issues

- [[platform-signature-dropzone-autosave]] — Dropzone podpisu v Nastavení ukládá okamžitě, odporuje pravidlu explicitního Save
- [[platform-docs-and-config-drift]] — Nesoulady v dokumentaci a konfiguraci (CLAUDE.md, README, migrace)
