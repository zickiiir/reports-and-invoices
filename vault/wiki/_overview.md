---
title: Přehled systému
type: overview
tags: [overview]
created: 2026-10-11
updated: 2026-10-11
status: current
---

# Přehled systému

Webová aplikace pro OSVČ/freelancery, kteří si v ní vedou vlastní výkazy práce a z nich fakturují. Next.js + tRPC + Drizzle (Postgres), přihlášení přes NextAuth, běží self-hosted v Dockeru.

Výkazy samotné leží na disku, v databázi jsou faktury, plátci, zákazníci a odvozená metadata. Volitelně se výkazy jednosměrně synchronizují do Nextcloudu. Faktury se renderují do PDF s QR platbou.

## Domény

- [[timesheet]] — surový text výkazu, parser, uložení na disk pod `DATA_DIR`, editor a import.
- [[invoicing]] — z hodin po aliasech vzniká faktura za plátce; číselná řada, PDF přes Puppeteer, QR platba.
- [[nextcloud]] — jednosměrná záloha výkazů přes WebDAV s ochranou proti SSRF a šifrovaným heslem.
- [[access]] — přihlášení, role `super_user`/`senior_programmer`/`developer`, kontrola vlastnictví v routerech, bezpečnostní invarianty ([[access-security-invariants]]).
- [[platform]] — stack, Docker a release, konfigurace, UI konvence, přehled DB ([[platform-db-schema-overview]]) a glosář.
