# Výkazy a faktury

Aplikace na T3 stacku (Next.js App Router, Drizzle, NextAuth, tRPC) + Mantine, která
nahrazuje ruční proces vedení výkazů práce a fakturace: editace výkazu s živým přepočtem
hodin, správa odběratelů (aliasy z výkazu) a plátců (kdo fakturu skutečně hradí — jeden
plátce může zastřešovat víc aliasů), a generování PDF faktur (s QR platbou) přes
Puppeteer.

## Vývoj

```bash
pnpm install
./start-database.sh   # lokální Postgres v Dockeru
pnpm db:push          # synchronizace schématu (dev)
pnpm seed:dev          # bootstrap root + demo uživatelé/plátci/odběratelé
pnpm dev
```

`pnpm dev` běží přes `next dev --webpack` — Next 16 defaultně používá Turbopack, ale ten
měl v sandboxu, kde vznikla první verze appky, bug s on-demand kompilací nových rout
(`ENOENT build-manifest.json`). Zkus klidně `next dev --turbopack` — může to na tvém
stroji fungovat bez problémů.

### Vývoj v Dockeru (bez lokálního Node)

Alternativa k výše uvedenému — appka i DB běží v kontejnerech, tenhle adresář je
mountnutý dovnitř bind volume, takže hot reload funguje a soubory se editují normálně
na hostu (žádné přihlašování do kontejneru).

```bash
cp .env.example .env   # doplň AUTH_SECRET (npx auth secret)
pnpm dev:docker
```

Appka je hned ready to go — kontejner si při startu sám odbaví `db:push` (schéma) i
`seed:dev` (root + demo uživatelé/plátci/odběratelé), žádný ruční krok navíc. `pnpm
dev:docker:db-push` / `pnpm dev:docker:seed` zůstávají i tak k dispozici pro ruční
spuštění zvlášť (např. po úpravě `schema.ts` bez restartu kontejneru).

`pnpm dev:docker:down` kontejnery zastaví (data v `pgdata-dev` zůstanou). `pnpm
dev:docker:remove` je navíc i smaže — pro úplný úklid, když chceš příště naseedovat
načisto. `pnpm dev:docker:rebuild` udělá čistý build bez cache (`--no-cache`) — použij,
když `--build` z `dev:docker` nestačí (např. po změně systémových balíčků v
Dockerfile). Neběž zároveň se `start-database.sh` / `docker-compose.yml` (produkce) —
kolidují jména kontejnerů i port 5432.

Přihlašovací údaje po `pnpm seed:dev` (root přepsatelný přes `SEED_EMAIL`/`SEED_PASSWORD`/
`SEED_FIRSTNAME`/`SEED_SURNAME`): `admin@example.com` / `changeme123` (super-user, s předvyplněnými
fakturačními údaji), plus demo dvojice `senior@example.com` / `developer@example.com`
(obě `changeme123`) pro vyzkoušení hierarchie rolí.

## Role

- **super_user** — vidí a spravuje úplně vše, jediný, kdo zakládá uživatele (`/admin/users`)
- **senior_programmer** — vlastní výkazy/odběratelé/faktury + read-only náhled na výkazy
  podřízených vývojářů (`/timesheets`, přepínač "za koho")
- **developer** — jen svoje vlastní

## Datový model — plátce vs. odběratel

`customers` (odběratel/alias z výkazu, např. `AC1`, `BETA`) vždy patří pod nějakého
`payers` (plátce = skutečný fakturační subjekt). Při zakládání faktury vybíráš plátce —
appka do faktury automaticky přidá jednu položku za každý jeho alias s odpracovanými
hodinami v daném období.

## Synchronizace výkazů

V Nastavení jde nastavit automatickou zálohu uložených výkazů dvěma nezávislými
způsoby (jde použít i oba zároveň):

- **Lokální složka** — přes File System Access API prohlížeče (jen Chrome/Edge).
  Appka po každém uložení výkazu zapíše soubor přímo do vybrané složky na disku,
  typicky sledované desktopovým Nextcloud/jiným sync klientem. Běží čistě v
  prohlížeči, appka o žádném Nextcloudu neví.
- **Nextcloud (WebDAV)** — appka se sama napojí na Nextcloud instanci přes WebDAV
  (`https://cloud.example.com` + uživatelské jméno + **aplikační heslo**, ne hlavní
  heslo účtu). Funguje z libovolného prohlížeče, protože běží server-side. Heslo se
  ukládá zašifrované (AES-256-GCM). Po uložení výkazu se automaticky zkusí
  zesynchronizovat na pozadí; v Nastavení jde i kdykoliv spustit "Synchronizovat teď",
  kde appka nejdřív ukáže náhled (co je nové, co už bylo synchronizováno, co koliduje
  s existujícím souborem) a nechá vybrat, co se má zapsat — appka nikdy nepřepíše
  soubor, který sama nevytvořila, bez výslovného potvrzení.

Synchronizace je jednosměrná (appka → cíl), appka odtamtud nic nečte zpátky.

## Testy

```bash
pnpm test        # vitest — hlavně parser výkazu (src/server/timesheet/parse.ts)
pnpm typecheck
pnpm lint
```

## Verze a changelog

Verze v `package.json` se v appce zobrazuje v hlavičce (vedle názvu appky) — po
nasazení tak jde na první pohled poznat, jestli běží aktuální kód. Bump verze i
`CHANGELOG.md` řeší [Changesets](https://github.com/changesets/changesets)
(`.changeset/`), bez publikování na npm (appka je `"private": true`).

```bash
pnpm changeset          # u rozpracované změny: vyber typ bumpu (patch/minor/major) + krátký popis
pnpm changeset:version  # spotřebuje nasbírané changesety, zapíše CHANGELOG.md a bumpne package.json
```

`pnpm changeset:version` jen upraví soubory na disku (nic nekomituje ani netagne
automaticky) — zkontroluj diff a commitni sám.

## Docker (produkce)

Stejný postup pro ostrý provoz na serveru i pro lokální vyzkoušení appky "naostro" u
sebe — `pnpm prod:docker` vždy před startem přebuildí image, takže se v ní nikdy
neujede na zastaralém kódu.

```bash
cp .env.production.example .env.production
# doplň AUTH_SECRET (npx auth secret — vlastní, jiný než v .env pro vývoj),
# POSTGRES_PASSWORD a SEED_EMAIL/SEED_PASSWORD/SEED_FIRSTNAME/SEED_SURNAME
pnpm prod:docker
```

`.env.production` je záměrně oddělený od `.env` (ten je jen pro lokální vývoj /
`docker-compose.dev.yml`) — ať se produkční a vývojové secrety nemíchají v jednom
souboru. `pnpm prod:docker` / `pnpm prod:docker:down` ho použijí automaticky
(`docker compose --env-file .env.production ...`).

Appka je hned po startu ready to go — kontejner si při každém spuštění (i restartu) sám
napřed odbaví DB migrace a pak založí root uživatele (`super_user`) podle
`SEED_EMAIL`/`SEED_PASSWORD`/`SEED_FIRSTNAME`/`SEED_SURNAME`, žádný ruční krok navíc. Je to idempotentní: na
existujícího roota se jen upozorní v logu a nic se nepřepíše, takže restart kontejneru
nic nerozbije. Žádná demo data (plátci/odběratelé) se v produkci nezakládají — root si
po přihlášení doplní vlastní fakturační údaje v Nastavení a přes `/admin/users` zakládá
ostatní uživatele.

Appka běží na `http://localhost:9005` (port zvenku, uvnitř kontejneru pořád 3000 —
mapování je v `docker-compose.yml`). Výkazové soubory se ukládají do pojmenovaného
volume `app-data` (mountnuto na `/data` v kontejneru), DB do `pgdata`. `pnpm prod:docker:down`
kontejnery zastaví (data ve volumes zůstanou).

### Nasazení nové verze

Prostě znovu `pnpm prod:docker` — přebuildí image z aktuálního kódu, restartuje
kontejnery a při startu doběhnou i nové DB migrace (`docker-entrypoint.sh`), ale
volumes (`pgdata`, `app-data`) se vůbec nesahá. Žádná ruční příprava před tím není
potřeba, appka i DB se restartem jen na chvíli přeruší.

Volumes smaže jedině explicitní `docker compose down -v` / ruční `docker volume rm`
(nebo smazání přes Docker Desktop) — ne obyčejný redeploy.

### Úplné smazání (včetně dat)

```bash
pnpm prod:docker:remove
```

Na rozdíl od `prod:docker:down` (jen zastaví kontejnery, data zůstanou) tohle navíc
smaže i `pgdata`/`app-data` volumes — nevratně, včetně databáze a všech výkazových
souborů. Schválně to není jen o písmenko jinak než `prod:docker:down`, ať se to
nespustí omylem.

Pozvánka mailem zatím není — nový účet přes `/admin/users` zakládá root ručně se
zvoleným heslem.

## Struktura

- `src/server/timesheet/parse.ts` — přepis `perl-app/prace.pl` do TypeScriptu (+ testy)
- `src/server/timesheet/storage.ts` — soubory výkazů na disku (`/data/{userId}/{YYYYMM}/`)
- `src/server/invoicing/` — pravidla pro předvyplnění dat faktury + číselná řada
- `src/server/pdf/` — HTML šablona faktury, QR platba (SPD/IBAN), Puppeteer render
- `src/server/access/visibility.ts` — autorizace podle role (super_user/senior/developer)
- `src/server/nextcloud/` — WebDAV synchronizace výkazů (viz "Synchronizace výkazů" výše)
- `src/components/local-sync.ts` — synchronizace do lokální složky přes File System Access API
- `scripts/seed/` — idempotentní seedy po oblastech; `pnpm seed` (jen root, produkce)
  vs. `pnpm seed:dev` (+ demo uživatelé/plátci/odběratelé, jen vývoj)
