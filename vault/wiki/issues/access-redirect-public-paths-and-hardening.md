---
title: Otevřený redirect, široké PUBLIC_PATHS, chybějící CSP/HSTS a slabý generátor hesel
type: issue
domain: access
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-10-11
related: [access-authentication, access-security-invariants, access-user-administration, access]
---

# Otevřený redirect, široké PUBLIC_PATHS, chybějící CSP/HSTS a slabý generátor hesel

Několik menších zpevnění přihlášení a hlaviček, které nejsou kritické, ale jsou slabší než zbytek obrany.

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

Přihlašovací stránka předává `callbackUrl` do `router.push` bez kontroly (možný open redirect, neověřeno). `src/proxy.ts::PUBLIC_PATHS` používá `startsWith`, takže veřejná je každá cesta začínající `/login` nebo `/icon`. `next.config.js` nenastavuje CSP ani HSTS. `generatePassword` používá `Math.random`, ne kryptografický generátor. `isPrivateOrReservedIpv6` viz [[nextcloud-ssrf-guard-gaps]].

## Why Not Fixed Now

Menší priorita; vyžaduje ověření, zda jsou reálně zneužitelné. Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Povolit v `callbackUrl` jen relativní cesty, porovnávat `PUBLIC_PATHS` přesně nebo s hranicí segmentu, přidat CSP/HSTS (podle způsobu nasazení) a použít `crypto.randomInt`.
