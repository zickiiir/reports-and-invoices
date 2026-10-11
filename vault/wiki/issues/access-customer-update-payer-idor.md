---
title: customer.update umožňuje přiřadit zákazníka k cizímu plátci
type: issue
domain: access
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-10-11
related: [access-role-visibility, invoicing-payers-and-customers, invoicing-creation-flow, access]
---

# customer.update umožňuje přiřadit zákazníka k cizímu plátci

Změna `payerId` u zákazníka se neověřuje proti vlastníkovi cílového plátce, což otevírá IDOR.

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

`customer.update` přijme nové `payerId` bez kontroly vlastníka plátce. Kdo zná UUID cizího plátce, může k němu připojit vlastního zákazníka; `customer.list` a `customer.get` pak vrátí jméno, adresu a IČ toho plátce. `invoice.createDraft` vybírá zákazníky jen podle `payerId`. Příbuzné: `customer.create` kontroluje vlastníka plátce, ale píše `userId` z přihlášeného uživatele, takže super_user může vytvořit zákazníka pod cizím plátcem se svým `userId`.

## Why Not Fixed Now

Mimo rozsah dokumentační práce. Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Při změně `payerId` volat `assertOwnerOrSuperUser` pro cílového plátce (a ověřit vlastníka v `customer.create`). Přidat do `invoice.createDraft` kontrolu vlastnictví zákazníků.
