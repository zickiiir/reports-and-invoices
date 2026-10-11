---
title: Nextcloud sync a ošetření kolizí
type: concept
domain: nextcloud
status: current
tags: [sync, conflict, nextcloud, ui]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [nextcloud, nextcloud-webdav-client, nextcloud-one-way-sync, timesheet-editor-and-import, timesheet-local-folder-sync]
---

# Nextcloud sync a ošetření kolizí

Appka nepřepíše na Nextcloudu soubor, který sama nevytvořila, dokud to uživatel výslovně nepotvrdí.

## The Problem It Solves

Ve vzdálené složce může ležet ručně nahraný soubor se stejným názvem jako výkaz. Slepý PUT s `overwrite: true` by ho smazal. Proto appka u každého období rozlišuje, zda tu cestu už jednou sama zapsala.

## How It Works

Mechanismus je sloupec `users.nextcloudSyncedPeriods` (`jsonb`, `string[]`, formát `YYYYMM`) v `src/server/db/schema.ts::users`.

1. Období není v setu: `sync.ts::uploadPeriod` nejdřív zavolá `existsOnNextcloud`. Chyba vede na `"failed"`, existující soubor na `"conflict"` (nezapíše se), jinak se zapíše.
2. Po prvním úspěšném zápisu `markPeriodsSynced` přidá období do setu. Od té doby je cesta "naše" a přepisuje se bez ptaní.
3. `disconnect` set vymaže (`null`), aby po opětovném připojení k jinému účtu či složce appka nepovažovala stará období za svá (komentář v `nextcloudRouter.disconnect`).

Pozn.: set neukládá nic o vzdálené cestě. Změna `remotePath` bez odpojení (`connect` znovu přepíše sloupce, ale `nextcloudSyncedPeriods` nemaže) znamená, že appka bere období jako svá i na nové cestě. Tvrzení vychází z kódu `connect`, nebylo ověřeno v běhu.

## Výsledky

`sync.ts::NextcloudSyncOutcome`: `"synced" | "conflict" | "failed" | "not-configured"`.

- `not-configured` — chybí `nextcloudUrl`, `nextcloudUsername` nebo `nextcloudAppPasswordEnc` (`getConfigForUser` vrací `null`).
- `failed` — chyba sítě, oprávnění, dešifrování nebo cokoli vyhozeného uvnitř.
- `conflict` — soubor existuje a období není v setu.

`syncTimesheetToNextcloud` nikdy nevyhazuje (celé tělo je v `try/catch`, který vrací `"failed"`). Sync tedy neshodí uložení výkazu. Volá ho `src/server/api/routers/timesheet.ts` z `save` a `importBatch` a výsledek (`nextcloudSync`) vrací v odpovědi. Frontend ho ukáže v notifikaci, hlavně tichou kolizi. Viz [[timesheet-editor-and-import]]. Volající na sync čeká (`await`), není to fire-and-forget.

## Náhled a ruční výběr

`nextcloudRouter.previewSync` → `sync.ts::previewNextcloudSync` (nic nezapisuje) vrátí pro každé období z `listPeriods` řádek `SyncPreviewRow` se stavem:

| status | Význam | UI badge | Výchozí zaškrtnutí |
|---|---|---|---|
| `known` | období je v setu, bude běžný přepis | "již synchronizováno" | ano |
| `new` | na cestě nic není | "nový" | ano |
| `conflict` | na cestě je cizí soubor | "koliduje s existujícím souborem" | ne |
| `error` | `existsOnNextcloud` selhal | "nepodařilo se ověřit" | ne, checkbox je disabled |

`nextcloudRouter.syncSelected` (vstup: pole `YYYYMM`, min. 1) → `syncSelectedPeriodsToNextcloud` zapíše přesně vybraná období bez nové kontroly existence (uživatel ji viděl v náhledu). Vrací `{ synced, failed }` a nová období přidá do setu. Zaškrtnutím kolize uživatel vědomě povolí přepis.

## UI

`src/app/(app)/settings/nextcloud-sync-modal.tsx::NextcloudSyncModal` je tabulka s checkboxy, barevnými badge a červeným `Alert` s počtem kolizí. Výchozí výběr počítá `useMemo`, ruční změnu drží nullable `useState` (`manualSelection`), `handleClose` ji vynuluje. Stejný vzor má import výkazů, viz [[timesheet-editor-and-import]]. Modal se otevře po úspěšném `connect` a tlačítkem "Synchronizovat teď" v `settings-form.tsx`.

## Trade-offs

- `markPeriodsSynced` čte a zapisuje set ve dvou dotazech bez transakce. Souběžné syncy mohou ztratit zápis. Důsledek je mírný: období by se při příštím syncu znovu zkontrolovala na kolizi a skončila jako `conflict` na vlastním souboru.
- `syncSelected` nevaliduje, že období existuje. `readTimesheetRaw` pro neexistující období vyhodí a celá mutace spadne (výjimka není chycena, částečně zapsaná období se do setu nezapíší).
- Uživatel, kterému sync hlásí `conflict`, má jedinou cestu: ruční modal v Nastavení. Automatické uložení kolizi jen oznámí.
- Lokální složka má vlastní mechanismus, viz [[timesheet-local-folder-sync]]. Důvod jednosměrnosti: [[nextcloud-one-way-sync]].

## Related Concepts

- [[nextcloud-webdav-client]] — `existsOnNextcloud`, `uploadToNextcloud`
- [[nextcloud]] — landing page
