---
title: Role v JWT zastarávají a změna hesla neruší relace
type: issue
domain: access
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-10-11
related: [access-authentication, access-users-and-roles, access-user-administration, access]
---

# Role v JWT zastarávají a změna hesla neruší relace

Role a nadřízený se do JWT zapíšou při přihlášení a změna role ani hesla stávající tokeny neovlivní.

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

JWT drží `role` a `managerId` z doby přihlášení. `user.updateRoleAndManager` nemá na existující relace vliv, takže degradovaný senior dál čte výkazy podřízených do vypršení tokenu nebo nového přihlášení. `session.maxAge` není nastaveno (platí výchozí hodnota Auth.js, neověřená). `changePassword` nevyžaduje současné heslo a tokeny neruší. `updateRoleAndManager` navíc kontroluje jen `id === managerId`: nekontroluje, že manažer je senior/super_user, nebrání cyklům a super_user může degradovat sám sebe (UI blokuje jen self případ).

## Why Not Fixed Now

Vyžaduje rozhodnutí o návrhu relací (kontrola role z DB při každém requestu vs. krátká platnost tokenu). Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Načítat roli z DB u citlivých kontrol nebo zkrátit `maxAge`; při změně hesla vyžadovat staré heslo; doplnit validaci manažera a cyklů.
