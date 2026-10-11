---
title: Rate limit loginu jde obejít přes x-forwarded-for a zamknout cizí účet
type: issue
domain: access
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-10-11
related: [access-login-rate-limiting, access-authentication, access]
---

# Rate limit loginu jde obejít přes x-forwarded-for a zamknout cizí účet

IP limit věří hlavičce `x-forwarded-for` a limit na e-mail umožňuje zamknout cizí účet na 15 minut.

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

`src/server/auth/config.ts` bere IP z `x-forwarded-for` bez ověřené proxy, takže klient může IP limit obejít. Kdokoli může opakovanými pokusy zamknout cizí e-mail na 15 minut. Úspěšné přihlášení navíc resetuje IP bucket (`resetRateLimit`). Appka běží bez reverse proxy.

## Why Not Fixed Now

Chování je částečně vědomé (in-memory limiter, jedna instance), úprava závisí na tom, jak se bude nasazovat. Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Důvěřovat hlavičce jen za známou proxy, neresetovat IP bucket po úspěchu a zvážit limit, který nezamyká cizí účet (např. zpoždění místo zámku).
