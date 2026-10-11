---
title: Dropzone podpisu v Nastavení ukládá okamžitě, odporuje pravidlu explicitního Save
type: issue
domain: platform
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-10-11
related: [platform-ui-conventions, access-user-administration, platform]
---

# Dropzone podpisu v Nastavení ukládá okamžitě, odporuje pravidlu explicitního Save

Nahrání podpisu volá `user.updateProfile` hned a uloží i neuložené hodnoty z formuláře profilu.

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

`src/app/(app)/settings/settings-form.tsx`: dropzone podpisu ukládá přes `user.updateProfile` ihned při nahrání a posílá i rozeditované hodnoty profilu. Všechny ostatní karty nastavení používají tlačítko Save a projekt má pravidlo, že nastavení se nikdy neukládá automaticky.

## Why Not Fixed Now

UI změna mimo rozsah dokumentační práce. Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Podpis držet ve stavu formuláře a uložit až tlačítkem Save společně s ostatními poli.
