---
title: SSRF guard nepokrývá všechny rezervované rozsahy a má okno pro DNS rebinding
type: issue
domain: nextcloud
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-10-11
related: [nextcloud-ssrf-guard, nextcloud-webdav-client, access-security-invariants, nextcloud]
---

# SSRF guard nepokrývá všechny rezervované rozsahy a má okno pro DNS rebinding

Guard `assertPublicHost` přehlíží některé privátní rozsahy a hexový zápis IPv4-mapped IPv6.

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

`src/server/nextcloud/ssrf-guard.ts` nezachytává `100.64.0.0/10` (CGNAT), `192.0.0.0/24`, `198.18.0.0/15` ani `fec0::/10`. `isPrivateOrReservedIpv6` zná jen tečkový zápis `::ffff:a.b.c.d`, zatímco parser `URL` normalizuje na hex (`[::ffff:7f00:1]`), který zřejmě projde. DNS dotaz guardu a dotaz knihovny `webdav` jsou oddělené, takže rebinding mezi nimi zůstává možný. Nebylo ověřeno, zda `webdav` následuje přesměrování na jiný host. Chybové hlášky rozlišují „interní adresa“ a „selhání DNS“, což umožňuje zkoumat existenci hostitelů. Modul nemá testy.

## Why Not Fixed Now

Nutné nejdřív prakticky ověřit; úprava guardu je citlivá (viz `CLAUDE.md`). Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Doplnit rozsahy, normalizovat IPv4-mapped IPv6, připojovat se přímo na ověřenou IP (pinning) a zakázat/ověřit přesměrování; přidat testy.
