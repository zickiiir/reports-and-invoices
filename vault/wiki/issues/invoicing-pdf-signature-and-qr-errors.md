---
title: PDF: nekontrolovaná URL podpisu a tiché selhání QR
type: issue
domain: invoicing
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-10-11
related: [invoicing-pdf-rendering, invoicing-czech-qr-payment, access-security-invariants, invoicing]
---

# PDF: nekontrolovaná URL podpisu a tiché selhání QR

Šablona načítá URL podpisu bez omezení schématu a hostitele a chybu generování QR potichu spolkne.

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

`users.signatureImageUrl` se escapuje, ale schéma ani hostitel se neomezují, a Chromium URL při renderu načte (možné SSRF, v dokumentaci označeno jako nejasné). Route `src/app/api/invoices/[id]/pdf/route.ts` chytá chybu QR přes `.catch(() => null)`, takže PDF vyjde bez QR a bez varování. `render.ts` neošetřuje pád sdíleného prohlížeče.

## Why Not Fixed Now

Vyžaduje ověření dosahu a návrh omezení (např. jen data URL nebo vlastní upload). Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Povolit pro podpis jen `data:` obrázky nebo nahrání na server, logovat/ohlásit selhání QR a při pádu Chromia prohlížeč znovu spustit.
