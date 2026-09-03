/**
 * Recognizes the period from an old timesheet filename (`prace.pl` convention), e.g.
 * `prace202607DB.txt`, `prace202607.txt`, `prace202607DB`, `prace202607` — "DB" used
 * to be the supplier's initials (distinguishing whose file it was), the extension
 * was/wasn't `.txt`. In the app the file is already scoped to the logged-in user, so
 * both are just optional "noise" we ignore — only YYYYMM matters to us.
 */
const FILENAME_RE = /^prace(\d{6})(?:[a-z]{1,4})?(?:\.[a-z0-9]+)?$/i;

export function parsePeriodFromFilename(filename: string): string | null {
  const base = filename.trim();
  const match = FILENAME_RE.exec(base);
  if (!match) return null;
  const period = match[1]!;
  const month = Number(period.slice(4, 6));
  if (month < 1 || month > 12) return null;
  return period;
}

export function suggestedFilename(period: string): string {
  return `prace${period}.txt`;
}
