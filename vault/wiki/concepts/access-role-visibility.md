---
title: Role a viditelnost dat (autorizace v routerech)
type: concept
domain: access
status: current
tags: [authorization, roles, idor, trpc]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [access, access-authentication, access-users-and-roles, access-user-administration, access-security-invariants]
---

# Role a viditelnost dat (autorizace v routerech)

`protectedProcedure` ověří jen přihlášení. Vlastnictví a roli musí zkontrolovat každá procedura sama pomocí guardů z `src/server/access/visibility.ts`.

## The Problem It Solves

Data patří uživateli (`userId` na `payers`, `customers`, `invoices`, soubory výkazů). Role určují, kdo smí číst nebo měnit cizí data. Nový endpoint bez guardu je potenciální IDOR.

## How It Works

Role (`src/server/db/schema.ts::userRoleEnum`):

- `super_user` — čte i zapisuje všechno.
- `senior_programmer` — vlastní data plus čtení výkazů podřízených (`users.managerId` = jeho id).
- `developer` — jen vlastní data.

Guardy (`src/server/access/visibility.ts`):

| Guard | Chování |
|---|---|
| `getReadableTimesheetUserIds(caller)` | `"all"` pro super_user, `[id]` pro developera, `[id, ...podřízení]` pro seniora (dotaz na `users.managerId`) |
| `canReadTimesheet` / `assertCanReadTimesheet(caller, targetUserId)` | povolí sebe, super_user, nebo seniora, pokud `target.managerId === caller.id`; jinak `FORBIDDEN` |
| `assertOwnerOrSuperUser(caller, ownerId)` | zápis a správa: super_user nebo `caller.id === ownerId`; jinak `FORBIDDEN` |
| `assertSuperUser(caller)` | jen super_user; jinak `FORBIDDEN` |

`CallerIdentity` (`{ id, role }`) se bere z `ctx.session.user`, tedy z JWT ([[access-authentication]]).

## Implementation: procedura → guard

Všechny routery v `src/server/api/root.ts::appRouter` používají `protectedProcedure`. „self“ = procedura pracuje vždy s `ctx.session.user.id` a vstup nemá `userId`.

| Router.procedura | Guard / ochrana |
|---|---|
| `user.me` | self |
| `user.updateProfile`, `updateDateRules`, `updateInvoiceNumberingScope`, `updateLineItemTemplate`, `updateDefaultHourlyRate`, `updateEditorPreferences`, `updateColorScheme`, `updatePrimaryColor`, `updateWorkloadSettings`, `changePassword` | self |
| `user.list`, `user.create`, `user.updateRoleAndManager` | `assertSuperUser` |
| `payer.list` | `assertOwnerOrSuperUser(input.userId ?? self)` |
| `payer.get`, `payer.update`, `payer.setArchived` | načtení řádku, `assertOwnerOrSuperUser(row.userId)` |
| `payer.create` | self (`userId` se bere ze session) |
| `customer.list` | `assertOwnerOrSuperUser(input.userId ?? self)` |
| `customer.get`, `customer.update`, `customer.setArchived` | `assertOwnerOrSuperUser(row.userId)` |
| `customer.create` | `assertOwnerOrSuperUser(payer.userId)`, zápis s `userId` ze session |
| `timesheet.visibleUsers` | `getReadableTimesheetUserIds` (vrací jen `id`, `name`, `role`) |
| `timesheet.listPeriods`, `timesheet.read` | `assertCanReadTimesheet(input.userId ?? self)` |
| `timesheet.save`, `timesheet.importBatch` | `assertOwnerOrSuperUser(input.userId ?? self)` |
| `timesheet.parseLive` | jen přihlášení; čistá funkce nad vstupem, nesahá na data |
| `invoice.list` | `assertOwnerOrSuperUser(input.userId ?? self)` |
| `invoice.get`, `update`, `delete` | `assertOwnerOrSuperUser(invoice.userId)` |
| `invoice.previewNumber`, `invoice.createDraft` | `assertOwnerOrSuperUser(payer.userId)` |
| `invoice.numberSequence`, `invoice.setNumberSequence` | self |
| `nextcloud.status`, `connect`, `disconnect`, `previewSync`, `syncSelected` | self |
| `meta.changelog` | jen přihlášení (záměrně, data nejsou uživatelská, komentář v `meta.ts`) |

Route handlery mimo tRPC:

| Route | Guard |
|---|---|
| `GET /api/timesheets/download` | `auth()` → 401, `assertCanReadTimesheet` → 403 |
| `GET /api/timesheets/report` | `auth()` → 401, `assertCanReadTimesheet` → 403 |
| `GET /api/invoices/[id]/pdf` | `auth()` → 401, `assertOwnerOrSuperUser(invoice.userId)` → 403 |
| `/api/auth/*` | veřejné (NextAuth) |

Stránka `src/app/(app)/admin/users/page.tsx` navíc přesměruje ne-super_usera na `/`, ale skutečná ochrana je v procedurách.

## Nálezy (faktický stav kódu, neopraveno)

1. **`customer.update` nekontroluje nový `payerId`.** Vstup je `customerInput.partial()` včetně `payerId`. Guard ověří jen vlastnictví odběratele, ne plátce, na kterého se přepojuje. Uživatel, který zná UUID cizího plátce, přiváže svého odběratele k cizímu plátci. `customer.list`/`customer.get` pak vrací `with: { payer: true }`, tedy údaje cizího plátce (název, adresa, IČ, DIČ). `invoice.createDraft` navíc vybírá odběratele jen podle `payerId`, takže cizí alias se může objevit v konceptu faktury vlastníka plátce. UUID v4 je těžko uhodnout, to snižuje, ale neruší dopad. `customer.create` plátce kontroluje, `update` ne.
2. **Zastaralá role v JWT.** `role` a `managerId` se zapisují do tokenu jen při přihlášení (`config.ts::authConfig` callback `jwt`). Guardy berou `caller.role` z tokenu. Degradovaný senior si drží čtení výkazů podřízených (jejich seznam se čte z DB podle `caller.id`), dokud token nevyprší nebo se nepřihlásí znovu. Povýšení se naopak neprojeví.
3. **`user.updateRoleAndManager` nevaliduje cíl.** Zakáže jen `id === managerId`. Server nekontroluje, že nadřízený je senior/super_user, ani cyklus. Super_user smí změnit roli sám sobě (UI to u vlastního řádku blokuje, server ne), takže může odebrat poslednímu super_userovi roli.
4. **`user.me` vrací celý řádek kromě `passwordHash`**, tedy i `nextcloudAppPasswordEnc` (šifrovaný, viz [[nextcloud-password-encryption]]) do prohlížeče.
5. **`user.changePassword` nevyžaduje staré heslo** a nerozbíjí existující tokeny.
6. `visibility.ts::assertCanReadTimesheet` má v komentáři „Throws UNAUTHORIZED“, kód vyhazuje `FORBIDDEN`.

## Trade-offs

- Žádná centrální vynucená autorizace: spoléhá se na disciplínu při psaní routerů. Chybějící guard nezachytí typecheck ani test (testy pokrývají hlavně parser).
- Super_user má plný zápis do dat všech uživatelů přes `input.userId`.

## Related Concepts

- [[access-authentication]]
- [[access-users-and-roles]]
- [[access-user-administration]]
- [[access-security-invariants]]
- [[timesheet-disk-storage]] — cesty k souborům výkazů, kam míří `assertCanReadTimesheet`
