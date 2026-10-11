---
title: user.me vrací do prohlížeče šifrované Nextcloud heslo
type: issue
domain: access
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-10-11
related: [access-users-and-roles, nextcloud-password-encryption, access]
---

# user.me vrací do prohlížeče šifrované Nextcloud heslo

Procedura `user.me` vrací celý řádek kromě `passwordHash`, včetně šifrovaného aplikačního hesla Nextcloudu.

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

`src/server/api/routers/user.ts` (`user.me`) vrací celý řádek `users` s výjimkou `passwordHash`, takže `nextcloudAppPasswordEnc` jde do klienta. Heslo je šifrované (AES-256-GCM), ale klíč je odvozen z `AUTH_SECRET` a ciphertext do prohlížeče nepatří.

## Why Not Fixed Now

Mimo rozsah dokumentační práce; je třeba zkontrolovat, co z řádku klient skutečně používá. Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Vracet explicitní seznam sloupců (whitelist) bez `nextcloudAppPasswordEnc`.
