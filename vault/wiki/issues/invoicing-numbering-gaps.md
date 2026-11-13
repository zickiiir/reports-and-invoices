---
title: Číselná řada faktur: díry po selhání vložení a přetečení formátu
type: issue
domain: invoicing
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-11-12
related: [invoicing-numbering, invoicing-invoices-and-items, invoicing]
---

# Číselná řada faktur: díry po selhání vložení a přetečení formátu

Číslo se rezervuje mimo transakci vkládající fakturu, takže selhání vložení zanechá v řadě díru. Smazání posledního konceptu už díru nedělá (od verze 1.6.1).

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

Stále otevřené:

- `reserveInvoiceNumber` (`src/server/invoicing/numbering.ts`) běží mimo transakci, která fakturu vkládá, takže neúspěšný insert nechá díru.
- `setNumberSequence` povoluje 0–99, ale `padStart(2)` neořezává, takže 100. číslo má tři cifry.
- Změna `invoiceNumberingScope` nemigruje staré čítače.

Vyřešeno (2026-11-12):

- Smazání konceptu s posledním číslem řady vrátí čítač o jeden krok (`releaseInvoiceNumber`, volané z `invoice.delete` v jedné transakci se smazáním). Smazání konceptu níž v řadě díru dál nechá.
- Díry už nejsou mrtvé: formulář nové faktury je nabízí jako volná čísla a server je přijme (viz [[invoicing-numbering]]). Díry po selhání vložení nebo po smazání starší faktury tak jde znovu použít.

## Why Not Fixed Now

Číslování faktur může mít právní požadavky na souvislost řady, je třeba rozhodnout, co je správné chování. Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Rezervovat číslo ve stejné transakci jako vložení faktury; sjednotit formát čísla (limit `setNumberSequence` vs. tříciferné pořadí); rozhodnout, co s čítači po změně scope.
