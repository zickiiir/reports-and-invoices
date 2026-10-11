---
title: Autentizace (NextAuth, proxy.ts, timing-safe login)
type: concept
domain: access
status: current
tags: [auth, nextauth, jwt, proxy]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [access, access-login-rate-limiting, access-role-visibility, access-security-invariants, access-users-and-roles]
---

# Autentizace (NextAuth, proxy.ts, timing-safe login)

Přihlášení e-mailem a heslem přes NextAuth v5 (Auth.js), session je JWT, v DB nejsou žádné tabulky NextAuth.

## The Problem It Solves

Appka je self-hosted a účty zakládá jen super_user. Stačí tedy Credentials provider. Nesmí ale prozradit, jestli účet existuje, a nesmí jít snadno hádat hesla ([[access-login-rate-limiting]]).

## How It Works

1. Formulář `src/app/login/page.tsx::LoginPage` volá `signIn("credentials", { redirect: false })`. Kód chyby `too_many_attempts` ukáže jinou hlášku než špatné heslo.
2. `src/server/auth/config.ts::authConfig` (Credentials `authorize`):
   - zod `credentialsSchema` (e-mail + neprázdné heslo), e-mail se převede na malá písmena a ořízne,
   - IP se bere z první hodnoty hlavičky `x-forwarded-for`, jinak `"unknown"`,
   - rate limit pro e-mail a IP (viz [[access-login-rate-limiting]]), při překročení `TooManyAttemptsError`,
   - načtení uživatele podle e-mailu, `verifyPassword` (bcrypt) proti `user?.passwordHash ?? DUMMY_PASSWORD_HASH`,
   - po úspěchu `resetRateLimit` obou klíčů.
3. Callback `jwt` při přihlášení uloží `id`, `role`, `managerId` do tokenu, callback `session` je vystaví jako `session.user`. Role a `managerId` se do tokenu zapíšou jen při přihlášení.
4. `src/server/auth/index.ts` exportuje `auth` (obalený React `cache`, pro RSC), `uncachedAuth` (pro `proxy.ts`), `handlers`, `signIn`, `signOut`.

### Timing-safe login

`src/server/auth/password.ts::DUMMY_PASSWORD_HASH` je pevný bcrypt hash bez uživatele. Pro neexistující e-mail se `bcrypt.compare` přesto spustí. Doba odpovědi tak nerozliší neexistující účet od špatného hesla. Hashování používá `SALT_ROUNDS = 12` (`hashPassword`).

### Přesměrování po loginu

`resolveSameOriginRedirect` v `config.ts` povolí jen redirect na stejný origin a vrací vždy absolutní URL (klient parsuje `new URL()`). Origin pro `/api/auth` handlery se bere z hlavičky Host/`x-forwarded-host` přes `requestOrigin`, protože `baseUrl` z Auth.js je za Docker port mappingem `http://localhost:3000` (`src/server/auth/index.ts`, druhé volání `NextAuth((req) => ...)`).

### Auth gate: `src/proxy.ts`

Next.js v této verzi používá konvenci `proxy.ts`; `middleware` je označený jako deprecated a přejmenovaný na `proxy` (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). Soubor je `src/proxy.ts`, výchozí export je `uncachedAuth((req) => ...)`.

- Nepřihlášený na neveřejnou cestu dostane redirect na `/login?callbackUrl=<pathname>`.
- Přihlášený na `/login` dostane redirect na `/`.
- `PUBLIC_PATHS` v `src/proxy.ts`: `/login`, `/icon`, `/apple-icon`, `/opengraph-image`, `/twitter-image`, plus cokoli pod `/api/auth`. Obrázky ikon jsou veřejné, aby šly náhledy odkazů (Slack apod.).
- `uncachedAuth` je nutný: React `cache()` v proxy nemá kontext požadavku a dříve způsobil smyčku přesměrování (komentář v `index.ts`).
- `config.matcher` vynechává `_next/static`, `_next/image`, `favicon.ico` a soubory `.png/.svg/.jpg/.jpeg/.gif/.webp`.

Proxy řeší jen „je přihlášený“. Autorizaci dat řeší routery ([[access-role-visibility]]).

### Force-logout

`src/app/api/auth/force-logout/route.ts::GET` smaže všechny cookies, jejichž název obsahuje `authjs` nebo `next-auth`, a přesměruje na `/login`. Použije se, když JWT platí, ale uživatel už v DB neexistuje (komentář v souboru; volající je `(app)/layout.tsx`, ten jsem nečetl).

## Implementation

- `src/server/auth/config.ts::authConfig`, `TooManyAttemptsError`, `resolveSameOriginRedirect`, `requestOrigin`
- `src/server/auth/index.ts`, `src/server/auth/password.ts`
- `src/proxy.ts::PUBLIC_PATHS`
- `src/app/api/auth/[...nextauth]/route.ts` (jen `handlers`)
- `src/server/api/trpc.ts::protectedProcedure` — druhá vrstva: bez `ctx.session.user` vyhodí `UNAUTHORIZED`. Všechny routery používají jen `protectedProcedure`, `publicProcedure` se v routerech nepoužívá.
- Route handlery `src/app/api/timesheets/download`, `.../report`, `src/app/api/invoices/[id]/pdf` volají `auth()` samy a vrací 401 JSON.

## Trade-offs

- JWT nese `role` a `managerId` z okamžiku přihlášení. `user.updateRoleAndManager` token nemění, změna role se projeví až po novém přihlášení (viz [[access-role-visibility]]). V `authConfig` není nastaveno `session.maxAge`, platí výchozí hodnota Auth.js (30 dní, hodnotu jsem v kódu Auth.js neověřoval).
- `user.changePassword` neruší stávající JWT.
- Rate limit používá `x-forwarded-for` bez ověření důvěryhodného proxy ([[access-login-rate-limiting]]).
- `PUBLIC_PATHS` se porovnává přes `startsWith`, takže veřejná je i každá cesta začínající např. `/login` nebo `/icon`.
- Login stránka po úspěchu dělá `router.push(searchParams.get("callbackUrl") ?? "/")` bez kontroly hodnoty (`src/app/login/page.tsx::LoginForm`). Zda to umožní open redirect na cizí origin, jsem neověřoval.

## Related Concepts

- [[access-login-rate-limiting]]
- [[access-role-visibility]]
- [[access-security-invariants]]
- [[access-users-and-roles]]
