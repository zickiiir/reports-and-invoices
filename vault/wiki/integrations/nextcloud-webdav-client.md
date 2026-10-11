---
title: Nextcloud WebDAV klient
type: integration
domain: nextcloud
status: current
tags: [integration, nextcloud, webdav, external]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [nextcloud, nextcloud-ssrf-guard, nextcloud-password-encryption, nextcloud-sync-conflict-handling, access-security-invariants]
---

# Nextcloud WebDAV klient

Tenký wrapper nad knihovnou `webdav`, kterým server zapisuje výkazy do Nextcloudu uživatele.

## Contract

- **Endpoint**: uživatel zadá jen adresu serveru (např. `https://cloud.example.com`). Appka složí `<server>/remote.php/dav/files/<username>/` (`src/server/nextcloud/client.ts::buildWebdavUrl`, koncové `/` se ořežou, username se `encodeURIComponent`).
- **Protokol**: WebDAV přes `createClient` z balíčku `webdav` (`client.ts::client`).
- **Auth**: HTTP Basic s uživatelským jménem a aplikačním heslem Nextcloudu (ne hlavním heslem). V DB je heslo šifrované, viz [[nextcloud-password-encryption]]. Dešifruje ho `src/server/nextcloud/sync.ts::getConfigForUser`.
- **Vzdálená složka**: `users.nextcloudRemotePath`, fallback `"/Vykazy"`. Cesta se normalizuje (`client.ts::normalizeDir`, `joinPath`).
- **Název souboru**: `src/server/timesheet/filename.ts::suggestedFilename(period)`.

## What We Send / Receive

| Operace | Funkce | WebDAV volání |
|---|---|---|
| Test připojení | `client.ts::testNextcloudConnection` | `exists("/")` |
| Existence souboru | `client.ts::existsOnNextcloud` | `exists(<dir>/<filename>)` |
| Zápis | `client.ts::uploadToNextcloud` | `createDirectory(dir, { recursive: true })` (MKCOL), pak `putFileContents(..., { overwrite: true })` (PUT) |

- `createDirectory` toleruje stavy 405 a 409 (složka už existuje). Jiné chyby se propagují.
- Pro kořen `/` se `createDirectory` přeskočí.
- Posílá se surový text výkazu (`readTimesheetRaw` / `input.content`), ne HTML.
- Klient nic nečte zpět kromě odpovědi na `exists`.

## Failure Modes

Žádná funkce klienta nevyhazuje. Všechny vrací `{ ok: true, ... } | { ok: false, error: string }`; text chyby vyrábí `client.ts::describeError`:

- HTTP 401 → "Nesprávné přihlašovací údaje (uživatel nebo aplikační heslo)."
- HTTP 404 → "Server na dané adrese neodpovídá na WebDAV (zkontroluj URL)."
- jiná `Error` → její `message`, jinak "Připojení se nezdařilo."

Chyby z [[nextcloud-ssrf-guard]] (neplatná URL, localhost/interní IP, DNS) projdou stejnou cestou jako `error`.

Volající (`sync.ts`) výsledek mapuje na `"failed"`. Opakování (retry) neexistuje. Další pokus nastane až při dalším uložení výkazu nebo ruční synchronizaci.

## Client Wrapper

- `import "server-only"` na začátku `client.ts` brání dostat modul do client bundlu.
- `assertPublicHost(config.url)` se volá na začátku každé z tří exportovaných funkcí, tedy při každém reálném requestu, ne jen při "connect". Komentář v `uploadToNextcloud` to zdůvodňuje zúžením okna pro DNS rebinding. Detail viz [[nextcloud-ssrf-guard]].
- Klient se vytváří znovu při každém volání (`client(config)`), nedrží se žádné spojení.

## Gotchas

- Timeouty: v `createClient` ani v `putFileContents` není nastaven žádný timeout. Chování při visícím serveru určuje výchozí nastavení knihovny `webdav` (v kódu neověřeno). Protože `timesheet.save` na sync čeká (`await syncTimesheetToNextcloud`), pomalý Nextcloud může zpomalit odpověď uložení.
- `sync.ts::previewNextcloudSync` dělá `exists` sekvenčně pro každé období, takže náhled pro mnoho období trvá dlouho.
- Zda `webdav` sleduje HTTP přesměrování (a tím obchází kontrolu hostu) se v kódu neřeší. Neověřeno.
- Doména: [[nextcloud]]. Obecné bezpečnostní invarianty: [[access-security-invariants]].
