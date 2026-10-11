---
title: Vývojové prostředí
type: runbook
domain: platform
status: current
tags: [operations, runbook, development, docker]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [platform, platform-env-variables, platform-docker-production, platform-db-schema-overview, platform-testing-and-checks]
---

# Vývojové prostředí

Postup pro rozběhnutí appky lokálně (s Node na hostu) nebo celé v Dockeru. Spouští se na začátku práce nebo po čistém úklidu.

## Preconditions

- Node a `pnpm` (`package.json::packageManager` je `pnpm@11.20.0`) pro variantu A; jen Docker pro variantu B.
- Docker (nebo Podman) pro Postgres.
- `.env` zkopírovaný z `.env.example` s vyplněným `AUTH_SECRET` (`npx auth secret`). Viz [[platform-env-variables]].

## Varianta A: Node na hostu

1. `pnpm install` — nainstaluje závislosti a aplikuje patch `mantine-react-table`.
2. `./start-database.sh` — načte `.env`, z `DATABASE_URL` vyčte heslo, port a jméno DB a spustí kontejner `<db-name>-postgres` (image `docker.io/postgres`). Pokud kontejner existuje, jen ho nastartuje. Při výchozím hesle `password` nabídne vygenerování náhodného a přepíše `.env`.
3. `pnpm db:push` — synchronizuje schéma (`drizzle-kit push`). Viz [[platform-db-schema-overview]].
4. `pnpm seed:dev` — `tsx --env-file=.env scripts/seed/dev.ts`: root, demo uživatelé, demo plátci a odběratelé.
5. `pnpm dev` — `next dev --webpack`, port 3000. Důvod webpacku viz [[platform-tech-stack-and-conventions]].

Hotovo: `http://localhost:3000` zobrazí přihlášení.

## Varianta B: vše v Dockeru

1. `cp .env.example .env`, doplň `AUTH_SECRET`.
2. `pnpm dev:docker` — `docker compose -f docker-compose.dev.yml up --build`.

Kontejner `app` (stage `dev` v `Dockerfile`) spustí `pnpm install --frozen-lockfile && pnpm db:push --force && pnpm seed:dev && exec pnpm dev` (`docker-compose.dev.yml::command`). Schéma i seed tedy proběhnou automaticky.

- Zdrojáky jsou bind mount `.:/app`, hot reload funguje. `node_modules` a `.next` jsou anonymní volumes, aby bind mount nepřepsal Linuxové binárky.
- `DATABASE_URL` se v compose přepisuje na hostname `db`. `PUPPETEER_EXECUTABLE_PATH` ukazuje na systémové Chromium z image.
- `--force` u `db:push` je bezpečné jen proto, že jde o jednorázovou dev DB (`pgdata-dev`). Bez něj by `push` při destruktivní změně čekal na potvrzení a start by se tiše zasekl.
- DB publikuje port `5432`, appka port `3000`.

Další příkazy (`package.json::scripts`):

| Příkaz | Efekt |
|---|---|
| `pnpm dev:docker:down` | zastaví kontejnery, data v `pgdata-dev` zůstanou |
| `pnpm dev:docker:remove` | `down -v`, smaže i volume (čistý start) |
| `pnpm dev:docker:rebuild` | build bez cache, pak `up`; po změně systémových balíčků v `Dockerfile` |
| `pnpm dev:docker:seed` | ruční `seed:dev` v běžícím kontejneru |
| `pnpm dev:docker:db-push` | ruční `db:push`, např. po úpravě `schema.ts` bez restartu |

## Seed účty (jen vývoj)

`scripts/seed/dev.ts` volá `seedRootUser`, `seedDevOwnerBillingDefaults`, `seedDemoUsers`, `seedDemoPayers`, `seedDemoCustomers`. Všechny jsou idempotentní po jednotlivých záznamech (existující uživatel se přeskočí a zaloguje).

| Účet | Role | Poznámka |
|---|---|---|
| `admin@example.com` | `super_user` | e-mail a jméno přepsatelné přes `SEED_EMAIL`, `SEED_PASSWORD`, `SEED_FIRSTNAME`, `SEED_SURNAME`; dev seed mu předvyplní fakturační údaje |
| `senior@example.com` | `senior_programmer` | demo, nadřízený developera |
| `developer@example.com` | `developer` | demo, `managerId` = senior |

Demo účty mají zdokumentované výchozí heslo `changeme123` (`scripts/seed/users.ts::seedRootUser`, `seedDemoUsers`). Jsou jen pro vývoj. Produkční seed zakládá jen roota — viz [[platform-docker-production]]. Role viz [[access-users-and-roles]].

## Verification

- Přihlášení účtem `admin@example.com` projde a zobrazí se přehled.
- `pnpm check` a `pnpm test` prochází — viz [[platform-testing-and-checks]].

## Rollback

Varianta A: `docker stop <db-name>-postgres && docker rm …`. Varianta B: `pnpm dev:docker:remove`. Obojí smaže dev data (výkazy v `./data` zůstávají na hostu, `/data/` je v `.gitignore`).

## Failure Modes

- **Kolize portů.** `start-database.sh` a `docker-compose.dev.yml` oba publikují `5432`. Nespouštěj je zároveň. README tvrdí, že kolidují i s produkčním `docker-compose.yml`, ale produkční DB žádný port nepublikuje (`docker-compose.yml::db`), takže s produkcí kolize portu 5432 není. Produkce bere `9005`, dev appka `3000`.
- **Název kontejnerů.** Dev compose má `name: reports-and-invoices-dev`, takže se s produkčním projektem nepere.
- `pnpm install` v kontejneru bez TTY padá s `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` — řeší `CI: "true"` v compose.
- `start-database.sh` bez `nc` se zeptá, zda pokračovat, protože nemůže ověřit obsazený port.
