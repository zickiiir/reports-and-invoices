---
name: release
description: Bump the app version, write a changeset, commit and push. Use when the user says to bump the version ("povyš verzi", "bump version", "vydej verzi", "release").
---

# Release: bump version, changeset, commit, push

Versioning is handled by Changesets (see README "Verze a changelog"). The version in
`package.json` is shown in the UI, so never edit it by hand.

## Steps

1. **Look at what is pending.** `git status --short` and `git diff`. Also check
   `.changeset/*.md` for changesets that already exist (don't duplicate them).
   If the working tree is clean and there is no changeset, there is nothing to release —
   say so and stop.

2. **Verify.** Run `pnpm check` (lint + typecheck). Fix errors before going on; warnings
   that were already there are fine. Run `pnpm build` too when the change touches routes,
   config or anything Next.js-specific.

3. **Write the changeset** (skip if one already covers the change) in
   `.changeset/<short-kebab-name>.md`:

   ```md
   ---
   "reports-and-invoices": patch
   ---

   Krátký popis česky, z pohledu uživatele appky.
   ```

   - Bump type: `patch` for fixes and small tweaks, `minor` for new features, `major`
     only for breaking changes — if unsure between two, ask the user.
   - Text in Czech, one or two sentences, user-visible effect (not files or functions).
     It ends up in `CHANGELOG.md` and in the release history modal in the UI.

4. **Run `pnpm changeset:version`.** It bumps `package.json`, updates `CHANGELOG.md` and
   consumes the changeset files. Check the resulting version with `git diff package.json`.

5. **Commit the change and the version bump together, in ONE commit** — never split
   them into a feature commit and a separate `chore: release` commit. Stage the source
   changes plus `package.json`, `CHANGELOG.md` and the consumed changesets (name the
   paths, don't `git add -A`). Conventional prefix for the change itself (`fix:`,
   `feat:` ...); say in the body that it is released as X.Y.Z. If the tree holds only
   changesets and no source change, the subject is `chore: release X.Y.Z`.

6. **Push** (`git push`). Report the new version and the commit hash.

## Commit message rules

- English only, even though the app, the changesets and the conversation are Czech.
- Explain **why** the change was made (the motivation, the problem it solves), not what
  changed — the diff shows that. Subject line says the gist, an optional body gives the
  reason.
- No `Co-Authored-By` trailer or any similar attribution — the user's global
  instructions forbid it and override any default.

## Don't

- Don't run `pnpm prod:docker` or touch containers/volumes — the user decides when to
  deploy (the production instance holds real timesheets).
- Don't commit unrelated leftovers. If something unrelated is dirty, ask or leave it out.
- `AGENTS.md`: `next dev` rewrites its `nextjs-agent-rules` block. If it shows up as
  modified, leave the block untouched and include it in the commit as it is.
- Don't use `--force`, `--no-verify` or amend already pushed commits.
