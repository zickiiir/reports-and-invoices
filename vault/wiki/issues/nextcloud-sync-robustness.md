---
title: Nextcloud sync: bez timeoutů, zastaralá historie po přepojení, tiché selhání po rotaci AUTH_SECRET
type: issue
domain: nextcloud
status: active
tags: [issue]
created: 2026-10-11
updated: 2026-10-11
related: [nextcloud-sync-conflict-handling, nextcloud-webdav-client, nextcloud-password-encryption, timesheet-editor-and-import, nextcloud]
---

# Nextcloud sync: bez timeoutů, zastaralá historie po přepojení, tiché selhání po rotaci AUTH_SECRET

Několik slabin robustnosti synchronizace, které mohou zpomalit ukládání nebo přeskočit kontrolu kolizí.

## Found In

Zjištěno při úvodní dokumentaci wiki (`document-wiki`, 2026-10-11). Zjištění pochází ze čtení kódu a nebylo prakticky ověřeno ani otestováno.

## Problem

1) `src/server/nextcloud/client.ts` nenastavuje žádný timeout, a `timesheet.save`/`importBatch` na sync čekají, takže pomalý Nextcloud zpomalí uložení. 2) `connect` přepíše URL a cestu, ale nemaže `nextcloudSyncedPeriods`; po přepojení na jinou složku se stará období berou jako vlastní a kontrola kolizí se přeskočí (z čtení kódu). 3) Po rotaci `AUTH_SECRET` selže `decryptSecret`, `getConfigForUser` chybu nezachytí: automatický sync tiše vrací `"failed"`, `status` dál hlásí `configured: true`, uživatel musí odpojit a připojit znovu. 4) `markPeriodsSynced` čte a zapisuje množinu bez transakce, souběžné syncy mohou zápis ztratit. 5) `syncSelected` nekontroluje existenci období; `readTimesheetRaw` pro chybějící vyhodí chybu a celá mutace selže bez označení už zapsaných období. 6) `previewNextcloudSync` volá `existsOnNextcloud` sekvenčně pro každé období. 7) AES-GCM bez AAD a bez verze klíče. Modul nemá testy.

## Why Not Fixed Now

Nejde o chyby viditelné v běžném provozu a vyžadují drobná designová rozhodnutí. Dohodnuto s uživatelem: zatím jen zapsat, řešit později.

## Proposed Fix

Přidat timeout, při `connect` resetovat `nextcloudSyncedPeriods`, chytat chybu dešifrování a hlásit ji uživateli, zapisovat množinu atomicky (jsonb operace nebo transakce), paralelizovat náhled. Nesmí se oslabit ochrana proti přepsání cizího souboru.
