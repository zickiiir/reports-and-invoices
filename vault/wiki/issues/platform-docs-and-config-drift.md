---
title: Nesoulady v dokumentaci a konfiguraci (CLAUDE.md, README, migrace)
type: issue
domain: platform
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-10-11
related: [platform-docker-production, platform-dev-environment, platform-db-schema-overview, platform-testing-and-checks, access-security-invariants, platform]
---

# Nesoulady v dokumentaci a konfiguraci (CLAUDE.md, README, migrace)

Několik tvrzení v `CLAUDE.md`/README neodpovídá kódu a produkční migrace nic nehlídá.

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

`CLAUDE.md` uvádí `rate-limit.ts` v `server/pdf/`, existuje jen `server/auth/rate-limit.ts`; seznam souborů se `server-only` vynechává `czech-payment.ts`. `sanitizeSpdText` hvězdičky a dvojtečky nahrazuje mezerou, odstraní diakritiku a ořízne na 60 znaků (dokumentace říká jen „ořezává“). Komentář u `assertCanReadTimesheet` uvádí UNAUTHORIZED, kód vyhazuje FORBIDDEN. Tvrzení o testech vynechává `tasks.test.ts` a `changelog/parse.test.ts`; `pnpm check` vitest nespouští. README tvrdí kolizi kontejnerů a portu 5432 mezi dev a prod composem, ale produkční DB žádný port nepublikuje a dev compose má vlastní `name`; skutečná kolize 5432 je jen mezi `start-database.sh` a `docker-compose.dev.yml`. Komentář v `scripts/seed/index.ts` zmiňuje guard `${VAR:?...}`, který v `docker-compose.yml` není. `drizzle/` má jen `0000_charming_valkyrie.sql`, vývoj používá `db:push`, produkce `drizzle-kit migrate`: změna `schema.ts` se do produkce dostane, jen když se vygeneruje a commitne migrace, nic to nehlídá (a není CI). Drobnosti: `CHANGELOG.md` 1.2.2 je anglicky, `.env.production.example` má obrácené znění o commitování hodnot, `use-table-ui-state.ts` porušuje lint pravidlo `separate-type-imports` (varování).

## Why Not Fixed Now

Jde o dokumentaci a drobnosti bez dopadu na provoz. Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Opravit `CLAUDE.md`/README, a rozhodnout, jak hlídat generování migrací (např. kontrola v `pnpm check`).
