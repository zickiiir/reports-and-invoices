/**
 * Shared between admin user creation (users-admin-table.tsx) and the user's own
 * password change (settings-form.tsx) — must match `passwordPolicySchema` in
 * `server/api/routers/user.ts`, where the same rules are enforced server-side too.
 */
export const PASSWORD_CHECKS: { label: string; test: (pw: string) => boolean }[] = [
  { label: "Alespoň 8 znaků", test: (pw) => pw.length >= 8 },
  { label: "Alespoň 1 číslice", test: (pw) => /\d/.test(pw) },
  { label: "Alespoň 1 velké písmeno", test: (pw) => /[A-Z]/.test(pw) },
  { label: "Alespoň 1 speciální znak", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

/** Random password that always satisfies every `PASSWORD_CHECKS` rule. */
export function generatePassword(length = 14): string {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const special = "!@#$%^&*-_=+?";
  const all = lower + upper + digits + special;
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)]!;

  const chars = [pick(lower), pick(upper), pick(digits), pick(special)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
