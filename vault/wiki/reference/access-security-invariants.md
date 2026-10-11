---
title: Katalog bezpečnostních invariantů
type: reference
subtype: catalog
domain: access
status: current
tags: [security, invariants, catalog]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [access, access-authentication, access-login-rate-limiting, access-role-visibility, timesheet-disk-storage, nextcloud-ssrf-guard, nextcloud-password-encryption, invoicing-pdf-rendering, invoicing-czech-qr-payment]
---

# Katalog bezpečnostních invariantů

Seznam ochran, které se nesmí omylem oslabit. Každý řádek je ověřen v kódu. Otevři stránku před změnou kódu kolem souborů, cest, externích URL, PDF nebo přihlášení.

## Rules / Entries

| # | Invariant | Kód | Důvod |
|---|---|---|---|
| 1 | Cesty k výkazům: `userId` musí projít UUID regexem a `period` regexem `YYYYMM` dřív, než se použijí v `path.join` | `src/server/timesheet/storage.ts::assertSafeUserId`, `assertSafePeriod`, `userRoot`, `periodDir` | path traversal přes `period` nebo `userId`. Detail: [[timesheet-disk-storage]] |
| 2 | SSRF guard: hostname se přeloží přes DNS a kontrolují se výsledné IP (loopback, privátní, link-local, multicast/reserved) | `src/server/nextcloud/ssrf-guard.ts::assertPublicHost` | Nextcloud URL zadává nízko-důvěryhodný uživatel. String matching hostname by šel obejít DNS. Detail: [[nextcloud-ssrf-guard]] |
| 3 | Guard se volá při každém reálném requestu, ne jen při „connect“ | `src/server/nextcloud/client.ts::uploadToNextcloud` (a další funkce klienta volající `assertPublicHost`) | zužuje okno pro DNS rebinding |
| 4 | Nextcloud aplikační heslo je v DB šifrované (AES-256-GCM, klíč = SHA-256 z `AUTH_SECRET`); bez `AUTH_SECRET` funkce vyhodí chybu | `src/server/nextcloud/crypto.ts::deriveKey`, `encryptSecret`, `decryptSecret` | heslo se musí číst zpět, proto šifrování, ne hash. Chyba je lepší než tiché šifrování předvídatelným klíčem. Detail: [[nextcloud-password-encryption]] |
| 5 | `import "server-only"` v modulech s tajemstvími nebo bezpečnostní logikou | `src/server/nextcloud/sync.ts`, `client.ts`, `crypto.ts`, `ssrf-guard.ts`, `src/server/pdf/render.ts`, `czech-payment.ts`, `src/server/auth/rate-limit.ts`, `src/trpc/server.ts` | modul se nesmí dostat do klientského bundlu. Při dočasném odebrání kvůli testu přes `tsx` se musí vrátit |
| 6 | Timing-safe login: i pro neexistující e-mail běží `bcrypt.compare` proti fixnímu hashi | `src/server/auth/config.ts::authConfig`, `src/server/auth/password.ts::DUMMY_PASSWORD_HASH` | zabraňuje enumeraci účtů podle doby odpovědi. Detail: [[access-authentication]] |
| 7 | Rate limit loginu: e-mail 5 a IP 20 pokusů / 15 min, in-memory | `src/server/auth/rate-limit.ts::checkRateLimit`, `config.ts::authConfig` | hádání hesel a password spraying. Detail: [[access-login-rate-limiting]] |
| 8 | Escapování hodnot v HTML faktury (`escapeHtml` pro text, `escapeAttr` pro atributy včetně `signatureImageUrl` a `qrDataUrl`) | `src/server/pdf/invoice-template.ts::escapeHtml`, `escapeAttr` | Puppeteer běží s `--no-sandbox --disable-setuid-sandbox` (`src/server/pdf/render.ts::getBrowser`), escapování je hlavní obrana proti injekci do HTML renderovaného v Chromiu. Detail: [[invoicing-pdf-rendering]] |
| 9 | `signatureImageUrl` musí na serveru odpovídat `data:image/(png\|jpe?g\|gif\|webp);base64,…` a max 4 000 000 znaků | `src/server/api/routers/user.ts::profileSchema` | druhá vrstva k bodu 8 |
| 10 | SPD/QR platba: `variableSymbol` a zpráva procházejí `sanitizeSpdText` (odstranění diakritiky, `*` a `:` nahrazeno mezerou, max 60 znaků) | `src/server/pdf/czech-payment.ts::sanitizeSpdText`, `generateQrPaymentDataUrl` | nejde vložit další pole platebního příkazu (např. jiný `ACC`). Detail: [[invoicing-czech-qr-payment]] |
| 11 | Security headery: `poweredByHeader: false`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`; pro `/api/invoices/:id/pdf` a `/api/timesheets/report` je `X-Frame-Options: SAMEORIGIN` | `next.config.js::config` | PDF a report se zobrazují v iframe uvnitř appky (`ReportPreviewModal`) |
| 12 | Auth gate v `src/proxy.ts` plus `protectedProcedure` plus `auth()` v route handlerech | `src/proxy.ts::PUBLIC_PATHS`, `src/server/api/trpc.ts::protectedProcedure` | více vrstev. Autorizaci dat proxy neřeší, viz [[access-role-visibility]] |
| 13 | Každá procedura nad cizími daty volá guard z `visibility.ts` | `src/server/access/visibility.ts` | bez guardu vzniká IDOR. Tabulka procedur: [[access-role-visibility]] |

### Pravidlo pro nová uživatelská pole

Pokud uživatel zapisuje pole, které se pak zobrazí nebo použije jinde, platí existující vzor, ne nové ad-hoc řešení:

- HTML/PDF → `escapeHtml` / `escapeAttr` (bod 8),
- QR string → `sanitizeSpdText` (bod 10),
- cesta k souboru → regex validace před `path.join` (bod 1),
- externí URL → `assertPublicHost` (bod 2),
- serverová validace zod i když je klientská kontrola (jako u hesla a podpisu).

## Known gaps (čtení kódu, netestováno)

- **SSRF guard, IPv6:** `isPrivateOrReservedIpv6` řeší jen tečkovanou formu `::ffff:a.b.c.d`. WHATWG `URL` normalizuje IPv4-mapped literál na hex (`[::ffff:7f00:1]`). `dns.lookup` literálu vrací stejnou adresu, takže regex nesedí a adresa projde. Je třeba ověřit prakticky. Neblokuje se také `100.64.0.0/10` (CGNAT), `fec0::/10` a NAT64. Mezi `lookup` a vlastním HTTP požadavkem knihovny je okno pro DNS rebinding (přeložení se děje podruhé).
- **Rate limit:** `x-forwarded-for` se bere bez důvěryhodné proxy (obejití IP limitu, možnost zamknout cizí e-mail na 15 min), viz [[access-login-rate-limiting]].
- **JWT drží starou roli** po změně role/nadřízeného a po změně hesla, viz [[access-role-visibility]].
- **`customer.update`** nekontroluje vlastnictví nového plátce (únik údajů plátce), viz [[access-role-visibility]].
- **`user.me`** vrací do klienta i šifrovaný Nextcloud token.
- **Hlavičky:** v `next.config.js` není `Content-Security-Policy` ani HSTS.
- **`generatePassword`** používá `Math.random`.
- **Login `callbackUrl`** se předává do `router.push` bez kontroly (`src/app/login/page.tsx`), dopad neověřen.

## Exceptions

- `src/server/pdf/invoice-template.ts` nemá `server-only` (čistá funkce bez tajemství), ostatní soubory v bodě 5 ano.
- `meta.changelog` a `timesheet.parseLive` nemají guard vlastnictví, protože nevrací ani nemění uživatelská data.
