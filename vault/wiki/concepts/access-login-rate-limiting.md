---
title: Rate limiting loginu
type: concept
domain: access
status: current
tags: [rate-limit, login, security]
created: 2026-10-11
updated: 2026-10-11
sources: [code-inspection]
related: [access, access-authentication, access-security-invariants]
---

# Rate limiting loginu

In-memory fixed-window limiter, který se volá z přihlašování zvlášť pro e-mail a pro IP.

## The Problem It Solves

Bez limitu jde hádat hesla k jednomu účtu i „rozstřikovat“ jedno heslo přes mnoho účtů. Dva klíče pokrývají oba případy: e-mail chrání konkrétní účet i při útoku z mnoha IP, IP chrání před password sprayingem z jednoho zdroje (komentář v `src/server/auth/config.ts::authConfig`).

## How It Works

- `src/server/auth/rate-limit.ts::checkRateLimit(key, limit, windowMs)` drží `Map<string, Bucket>` v paměti procesu. Nový nebo vypršený bucket začíná na počtu 1. Při `count >= limit` vrací `false`, jinak počet zvýší.
- `authorize` v `config.ts` volá:
  - `checkRateLimit("login:email:<email>", 5, 15 * 60 * 1000)`
  - `checkRateLimit("login:ip:<ip>", 20, 15 * 60 * 1000)`
- Čísla jsem ověřil v kódu: 5 pokusů na e-mail, 20 na IP, okno 15 minut. Počítá se každý pokus (úspěšný i neúspěšný) ještě před ověřením hesla.
- Pokud selže kterýkoli z obou, `authorize` vyhodí `TooManyAttemptsError` (`code = "too_many_attempts"`). Login stránka ukáže „Příliš mnoho pokusů o přihlášení“.
- Po úspěšném loginu `resetRateLimit` smaže oba buckety.
- Úklid: `setInterval` každých 5 minut (`CLEANUP_INTERVAL_MS`, `.unref()`) maže vypršené buckety, aby mapa nerostla.
- IP: první položka `x-forwarded-for`, jinak sdílený klíč `"unknown"`.

## Implementation

- `src/server/auth/rate-limit.ts` (importuje `server-only`)
- `src/server/auth/config.ts::authConfig`, `TooManyAttemptsError`

## Trade-offs

- Stav je jen v paměti jedné instance. Po restartu kontejneru se vynuluje a při více instancích by limit nefungoval. Je to vědomé (jedna instance, žádný Redis, viz komentář v `rate-limit.ts`).
- Bez důvěryhodného reverse proxy klient hlavičku `x-forwarded-for` ovlivní. Změnou hodnoty obejde IP limit. E-mailový limit zůstane, ale kdokoli tak může účet na 15 minut zablokovat (posílá pokusy na cizí e-mail). Na tento případ kód nemá obranu. Jde o čtení kódu, netestováno.
- Úspěšný login smaže i IP bucket, takže útočník s platným účtem si IP čítač resetuje.
- Fixed window dovolí na hranici oken až dvojnásobek pokusů.

## Related Concepts

- [[access-authentication]]
- [[access-security-invariants]]
