---
title: Šifrování Nextcloud hesla
type: concept
domain: nextcloud
status: current
tags: [security, encryption, aes-gcm, nextcloud]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [nextcloud, nextcloud-ssrf-guard, nextcloud-webdav-client, access-security-invariants]
---

# Šifrování Nextcloud hesla

Aplikační heslo k Nextcloudu se v DB ukládá šifrované (AES-256-GCM) klíčem odvozeným z `AUTH_SECRET`.

## The Problem It Solves

Na rozdíl od `passwordHash` uživatele musí jít Nextcloud heslo přečíst zpět, protože ho appka posílá na WebDAV endpoint. Nejde ho proto hashovat, jen šifrovat (komentář v `src/server/nextcloud/crypto.ts`). Nový env nepřibývá, použije se už existující `AUTH_SECRET`.

## How It Works

- **Klíč**: `crypto.ts::deriveKey` vrací `sha256("nextcloud-app-password:" + AUTH_SECRET)` (32 bajtů). Prefix odděluje klíč od jiných použití téhož secretu.
- **Šifrování**: `encryptSecret(plain)` vygeneruje náhodné 12bajtové IV (`randomBytes(12)`), zašifruje `aes-256-gcm` a přidá authTag.
- **Formát uložených dat**: jeden textový řetězec `base64(iv):base64(authTag):base64(ciphertext)`.
- **Dešifrování**: `decryptSecret(encoded)` řetězec rozdělí na `:`. Při chybějící části vyhodí "Neplatný formát šifrovaného hesla." GCM tag chybné dat/klíč odhalí při `decipher.final()` výjimkou.

## Pád při chybějícím secretu

`src/env.js` vyžaduje `AUTH_SECRET` jen v produkci (`z.string()`), mimo produkci je `optional`. `deriveKey` proto při `!env.AUTH_SECRET` vyhodí chybu "AUTH_SECRET musí být nastaven pro šifrování Nextcloud hesla." Komentář: raději chyba než tiché šifrování předvídatelným klíčem.

## Implementation

- Úložiště: sloupec `users.nextcloudAppPasswordEnc` (`text`) v `src/server/db/schema.ts::users`. Vedle něj `nextcloudUrl`, `nextcloudUsername`, `nextcloudRemotePath`, `nextcloudSyncedPeriods`.
- Zápis: `src/server/api/routers/nextcloud.ts::nextcloudRouter.connect` volá `encryptSecret(input.appPassword)` až po úspěšném testu připojení.
- Čtení: `src/server/nextcloud/sync.ts::getConfigForUser` volá `decryptSecret`.
- `disconnect` nastaví sloupec na `null`.
- `status` heslo ani jeho šifru klientovi nevrací.
- Modul má `import "server-only"`.

## Dopad rotace AUTH_SECRET

Odvozeno z kódu (v repozitáři není žádný migrační nástroj):

- Po změně `AUTH_SECRET` odvodí `deriveKey` jiný klíč a `decryptSecret` na starých datech selže na ověření GCM tagu.
- `getConfigForUser` výjimku nezachytává. `syncTimesheetToNextcloud` ji chytá v `try/catch` a vrací `"failed"`, takže uložení výkazu projde, ale synchronizace tiše selhává.
- `previewNextcloudSync` a `syncSelectedPeriodsToNextcloud` výjimku nechytají, takže `previewSync` a `syncSelected` skončí chybou tRPC.
- `nextcloudRouter.status` stále hlásí `configured: true`, protože kontroluje jen `nextcloudUrl`.
- Náprava: uživatel musí Nextcloud odpojit a znovu připojit (`disconnect` + `connect`). Odpojení smaže i `nextcloudSyncedPeriods`, takže se znovu provede kontrola kolizí.
- Rotace secretu zároveň zneplatní JWT session (NextAuth), takže uživatelé se stejně musejí znovu přihlásit.

## Trade-offs

- Kdo má DB i `AUTH_SECRET` (např. celé prostředí kontejneru), heslo přečte. Šifrování chrání proti úniku samotné DB (dump).
- Klíč a secret nemají verzi, takže plynulá rotace nejde.
- Žádné AAD (associated data): šifrovaný blob jednoho uživatele by šel dešifrovat po přepsání do řádku jiného uživatele. Vyžadovalo by to zápis do DB.

## Related Concepts

- [[nextcloud-ssrf-guard]] — ochrana směru ven
- [[access-security-invariants]] — přehled bezpečnostních invariantů
- [[nextcloud]] — landing page
