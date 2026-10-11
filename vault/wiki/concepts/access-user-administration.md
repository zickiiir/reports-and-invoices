---
title: Správa uživatelů a profilu
type: concept
domain: access
status: current
tags: [admin, users, passwords, settings]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [access, access-users-and-roles, access-role-visibility, access-authentication]
---

# Správa uživatelů a profilu

Účty zakládá a role mění jen `super_user` na `/admin/users`. Každý uživatel si spravuje svůj profil a heslo v `/settings`.

## The Problem It Solves

Appka nemá registraci. Jediný způsob, jak vznikne účet, je admin. Ostatní nastavení (fakturační profil, vzhled, editor) patří vlastníkovi účtu.

## How It Works

### Administrace (`/admin/users`)

- Stránka `src/app/(app)/admin/users/page.tsx::AdminUsersPage` volá `api.user.me()` a při jiné roli než `super_user` přesměruje na `/`.
- `users-admin-table.tsx::UsersAdminTable` ukazuje tabulku (jméno, e-mail, role, nadřízený). Změna role nebo nadřízeného se ukládá hned po výběru (`user.updateRoleAndManager`). Vlastní řádek má výběr role zablokovaný jen v UI. Výběr nadřízeného se zobrazí jen u role `developer`, nabídka obsahuje `senior_programmer` a `super_user`. Při změně role na jinou než `developer` UI pošle `managerId: null`.
- „Nový uživatel“ volá `user.create` (jméno, příjmení, e-mail, heslo, role, volitelný nadřízený). Server nastaví `name` jako `firstName lastName`, e-mail převede na malá písmena, uloží bcrypt hash a `invoiceDateRules: defaultInvoiceDateRules`. Uživatel si pak může `name` přepsat (např. na firmu).
- Všechny tři procedury (`list`, `create`, `updateRoleAndManager`) začínají `assertSuperUser` ([[access-role-visibility]]).

### Politika hesel

Pravidla: alespoň 8 znaků, 1 číslice, 1 velké písmeno, 1 speciální znak.

- Server: `src/server/api/routers/user.ts::passwordPolicySchema` (zod). Platí pro `user.create` i `user.changePassword`. Komentář v souboru uvádí, že samotná klientská kontrola nestačila (slabé heslo šlo poslat přes tRPC).
- Klient: `src/lib/password-policy.ts::PASSWORD_CHECKS` (stejná pravidla, zobrazená jako checklist) a `generatePassword(length = 14)`. Generátor zaručí všechny čtyři třídy znaků a používá `Math.random`, ne kryptografický generátor.
- Kód drží pravidla na dvou místech (server a klient) a musí se měnit společně.

### Nastavení vlastního profilu (`/settings`)

`src/app/(app)/settings/settings-form.tsx::SettingsForm` je sada samostatných karet. Každá má vlastní tlačítko a vlastní mutaci:

- Fakturační profil → `user.updateProfile` („Uložit profil“). Klient validuje PSČ, IČ, DIČ, účet, kód banky. Server validuje jen `profileSchema` (povinné `name`, e-mail, a pro `signatureImageUrl` regex na `data:image/(png|jpe?g|gif|webp);base64,` s limitem 4 000 000 znaků).
- Pravidla dat faktury, šablona popisu, základní sazba, pracovní nasazení, číslování faktur → samostatné mutace s tlačítkem „Uložit“.
- Vzhled → „Uložit vzhled“ (`updateColorScheme` + `updatePrimaryColor`). Změna barvy ve výběru se v UI projeví hned (Mantine stav), do DB jde až po uložení.
- Změna hesla → `user.changePassword` (nové heslo + potvrzení, bez zadání starého).
- Nextcloud → `nextcloud.connect` / `disconnect` ([[nextcloud-password-encryption]]).
- Editor výkazů (zkratky, kurzor, čísla řádků) se ukládá jednou mutací `user.updateEditorPreferences` z `timesheet-editor.tsx`.

Výjimka z pravidla „ukládá se tlačítkem“: nahrání podpisu v kartě „Podpis“ volá `updateSignature` (`user.updateProfile`) hned po dropu souboru, s aktuálními hodnotami formuláře profilu. Rozpracované neuložené změny profilu se tak uloží spolu s podpisem.

## Implementation

- `src/server/api/routers/user.ts::userRouter`
- `src/app/(app)/admin/users/users-admin-table.tsx`
- `src/app/(app)/settings/settings-form.tsx`
- `src/lib/password-policy.ts`

## Trade-offs

- Žádná procedura neumí uživatele smazat, deaktivovat ani resetovat cizí heslo. Super_user heslo jen nastaví při založení.
- Validace role/nadřízeného na serveru je minimální (viz nálezy v [[access-role-visibility]]).

## Related Concepts

- [[access-users-and-roles]] — sloupce tabulky
- [[access-authentication]] — přihlášení
- [[access-role-visibility]]
