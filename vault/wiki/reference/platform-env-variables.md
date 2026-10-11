---
title: Env proměnné
type: reference
subtype: catalog
domain: platform
status: current
tags: [reference, catalog, env, configuration]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [platform, platform-dev-environment, platform-docker-production, platform-db-schema-overview]
---

# Env proměnné

Katalog všech proměnných prostředí a míst, kde se nastavují. Skutečné hodnoty (a obsah `.env`, `.env.production`) se do wiki nikdy nepíšou.

## Validace

`src/env.js::env` používá `@t3-oss/env-nextjs` + zod. `next.config.js` ho importuje, takže chyba v env shodí `pnpm dev` i `pnpm build`.

- `emptyStringAsUndefined: true` — prázdný řetězec (např. `AUTH_SECRET=""`) se bere jako nenastavený.
- `skipValidation: !!process.env.SKIP_ENV_VALIDATION` — přeskočí validaci **včetně zod defaultů**. Proto `Dockerfile` ve stage `builder` nastavuje `SKIP_ENV_VALIDATION=1` a ručně `DATA_DIR=/data`.
- `client` blok je prázdný (žádné `NEXT_PUBLIC_*`).
- Nová povinná server proměnná bez defaultu shodí i lokální vývoj. Přidej default tam, kde to dává smysl (viz `DATA_DIR`).

## Proměnné schématu (`src/env.js`)

| Proměnná | Povinná | Default | Význam |
|---|---|---|---|
| `AUTH_SECRET` | v produkci ano, jinak volitelná | — | Secret NextAuth; z něj se odvozuje i klíč AES-256-GCM pro Nextcloud heslo (`src/server/nextcloud/crypto.ts`) |
| `DATABASE_URL` | ano (musí být URL) | — | Připojení k Postgresu (`src/server/db/index.ts`) |
| `DATA_DIR` | ne | `./data` | Kořen souborů výkazů (`src/server/timesheet/storage.ts`, resolvuje se od `process.cwd()`) |
| `PUPPETEER_EXECUTABLE_PATH` | ne | — | Cesta k systémovému Chromiu; prázdná = Puppeteer použije vlastní stažený (`src/server/pdf/render.ts`) |
| `NODE_ENV` | ne | `development` | `development`/`test`/`production`; v `production` se `AUTH_SECRET` vyžaduje |

Chybí-li `AUTH_SECRET` ve vývoji (kde je volitelný), `src/server/nextcloud/crypto.ts::deriveKey` vyhodí chybu místo tichého šifrování předvídatelným klíčem. Viz [[nextcloud]].

## Proměnné mimo schéma

| Proměnná | Kde se čte | Význam |
|---|---|---|
| `AUTH_TRUST_HOST` | Auth.js | `"true"`: self-hosted v produkci jinak vrací `UntrustedHost`. V `docker-compose.yml::environment` pevně, v `.env.example` také |
| `POSTGRES_PASSWORD` | `docker-compose.yml` (db), `docker-entrypoint.sh` | Heslo Postgres kontejneru; entrypoint z něj sestaví `DATABASE_URL` s `encodeURIComponent` |
| `SEED_EMAIL`, `SEED_PASSWORD` | `scripts/seed/index.ts`, `scripts/seed/users.ts::seedRootUser` | Root uživatel; v produkci povinné (email musí být platný, heslo min. 8 znaků) |
| `SEED_FIRSTNAME`, `SEED_SURNAME` | `scripts/seed/users.ts::seedRootUser` | Jméno rootu; fallback `Admin` / `Administrátor` |
| `SKIP_ENV_VALIDATION` | `src/env.js` | Viz výše |
| `CI` | `docker-compose.dev.yml` (`"true"`) | Nutí `pnpm install` do neinteraktivního režimu bez TTY |
| `PORT`, `HOSTNAME` | `Dockerfile` (`3000`, `0.0.0.0`) | Nastavení `next start` v kontejneru |
| `PUPPETEER_SKIP_DOWNLOAD` | `Dockerfile` (`true`) | V image se Chromium nestahuje, bere se z Alpine balíčku |
| `VERCEL_URL` | `src/trpc/react.tsx::getBaseUrl` | Podmíněně čtené t3 default, na self-hosted se nepoužívá |

⚠️ `AUTH_URL` / `NEXTAUTH_URL` se záměrně nenastavují. Za Dockerem s portem 9005→3000 by Auth.js uvnitř kontejneru odvodil `http://localhost:3000`, proto `src/server/auth/config.ts::requestOrigin` bere origin z hlaviček `Host` / `x-forwarded-*` a `resolveSameOriginRedirect` povoluje jen přesměrování na stejný origin.

## Soubory a kdo je čte

| Soubor | Účel | V gitu |
|---|---|---|
| `.env.example` | Šablona pro vývoj: `AUTH_SECRET`, `AUTH_TRUST_HOST`, `DATABASE_URL`, `DATA_DIR`, `PUPPETEER_EXECUTABLE_PATH` | ano |
| `.env` | Lokální vývoj, `docker-compose.dev.yml` (`env_file`), `pnpm seed*` (`tsx --env-file=.env`) | ne (`.gitignore`) |
| `.env.production.example` | Šablona produkce: `AUTH_SECRET`, `POSTGRES_PASSWORD`, `SEED_*` | ano |
| `.env.production` | `docker compose --env-file .env.production`, `env_file` v `docker-compose.yml` | ne (`.gitignore`, `.dockerignore`) |

`.env` a `.env.production` jsou oddělené záměrně, aby se vývojové a produkční secrety nemíchaly.

## Zvláštnosti

- **`$` v heslech.** Hodnoty `AUTH_SECRET` a `POSTGRES_PASSWORD` se v `docker-compose.yml` nesmí interpolovat přes `${VAR}`, protože Compose po substituci znovu skenuje `$word` a tiše je vyřízne. Proto jdou přes `env_file` jako raw hodnoty a `docker-entrypoint.sh` je ověřuje (`: "${AUTH_SECRET:?...}"`).
- **Kontrola `SEED_*` v kódu, ne v compose.** Komentář v `scripts/seed/index.ts` zmiňuje guard `${VAR:?...}` v `docker-compose.yml`. Takový guard v aktuálním compose souboru není. Kontrolu dělá `assertProductionSeedEnv` v seed skriptu.
- **Dev DB heslo.** `docker-compose.dev.yml` používá `${POSTGRES_PASSWORD:-postgres}`; `.env.example` ho neobsahuje, takže platí default.
- **Seed v produkci** běží bez `--env-file`; proměnné přicházejí z prostředí kontejneru (`docker-entrypoint.sh`).
