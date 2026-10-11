---
title: Tech stack a konvence
type: reference
subtype: convention
domain: platform
status: current
tags: [reference, convention, stack, nextjs, trpc, drizzle]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [platform, platform-ui-conventions, platform-db-schema-overview, platform-testing-and-checks, access-users-and-roles]
---

# Tech stack a konvence

Přehled použitých knihoven a pravidel, kterými se kód řídí. Otevři před psaním nové route, routeru nebo komponenty.

## Stack

| Vrstva | Volba | Zdroj |
|---|---|---|
| Framework | Next.js `^16.3.4`, App Router | `package.json::dependencies` |
| API | tRPC v11 (`@trpc/server`, `@trpc/client`, `@trpc/react-query`), `superjson` | `src/server/api/trpc.ts`, `src/trpc/react.tsx` |
| DB | Drizzle ORM `^0.41.0` + `postgres` (postgres-js), Postgres 16 | `src/server/db/index.ts`, `docker-compose.yml::db` |
| Auth | `next-auth` `5.0.0-beta.25`, Credentials, JWT session, bez DB adaptéru | `src/server/auth/config.ts` |
| UI | Mantine `^9.6.0`, `mantine-react-table` `2.0.0-beta.9` (patchnuté) | `package.json`, `patches/` |
| Klientský stav | TanStack Query, `nuqs` (URL stav) | `src/app/layout.tsx::NuqsAdapter` |
| PDF | Puppeteer + `qrcode` | viz [[invoicing-pdf-rendering]] |
| Env | `@t3-oss/env-nextjs` + zod | `src/env.js` |
| Správce balíčků | `pnpm@11.20.0`, Node 22 v Dockeru | `package.json::packageManager`, `Dockerfile` |

Projekt vznikl z create-t3-app (`package.json::ct3aMetadata`).

## Next.js: upravená verze

`AGENTS.md` upozorňuje, že tato verze Next.js má změny API a struktury souborů oproti běžné znalosti. Před psaním kódu se konvence ověřují v `node_modules/next/dist/docs/` (relativně k `AGENTS.md`), ne z paměti.

⚠️ Nejasné: při inspekci se adresář `node_modules/next/dist/docs/` nepodařilo vylistovat (glob nic nevrátil). Obsah tedy není ověřen — ověř ručně po `pnpm install`.

Blok `<!-- BEGIN/END:nextjs-agent-rules -->` v `AGENTS.md` si dopisuje `next dev` sám. Nemaž ho a neupravuj. Pokud se objeví jako změna v `git status`, commitni ho tak, jak je (viz `.claude/skills/release/SKILL.md`, sekce Don't).

## Konvence specifické pro tento projekt

- **`src/proxy.ts` místo `middleware.ts`.** Soubor exportuje `uncachedAuth(...)` jako default a `config.matcher`. Přesměruje nepřihlášené na `/login?callbackUrl=...` a přihlášené z `/login` na `/` (`src/proxy.ts::PUBLIC_PATHS`, `src/proxy.ts::config`). Řeší jen „je přihlášený“, ne autorizaci dat.
- **Veřejné cesty:** `/login`, `/api/auth*` a generované ikony (`/icon`, `/apple-icon`, `/opengraph-image`, `/twitter-image`), aby náhledy odkazů a favicon nepřesměrovával na login (`src/proxy.ts::PUBLIC_PATHS`).
- **Dev server běží přes webpack.** `package.json::scripts.dev` je `next dev --webpack`. README zdůvodňuje, že Turbopack měl v původním sandboxu chybu při on-demand kompilaci nových rout (`ENOENT build-manifest.json`) a že jde zkusit `next dev --turbopack`. Důvod se v kódu neověřuje.
- **Alias `~/*` → `src/*`** (`tsconfig.json::paths`). Přísné TS: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
- **Typové importy:** ESLint vynucuje `separate-type-imports` (`import type {...}`), protože inline `import { type X }` se v produkčním buildu Next 16 spolehlivě neodstřihne přes hranici server/client a mohl by vtáhnout `postgres` klienta do bundlu (`eslint.config.js::consistent-type-imports`).
- **Drizzle lint:** `drizzle/enforce-delete-with-where` a `enforce-update-with-where` jako `error` pro `db` a `ctx.db` (`eslint.config.js`).
- **Prefix tabulek** `reports_and_invoices_` a `casing: "snake_case"` — viz [[platform-db-schema-overview]].
- **`server-only`** na modulech s tajemstvími nebo bezpečnostní logikou (Nextcloud, PDF). Pravidla viz [[access-users-and-roles]] a doménové stránky.
- **Autorizace:** nový endpoint musí sám zavolat helper z `src/server/access/visibility.ts`, jinak hrozí IDOR (`src/server/api/trpc.ts::protectedProcedure` kontroluje jen session).
- **Env:** všechno přes `~/env` (`src/env.js`), viz [[platform-env-variables]].

## tRPC

- Kontext: `db` + `session` (`src/server/api/trpc.ts::createTRPCContext`), transformer `superjson`, chyby zod se posílají jako `zodError`.
- Procedury: `publicProcedure`, `protectedProcedure` (vyhodí `UNAUTHORIZED` bez `ctx.session.user`).
- `timingMiddleware` loguje dobu každé procedury a ve vývoji přidá umělé zpoždění 100–500 ms (`src/server/api/trpc.ts::timingMiddleware`). Je to vědomě převzatý t3 default.
- Klient: `httpBatchStreamLink` na `/api/trpc` (`src/trpc/react.tsx::TRPCReactProvider`), server-side volání přes `createCaller` (`src/trpc/server.ts`).

## Root layout

`src/app/layout.tsx::RootLayout` skládá `NuqsAdapter` → `ThemeProvider` → `DatesProvider` (locale `cs`) → `Notifications` → `TRPCReactProvider`. Jazyk dokumentu je `cs`, font Geist. Téma (`src/mantine-theme.ts::theme`) nastavuje `defaultRadius: "md"` a `ActionIcon` defaultně `variant: "subtle"` — zapsané jako prostý objekt, protože `ActionIcon.extend(...)` v RSC bundlu `layout.tsx` padá.

## Patch mantine-react-table

`pnpm-workspace.yaml::patchedDependencies` aplikuje `patches/mantine-react-table@2.0.0-beta.9.patch` na `dist/index.cjs` i `dist/index.esm.mjs`. Patch mění v komponentách `Collapse` prop `in` na `expanded` (detail panel, filtry sloupců, alert banner, globální filtr, progress bar). Důvod: Mantine 9 prop přejmenoval a beta verze `mantine-react-table` ho stále posílá pod starým jménem. (Důvod je odvozen z obsahu patche, ne z komentáře v repu.)

Dockerfile kopíruje `patches/` už ve stage `deps`, aby `pnpm install --frozen-lockfile` patch aplikoval (`Dockerfile`, stage `deps`).

## Exceptions

- `src/components/use-table-ui-state.ts` používá inline `import { type MRT_DensityState }`, což je v rozporu s pravidlem `separate-type-imports`. ESLint to hlásí jen jako `warn`. Soubor je klientský, bez server importů, takže riziko z pravidla se netýká.
