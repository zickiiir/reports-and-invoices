---
title: Access
type: domain
domain: access
status: current
tags: [domain, security, auth]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [access-security-invariants, access-authentication, access-login-rate-limiting, access-role-visibility, access-users-and-roles, access-user-administration]
---

# Access

Přihlášení, role, viditelnost dat, rate limiting loginu, správa účtů a katalog bezpečnostních invariantů.

## Overview

- **Purpose**: pustit dovnitř jen přihlášené a dát každému vidět jen jeho data (senior navíc výkazy podřízených).
- **Path**: `src/server/auth/`, `src/server/access/`, `src/proxy.ts`, `src/server/api/trpc.ts`, `src/app/api/auth/`.
- **Status**: aktivní. Autorizace je rozprostřená po routerech — není centrální middleware, každá procedura volá guard sama.

## Key Responsibilities

- Autentizace e-mail + heslo (NextAuth v5 Credentials, JWT, bez DB adaptéru) — [[access-authentication]].
- Omezení pokusů o přihlášení — [[access-login-rate-limiting]].
- Role `super_user` / `senior_programmer` / `developer` a pravidla viditelnosti — [[access-role-visibility]], [[access-users-and-roles]].
- Zakládání účtů a nastavení vlastního profilu — [[access-user-administration]].
- Katalog bezpečnostních invariantů, které se nesmí oslabit — [[access-security-invariants]].

## How It Fits

Doména je závislá jen na `users` v DB ([[platform-db-schema-overview]]). Routery ostatních domén ([[timesheet]], [[invoicing]], [[nextcloud]]) volají guardy z `src/server/access/visibility.ts`. Invarianty v katalogu se týkají i kódu těchto domén (cesty k souborům, SSRF, šifrování, PDF).

## Documentation Map

- [[access-security-invariants]] — hlavní stránka: katalog invariantů s odkazem na kód, důvodem a známými mezerami
- [[access-authentication]] — login, JWT, `src/proxy.ts`, force-logout
- [[access-login-rate-limiting]] — fixed-window limiter (email 5, IP 20 / 15 min)
- [[access-role-visibility]] — tabulka procedura → guard pro každý router a nalezené mezery
- [[access-users-and-roles]] — tabulka `users`
- [[access-user-administration]] — `/admin/users`, politika hesel, `/settings`

## Known Issues / Not Yet Documented

- Mezery v autorizaci (změna `payerId` u odběratele, zastaralá role v JWT) jsou v [[access-role-visibility]] a [[access-security-invariants]].
- Pentest-report v repozitáři není; pro stránku analýzy nebylo dost podkladů.

## Otevřené issues

- [[access-customer-update-payer-idor]] — customer.update umožňuje přiřadit zákazníka k cizímu plátci
- [[access-session-staleness-and-password-change]] — Role v JWT zastarávají a změna hesla neruší relace
- [[access-user-me-exposes-encrypted-password]] — user.me vrací do prohlížeče šifrované Nextcloud heslo
- [[access-login-rate-limit-bypass]] — Rate limit loginu jde obejít přes x-forwarded-for a zamknout cizí účet
- [[access-redirect-public-paths-and-hardening]] — Otevřený redirect, široké PUBLIC_PATHS, chybějící CSP/HSTS a slabý generátor hesel
