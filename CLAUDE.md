@AGENTS.md

# Výkazy a faktury — poznámky pro Claude Code

Provozní dokumentace (jak appku spustit, Docker, role, datový model) je v `README.md` —
tady jen věci, co potřebuje vědět agent pracující v kódu: architektura, a hlavně
bezpečnostní invarianty, které se nesmí omylem oslabit.

## Stack

Next.js App Router (**neznámá/upravená verze, viz `AGENTS.md`** — před psaním kódu ověř
konvence v `node_modules/next/dist/docs/`, ne ve svém tréninkovém datasetu) + tRPC v11 +
Drizzle ORM (Postgres) + NextAuth v5 (Credentials, JWT session, žádný DB adaptér) +
Mantine v9 + mantine-react-table v2.0.0-beta.9. Self-hosted, jeden Docker kontejner na
appku + jeden na Postgres, žádný Redis/queue/reverse proxy ve stacku.

Specifické konvence, které se liší od "běžného" Next.js:
- `src/proxy.ts` (ne `middleware.ts`) — auth gate, viz níže.
- `next dev` si sám dopisuje blok `<!-- BEGIN/END:nextjs-agent-rules -->` v
  `AGENTS.md` — nech ho na pokoji, commitni ho tak, jak je.

## Datový model

- `users` = dodavatelé (appka je pro OSVČ/freelancery vedoucí si vlastní výkazy a
  fakturaci). Role: `super_user` (vidí/spravuje vše, jediný kdo zakládá účty),
  `senior_programmer` (vlastní data + read-only na výkazy podřízených přes
  `managerId`), `developer` (jen svoje). Viz `src/server/access/visibility.ts`.
- `payers` (skutečný fakturační subjekt) ⊃ `customers` (alias z výkazu, např. `KM`) —
  jeden plátce může zastřešovat víc aliasů, viz README "Datový model".
- `invoices` + `invoiceItems`, číslování přes `invoiceNumberCounters` — atomický
  upsert (`onConflictDoUpdate` + `sql\`... + 1\``) v `invoicing/numbering.ts`, race-safe
  bez explicitního zamykání.
- **Výkazy samotné (surový text + vygenerovaná HTML) nejsou v DB** — leží na disku pod
  `DATA_DIR/{userId}/{YYYYMM}/`, viz `server/timesheet/storage.ts`. DB drží jen
  odvozená metadata (Nextcloud sync stav, číslování faktur apod.).

## Autorizace — kde se co kontroluje

`protectedProcedure` (`server/api/trpc.ts`) ověří **jen že je uživatel přihlášený**,
nic víc. Vlastnictví/roli si musí zkontrolovat každý router sám voláním helperů z
`server/access/visibility.ts`:
- `assertOwnerOrSuperUser` — zápis/čtení vlastních dat (customers, payers, invoices,
  settings).
- `assertCanReadTimesheet` / `getReadableTimesheetUserIds` — čtení výkazů (senior vidí
  navíc podřízené).
- `assertSuperUser` — admin akce (`/admin/users`).

Nový endpoint bez jednoho z těchto volání = potenciální IDOR. `src/proxy.ts` řeší jen
"je vůbec přihlášený" (redirect na `/login`), ne autorizaci konkrétních dat — tu proxy
o datech nic neví.

## Bezpečnostní invarianty (nerozbít)

Appka prošla v rámci vývoje vlastním penetračním testem (na `pnpm prod:docker`
instanci) zaměřeným hlavně na: (1) že se dovnitř dostanou jen přihlášení, (2) že nejde
sáhnout na soubory výkazů mimo autentizaci/autorizaci, (3) že role/viditelnost fungují
a nikdo nevidí cizí výkazy. Věci níže jsou přímý výsledek toho testu:

- **Cesty k souborům výkazů** (`server/timesheet/storage.ts`) — `userId` musí projít
  UUID regexem a `period` regexem `YYYYMM`, než se použijí v `path.join`. Bez týhle
  validace by šlo přes `period` (nebo `userId`, kdyby ho šlo ovlivnit) dělat path
  traversal (`../../etc/passwd` apod.).
- **SSRF guard** (`server/nextcloud/ssrf-guard.ts`, `assertPublicHost`) — Nextcloud URL
  zadává nízko-důvěryhodný přihlášený uživatel; guard resolvuje hostname přes DNS a
  kontroluje výsledné IP (ne string matching na hostname), zamítá loopback/privátní/
  link-local rozsahy. Volá se **znovu při každém reálném requestu** (`client.ts`), ne
  jen jednou při "connect" — zužuje okno pro DNS rebinding. Nesahat na tuhle logiku bez
  pochopení proč je resolve-based, ne hostname-string-based.
- **Nextcloud aplikační heslo šifrované v klidu** (`server/nextcloud/crypto.ts`) —
  AES-256-GCM, klíč odvozený z `AUTH_SECRET` (žádný nový env navíc). `deriveKey()`
  vyhodí chybu, když `AUTH_SECRET` chybí — radši shodit appku, než tiše šifrovat
  předvídatelným klíčem.
- **`server-only` import** na `sync.ts`/`client.ts`/`crypto.ts`/`ssrf-guard.ts`
  (nextcloud) a `rate-limit.ts`/`render.ts` (pdf) — hlídá, že se modul se secrety/
  bezpečnostní logikou nedostane do client bundlu. Když ho kvůli přímému testování
  přes `tsx` dočasně odstraníš, **vrať ho zpátky, než dokončíš práci** — nepatří do
  commitu ani na chvíli.
- **Timing-safe login** (`server/auth/config.ts` + `auth/password.ts`) — i na
  neexistující email se pustí `bcrypt.compare` proti fixnímu `DUMMY_PASSWORD_HASH`, ať
  doba odpovědi neprozradí, jestli účet existuje (user enumeration).
- **Rate limiting loginu** (`auth/rate-limit.ts`) — in-memory fixed-window, zvlášť pro
  email a pro IP (5, resp. 20 pokusů / 15 min). Vědomě in-memory (appka běží jako jedna
  instance) — po restartu kontejneru se vynuluje, to je OK.
- **XSS v PDF šabloně** (`server/pdf/invoice-template.ts`, `escapeHtml`/`escapeAttr`) —
  Puppeteer běží s `--no-sandbox --disable-setuid-sandbox` (`pdf/render.ts`, nutné bez
  extra Docker capabilities), takže escapování textových/atributových hodnot (jméno
  plátce, dodavatele, `signatureImageUrl`, ...) je jediná obrana proti injekci do HTML,
  co se pak renderuje v headless Chromiu.
- **SPD/QR platba** (`server/pdf/czech-payment.ts`, `sanitizeSpdText`) — `variableSymbol`
  a zpráva pro příjemce jdou do SPD stringu (QR platba); `*`/`:` se ořezávají, ať nejde
  vstříknout další pole platebního příkazu.
- **Security headery** (`next.config.js`) — `poweredByHeader: false`,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.

Pokud přidáváš nové pole, kam může zapisovat uživatel a které se pak zobrazí/použije
jinde (HTML, QR string, souborová cesta, externí URL), předpokládej, že to potřebuje
stejné ošetření jako existující vzory výše — ne nové ad-hoc řešení.

## Nextcloud sync (`server/nextcloud/`)

Alternativa/doplněk k lokální složce (File System Access API, `components/local-sync.ts`
— jen Chrome/Edge, běží čistě v prohlížeči). Nextcloud sync běží server-side (WebDAV),
funguje v libovolném prohlížeči. Jednosměrné (appka → Nextcloud), appka odtamtud nic
nečte zpátky.

- `getConfigForUser` (`sync.ts`) načte a dešifruje uloženou konfiguraci.
- `nextcloudSyncedPeriods` (jsonb na `users`) — období, která appka na danou cestu už
  sama zapsala. Klíčový mechanismus proti přepsání cizího souboru: dokud období není
  v tomhle setu, `uploadPeriod` napřed přes `existsOnNextcloud` zkontroluje, jestli tam
  něco není (→ `"conflict"`, nezapíše); jakmile appka jednou sama zapíše, bere cestu
  jako "svoji" a dál ji bez dotazu přepisuje.
- `syncTimesheetToNextcloud` — voláno z `timesheet.save`/`importBatch` po každém
  uložení, vrací výsledek (`"synced" | "conflict" | "failed" | "not-configured"`),
  který frontend (`timesheet-editor.tsx`, `timesheet-import-modal.tsx`) promítá do
  notifikace. Nikdy nevyhazuje (try/catch uvnitř) — sync selhání nesmí shodit uložení
  výkazu.
- `previewNextcloudSync` / `syncSelectedPeriodsToNextcloud` — read-only náhled + explicitní
  výběr uživatelem (`settings/nextcloud-sync-modal.tsx`, stejný UX vzor jako import
  výkazů) pro ruční "Synchronizovat teď", kde se kolize řeší vědomě přes checkbox, ne
  automaticky.

## UI konvence

- Tabulky (customers/payers/invoices/admin-users) sdílí `components/use-table-ui-state.ts`
  — denzita + viditelnost vyhledávání/filtrů v localStorage per tabulka, vyhledávání a
  filtry jsou defaultně vždy zapnuté (na rozdíl od mantine-react-table defaultu). Nový
  seznam/tabulka by měl tenhle hook použít, ne řešit UI state zvlášť.
- STAV/status filtry jsou vždy netypovatelný `Select` (ne combobox s volným textem).
- Modály s "napřed náhled, pak potvrzení výběru" (import výkazů, Nextcloud sync) — stejný
  vzor: tabulka řádků s checkboxy, barevné badge stavu, defaultní výběr odvozený přes
  `useMemo` + nullable override `useState` (kvůli `react-hooks/set-state-in-effect`, ne
  `useEffect`+`setState`).

## Testy a ověřování

`pnpm test` (vitest) pokrývá hlavně parser výkazu (`timesheet/parse.ts`) a pár čistých
funkcí (`filename.ts`, `workload.ts`) — žádné integrační/E2E testy přes DB nebo HTTP.
`pnpm check` = `lint` + `typecheck`, spusť po každé netriviální změně. `pnpm build`
ověř před tvrzením, že je něco produkčně hotové — typecheck sám o sobě nezachytí
Next.js-specifické build chyby (route konflikty, apod.).

Env proměnné validuje `src/env.js` (`@t3-oss/env-nextjs`) — nový povinný server env bez
defaultu shodí i lokální `pnpm dev`/`pnpm build` bez `SKIP_ENV_VALIDATION`. Přidávej
defaulty tam, kde dává smysl fungovat bez explicitního nastavení (viz `DATA_DIR`).

## Verzování

`package.json` verze se zobrazuje v UI (`nav-shell.tsx`, vedle názvu appky). Bump +
`CHANGELOG.md` řeší Changesets (`pnpm changeset`, `pnpm changeset:version`) — viz README
"Verze a changelog". K netriviální změně přidej changeset (`pnpm changeset`), pokud o to
uživatel výslovně nepožádá jinak.
