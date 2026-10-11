---
title: Produkční Docker nasazení
type: runbook
domain: platform
status: current
tags: [operations, runbook, docker, production]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [platform, platform-env-variables, platform-db-schema-overview, platform-dev-environment, platform-release-and-changelog, invoicing-pdf-rendering]
---

# Produkční Docker nasazení

Spuštění, redeploy a úplné smazání produkční instance (appka + Postgres). Stejný postup slouží pro server i pro lokální „naostro“ zkoušku.

## Preconditions

- Docker s Compose.
- Soubor `.env.production` vytvořený z `.env.production.example` s vyplněnými `AUTH_SECRET` (jiný než ve vývoji), `POSTGRES_PASSWORD`, `SEED_EMAIL`, `SEED_PASSWORD`, `SEED_FIRSTNAME`, `SEED_SURNAME`. Viz [[platform-env-variables]]. Soubor není v gitu ani v build kontextu (`.gitignore`, `.dockerignore`).

## Steps

1. `cp .env.production.example .env.production` a doplň hodnoty.
2. `pnpm prod:docker` — `docker compose --env-file .env.production up --build -d`. Image se vždy přebuilduje, takže neběží zastaralý kód.
3. Počkej na start. `app` čeká na zdravou DB (`depends_on: service_healthy`, `pg_isready`).

Při každém startu kontejneru (i restartu) `docker-entrypoint.sh` provede:

1. Ověří, že `AUTH_SECRET` a `POSTGRES_PASSWORD` existují (`${VAR:?...}`).
2. Sestaví `DATABASE_URL` s `encodeURIComponent(POSTGRES_PASSWORD)` a hostem `db`.
3. `node_modules/.bin/drizzle-kit migrate`.
4. `node_modules/.bin/tsx scripts/seed/index.ts` — idempotentní založení roota (`super_user`). Existujícího roota jen oznámí v logu, nic nepřepíše. Žádná demo data.
5. `exec "$@"` → `node_modules/.bin/next start` (ne `pnpm start`; pnpm by bez TTY selhal na `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`).

Seed `scripts/seed/index.ts::assertProductionSeedEnv` navíc vyžaduje platný `SEED_EMAIL` a `SEED_PASSWORD` min. 8 znaků, jinak skončí s chybou. Pozor: `docker-entrypoint.sh` běží s `set -e`, takže chyba seedu zastaví start kontejneru.

Další příkaz: `pnpm prod:docker:down` zastaví kontejnery (volumes zůstanou).

## Topologie

| Prvek | Hodnota | Zdroj |
|---|---|---|
| Port | `9005` na hostu → `3000` v kontejneru | `docker-compose.yml::ports` |
| Appka | build z `Dockerfile` (stage `runner`), `restart: unless-stopped` | `docker-compose.yml::app` |
| DB | `postgres:16-alpine`, DB `reports_and_invoices`, uživatel `postgres`, bez publikovaného portu | `docker-compose.yml::db` |
| Volume `app-data` | mount `/data` — soubory výkazů (`DATA_DIR=/data`) | `docker-compose.yml::volumes` |
| Volume `pgdata` | data Postgresu | `docker-compose.yml::volumes` |
| `AUTH_TRUST_HOST` | `"true"` — jinak Auth.js odmítne neznámý hostname | `docker-compose.yml::environment` |

Žádný reverse proxy, Redis ani fronta. Auth.js nemá `AUTH_URL`; origin se bere z hlaviček requestu (`src/server/auth/config.ts::requestOrigin`), viz [[platform-env-variables]].

## Image (`Dockerfile`)

- Stage `base` (`node:22-alpine`, `corepack enable`, `PUPPETEER_SKIP_DOWNLOAD=true`) → `deps` (`pnpm install --frozen-lockfile`, kopíruje `patches/`) → `builder` (`SKIP_ENV_VALIDATION=1`, `DATA_DIR=/data`, `pnpm build`) → `runner`.
- `runner` a `dev` instalují Alpine balíčky `chromium`, `ttf-freefont`, `font-noto`, `font-noto-cjk` (diakritika v PDF) a nastavují `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`.
- Chromium běží s `--no-sandbox --disable-setuid-sandbox` (`src/server/pdf/render.ts`, nutné bez extra Docker capabilities). Důsledky pro bezpečnost šablony viz [[invoicing-pdf-rendering]].
- `runner` obsahuje `node_modules` včetně dev závislostí (potřebné pro `drizzle-kit` a `tsx` při startu), `.next`, `src`, `scripts`, `drizzle`, `drizzle.config.ts`, `CHANGELOG.md` (čte ho `src/server/api/routers/meta.ts::metaRouter`, viz [[platform-release-and-changelog]]) a entrypoint.
- Proces běží jako uživatel `nextjs` (uid 1001); `/data` mu patří.
- `.dockerignore` vylučuje mj. `node_modules`, `.next`, `.git`, `data`, `.env`, `.env.production`, `.pnpm-store` (lokální pnpm store jinak nafukuje build kontext), `pdf-examples`, `perl-app`.

## Verification

- `http://localhost:9005` zobrazí přihlášení.
- V logu `app` je `Running database migrations...`, `Seeding root user...`, `Starting application...`.
- Přihlášení účtem z `SEED_EMAIL` projde. Root si pak doplní fakturační údaje v Nastavení a ostatní účty zakládá v `/admin/users` (pozvánky e-mailem zatím nejsou). Viz [[access-users-and-roles]].

## Nasazení nové verze (redeploy)

Znovu `pnpm prod:docker`. Přebuilduje image, restartuje kontejnery a entrypoint spustí nové migrace. Volumes `pgdata` a `app-data` se nemění. Appka i DB jsou krátce nedostupné. Žádná ruční příprava není potřeba.

⚠️ Migrace vznikají jen z `pnpm db:generate`. Pokud se schéma měnilo přes `db:push` a migrace se nevygenerovala a necommitla, redeploy produkční DB nezmění. Viz [[platform-db-schema-overview]].

## Rollback

Žádný automatický rollback není. Předchozí verzi lze znovu nasadit z předchozího commitu (`pnpm prod:docker`), ale migrace schématu se nevrací. Zálohu `pgdata` a `app-data` je nutné řešit mimo repozitář (nenalezen backup skript).

## Úplné smazání (včetně dat)

`pnpm prod:docker:remove` = `docker compose --env-file .env.production down -v`. Smaže kontejnery i volumes `pgdata` a `app-data` — nevratně, včetně DB a všech souborů výkazů. Obyčejný redeploy ani `prod:docker:down` volumes nemaže.

## Failure Modes

- Chybí `AUTH_SECRET` nebo `POSTGRES_PASSWORD` → entrypoint skončí s hláškou, kontejner se restartuje (`unless-stopped`).
- Heslo s `$` nebo URL-speciálními znaky: řeší `env_file` (ne `${VAR}` interpolace) a `encodeURIComponent` v entrypointu.
- Neplatné `SEED_*` → seed skončí chybou a kontejner nenastartuje.
- Kolize portu: produkce publikuje jen `9005`. Zkontroluj, že nic jiného neběží na hostu na tomto portu.
