---
title: Nextcloud SSRF guard
type: concept
domain: nextcloud
status: current
tags: [security, ssrf, dns, nextcloud]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [nextcloud, nextcloud-webdav-client, access-security-invariants, nextcloud-password-encryption]
---

# Nextcloud SSRF guard

`assertPublicHost` odmítne adresu serveru, která se překládá na loopback, privátní nebo link-local IP.

## The Problem It Solves

URL Nextcloudu zadává nízko-důvěryhodný přihlášený uživatel a server na ni posílá requesty. Bez kontroly by šla appka zneužít jako SSRF proxy na interní Docker síť (např. službu `db`) nebo cloud metadata (169.254.169.254) — viz komentář v `src/server/nextcloud/ssrf-guard.ts::assertPublicHost`.

## How It Works

`assertPublicHost(rawUrl)` postupně:

1. Rozparsuje URL (`new URL`), jinak chyba "Neplatná URL adresa."
2. Povolí jen protokoly `http:` a `https:`.
3. Odstraní `[]` z IPv6 literálu a odmítne hostname `localhost`.
4. Přeloží hostname přes `dns.promises.lookup(..., { all: true })`. Selhání nebo prázdný výsledek je chyba "nepodařilo se přeložit (DNS)".
5. Zkontroluje všechny vrácené adresy. Stačí jedna privátní a celý požadavek se zamítne.

Rozsahy:

- IPv4 (`isPrivateOrReservedIpv4`): `10/8`, `127/8`, `169.254/16`, `172.16/12`, `192.168/16`, `0/8` a vše od `224` výš (multicast, rezervované).
- IPv6 (`isPrivateOrReservedIpv6`): `::1`, `::`, `fe80:` (link-local), `fc`/`fd` (ULA) a IPv4-mapped `::ffff:a.b.c.d` (zkontroluje se vložená IPv4).

## Why Resolve-Based

Kontrola řetězce hostname nestačí, protože DNS může libovolné jméno namířit na interní adresu. Kód proto porovnává výsledné IP (komentář: "We check the resolved IP, not just the hostname string"). CLAUDE.md výslovně zakazuje tuto logiku měnit na string matching.

## Implementation

- Volá se z `src/server/nextcloud/client.ts::testNextcloudConnection`, `existsOnNextcloud` a `uploadToNextcloud` — při každém reálném requestu, ne jen při připojení. Komentář v `uploadToNextcloud` uvádí účel: zúžit okno pro DNS rebinding (hostname přesměrovaný na interní IP až po první kontrole).
- Router `connect` volá guard nepřímo přes `testNextcloudConnection`, takže nevalidní URL se neuloží.
- Modul má `import "server-only"`.
- Obecný přehled invariantů: [[access-security-invariants]]. Klient: [[nextcloud-webdav-client]].

## Trade-offs

Guard není úplná obrana. Z kódu plyne:

- Kontrola a vlastní HTTP spojení jsou dva samostatné DNS dotazy (`lookup` v guardu, resolve uvnitř knihovny `webdav`). Mezi nimi je okno pro rebinding. Opakování kontroly ho jen zužuje, nezavírá.
- Nepokryté rozsahy: `100.64.0.0/10` (CGNAT), `192.0.0.0/24`, `198.18.0.0/15` a podobné nejsou v `isPrivateOrReservedIpv4`. `fec0::/10` a IPv4-mapped adresa v hexadecimálním tvaru (`::ffff:7f00:1`) nejsou v `isPrivateOrReservedIpv6`. Zda je `lookup` takto vrátí, v kódu ověřit nejde.
- Kontrola se týká jen `config.url`. Zda knihovna `webdav` následuje přesměrování na jiný host, kód neřeší (neověřeno).
- Chybové zprávy rozlišují "localhost/interní síť" a "DNS", takže uživatel může pomocí `connect` zjišťovat, zda jméno existuje a zda míří dovnitř. Je to malý únik informace.

## Related Concepts

- [[nextcloud-password-encryption]] — druhá ochrana v téže doméně
- [[nextcloud]] — landing page
