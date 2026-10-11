---
title: Stavy faktur bez kontroly přechodů, nepoužívaná měna, volné datumy
type: issue
domain: invoicing
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-10-11
related: [invoicing-creation-flow, invoicing-invoices-and-items, invoicing-dates-and-line-items, invoicing]
---

# Stavy faktur bez kontroly přechodů, nepoužívaná měna, volné datumy

Faktury jde po vystavení nebo zaplacení dál libovolně měnit a některá pole se nevyužívají.

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

`invoice.update` přijme libovolnou hodnotu `invoiceStatusEnum` bez kontroly povolených přechodů; vystavené i zaplacené faktury jde přepsat (položky i data). Datumy přicházejí jako `z.string()` bez validace formátu. Sloupec `invoices.currency` se nepoužívá: šablona vždy tiskne „Kč“ a „Neplátce DPH“ a SPD řetězec má natvrdo `CC:CZK`. Docstring `computeInvoiceDates` mluví o měsíci faktury, kód pracuje s měsícem výkazu (jen nesoulad pojmenování).

## Why Not Fixed Now

Vyžaduje rozhodnutí o obchodních pravidlech (co smí zůstat editovatelné). Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Definovat stavový automat, zamknout vystavené faktury, validovat datumy (`z.coerce.date` nebo regex) a buď měnu využít, nebo sloupec odstranit.
