---
title: Parser výkazu nekontroluje rozsahy a má netestované okrajové případy
type: issue
domain: timesheet
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-10-11
related: [timesheet-parser, timesheet-input-format, timesheet]
---

# Parser výkazu nekontroluje rozsahy a má netestované okrajové případy

Parser přijímá neplatné časy a roky a několik vstupů tiše mění v alias.

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

`src/server/timesheet/parse.ts`: časy se nekontrolují (projde `25:99`), dvouciferný rok (`2.7.26`) se bere doslova jako rok `26`, číslo před prvním datem se stane aliasem a zapomenutý jednoslovný popis se stane novým aliasem. `parse.test.ts` nepokrývá ISO data, řádky jen s minutami, bloky `#TODO`, komentáře ani diakritiku v aliasech. Chyby mají tvar `Řádek N: Neznám: …`, zatímco `zadani.md` ukazuje `Neznám: XYZ`.

## Why Not Fixed Now

Změna chování parseru může změnit výsledky u existujících výkazů, je potřeba rozhodnout, co je správné. Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Rozhodnout pravidla (rozsah času, výklad roku), doplnit testy pro uvedené případy a až potom parser zpřísnit. Nesmí se rozbít vzorový vstup `perl-app/prace202607DB.txt`.
