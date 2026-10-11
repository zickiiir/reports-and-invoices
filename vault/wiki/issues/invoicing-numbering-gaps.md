---
title: Číselná řada faktur: díry, žádné vracení čítače a přetečení formátu
type: issue
domain: invoicing
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-10-11
related: [invoicing-numbering, invoicing-invoices-and-items, invoicing]
---

# Číselná řada faktur: díry, žádné vracení čítače a přetečení formátu

Číslo se rezervuje mimo transakci vkládající fakturu, takže selhání nebo smazání zanechá v řadě díru.

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

`reserveInvoiceNumber` (`src/server/invoicing/numbering.ts`) běží mimo transakci, která fakturu vkládá, takže neúspěšný insert nechá díru. `invoice.delete` čítač nevrací. `setNumberSequence` povoluje 0–99, ale `padStart(2)` neořezává, takže 100. číslo má tři cifry. Změna `invoiceNumberingScope` nemigruje staré čítače.

## Why Not Fixed Now

Číslování faktur může mít právní požadavky na souvislost řady, je třeba rozhodnout, co je správné chování. Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Rozhodnout, zda řadu držet bez děr (rezervace v téže transakci) a jak řešit smazání; sjednotit formát čísla.
