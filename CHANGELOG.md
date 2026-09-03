# reports-and-invoices

## 1.0.2

### Patch Changes

- Oprava náhledu PDF (faktura i výkazy) v appce — globální bezpečnostní hlavička
  zakazující zobrazení stránky v rámci blokovala i vlastní náhled PDF v okně appky.
  Nastavení stahování souborů se nemění.

## 1.0.1

### Patch Changes

- Oprava odhlášení, po kterém appka přesměrovávala na neexistující adresu (port 3000
  místo skutečného portu, na kterém appka běží) — přesměrování teď funguje bez ohledu na
  to, na jaké adrese/portu je appka nasazená.

## 1.0.0

### Major Changes

- Základ appky na T3 stacku (Next.js, tRPC, Drizzle, NextAuth, Mantine); přihlašování
  jménem a heslem s ochranou proti hádání hesla a zjišťování existence účtů; tři role
  (super-user, senior programátor, vývojář) s tím, že senior vidí i výkazy svých
  podřízených, ale nic jiného; každý uživatel vidí a spravuje jen svoje vlastní data.
- Editor výkazů se živým přepočtem odpracovaných hodin a přesčasů; parser plně
  kompatibilní s původním Perl skriptem (včetně nové podpory pro interval přes půlnoc);
  hromadný import starých souborů výkazů s rozpoznáním období z názvu; stažení výkazu
  jako .txt nebo hromadně jako .zip.
- Správa odběratelů (aliasů z výkazu) a plátců (kdo fakturu skutečně hradí, jeden plátce
  může zastřešovat víc aliasů); založení konceptu faktury z výkazu za zvolené období s
  automatickým rozpočítáním položek; PDF faktury s QR platbou; možnost zvolit, jestli se
  faktury číslují zvlášť pro každý měsíc, nebo jednou řadou pro celý rok.
- Nastavení profilu (fakturační údaje, podpis, pravidla pro předvyplnění dat faktury,
  výchozí sazba a popis položky, cíl pracovního vytížení); správa uživatelů a rolí pro
  super-usera včetně generátoru bezpečného hesla; přizpůsobení vzhledu appky (barevný
  režim, barva appky) a editoru výkazu (klávesové zkratky, styl kurzoru).
- Automatická záloha uložených výkazů dvěma nezávislými způsoby: do lokální složky přes
  prohlížeč (Chrome/Edge), nebo na Nextcloud přes WebDAV (funguje v libovolném
  prohlížeči, heslo šifrované v klidu); před synchronizací s Nextcloudem appka ukáže
  náhled a nechá vybrat, co se má zapsat, ať nikdy nepřepíše soubor, který sama
  nevytvořila, bez výslovného potvrzení.
- Nasazení přes Docker (samostatné dev a produkční prostředí, automatické DB migrace a
  seed při startu); ochrana proti pokusům o SSRF u Nextcloud připojení; ochrana proti
  zjišťování existence účtů a hádání hesla; bezpečnostní hlavičky; žádný přímý přístup k
  souborům výkazů mimo přihlášení a autorizaci.
- Sledování verze a changelogu appky (Changesets), zobrazení aktuální verze přímo v
  appce; dokumentace pro provoz (README) i pro budoucí práci na kódu (CLAUDE.md).
