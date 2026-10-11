---
title: Záloha výkazů do lokální složky
type: concept
domain: timesheet
status: current
tags: [sync, file-system-access, browser, timesheet]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [timesheet, timesheet-editor-and-import, timesheet-disk-storage, nextcloud]
---

# Záloha výkazů do lokální složky

Appka umí po každém uložení zapsat surový výkaz do složky na disku uživatele. Běží to celé v prohlížeči přes File System Access API. Server o tom neví.

## The Problem It Solves

Uživatel chce mít kopie výkazů u sebe (typicky ve složce, kterou sleduje desktopový Nextcloud klient), aniž by appka potřebovala přístup k Nextcloudu. Doplňuje serverový WebDAV sync ([[nextcloud]]).

## How It Works

- Podpora: `src/components/local-sync.ts::isLocalSyncSupported` testuje `"showDirectoryPicker" in window`. Funguje jen v Chrome/Edge. Typy chybějící v `lib.dom` doplňuje `src/types/file-system-access.d.ts` (`showDirectoryPicker`, `queryPermission`, `requestPermission`).
- Handle vybrané složky se ukládá do IndexedDB (databáze `reports-and-invoices-local-sync`, store `handles`, klíč `directory`), takže přežije reload.
- `pickSyncDirectory` otevře nativní dialog (`mode: "readwrite"`) a handle uloží. `clearSyncDirectory` ho smaže.
- Oprávnění: prohlížeč může po čase či restartu chtít zápis znovu potvrdit. `hasSyncPermission` jen zjistí stav (`queryPermission`, bez dialogu). `requestSyncPermission` zobrazí dotaz a smí se volat jen z kliknutí uživatele.
- `writeFileToSyncDirectory(filename, content)` zapíše soubor (`getFileHandle` s `create: true`, `createWritable`). Vrací `false`, když složka není nastavená nebo chybí oprávnění. Na pozadí se neptá.
- Název souboru: `suggestedFilename(period)` = `prace{YYYYMM}.txt` ([[timesheet-disk-storage]]).

Kdy se zapisuje:

1. Po uložení výkazu v editoru (`timesheet-editor.tsx::TimesheetEditor`, `saveMutation.onSuccess`). Při úspěchu notifikace „Zkopírováno i do synchronizované složky".
2. Po výběru složky v Nastavení se spustí `runFullSync` v `src/app/(app)/settings/settings-form.tsx::SettingsForm`: načte všechna období přes `timesheet.listPeriods` a `timesheet.read` a zapíše je všechna.

Zápis při importu (`timesheet-import-modal.tsx`) do lokální složky nejde. Jen editor ukládá do složky (podle čtení kódu).

## Implementation

- `src/components/local-sync.ts`: `isLocalSyncSupported`, `getSyncDirectoryHandle`, `pickSyncDirectory`, `clearSyncDirectory`, `hasSyncPermission`, `requestSyncPermission`, `writeFileToSyncDirectory`.
- `src/types/file-system-access.d.ts`.
- `src/app/(app)/settings/settings-form.tsx::SettingsForm` — UI nastavení (`handlePickSyncDirectory`, `handleRequestSyncPermission`, `handleClearSync`). Detekce podpory běží v `useEffect`, aby server a první render klienta byly shodné (jinak chyba hydratace).

## Rozdíl oproti Nextcloud sync

| | Lokální složka | Nextcloud |
|---|---|---|
| Kde běží | prohlížeč (Chrome/Edge) | server (WebDAV) |
| Konfigurace | handle v IndexedDB | uložená konfigurace v DB, heslo šifrované |
| Ochrana před přepsáním | žádná, soubor se přepíše | kontrola kolize, `nextcloudSyncedPeriods` |
| Směr | appka → složka | appka → Nextcloud |

Obě metody lze používat současně (README, „Synchronizace výkazů"). Viz [[nextcloud-sync-conflict-handling]].

## Trade-offs

- Pozadí bez gesta nemůže obnovit oprávnění, takže zápis tiše selže, dokud uživatel v Nastavení oprávnění neobnoví.
- Zápis přepíše existující soubor stejného jména bez dotazu.
- Chybí podpora pro Firefox a Safari.

## Related Concepts

- [[timesheet-editor-and-import]] — kdy se zapisuje
- [[nextcloud]] — serverová varianta zálohy
