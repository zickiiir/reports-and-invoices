/**
 * TypeScript rewrite of `perl-app/prace.pl`.
 *
 * The input is a raw text work log (see `perl-app/prace202607DB.txt`):
 *  - a date line (`2.7.2026`, `6.7.` — without a year, filled in from `period`, or ISO `2026-07-02`)
 *  - a customer-alias line (a single word, e.g. `KM`, `DELUS`)
 *  - `HH:MM` time lines — the first opens an interval, the second closes it and
 *    creates an entry; the closing time also becomes the opening time for the next entry
 *  - lines starting with `-` (task description) / `--` (description sub-line)
 *  - a block between two lines containing `#TODO` is skipped, same as `#…` lines
 *
 * An unrecognized line (typically one containing spaces that doesn't match any of the
 * shapes above) ends up in `errors` as `Neznám: …` ("Unrecognized: …"), exactly like
 * the original `print "Neznám: $_\n"`.
 */

export interface TimesheetEntryRow {
  date: string; // YYYY-MM-DD
  idx: number;
  minutes: number;
  /** The first line is the task title (without the dash), the rest are sub-lines ("- …"). */
  description: string[];
}

export interface PersonTimesheet {
  alias: string;
  entries: TimesheetEntryRow[];
  totalMinutes: number;
}

export interface OvertimeDay {
  date: string;
  hours: number;
}

export interface TimesheetSummaryEntry {
  name: string;
  filepath: string;
  hours: number;
  overtime: OvertimeDay[];
}

export interface ParseTimesheetResult {
  timesheets: TimesheetSummaryEntry[];
  errors: string[];
  /** Internal detail (timesheet rows) for generating .htm files, one per alias. */
  perPerson: PersonTimesheet[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// Matches two consecutive Perl substitutions: first strips the leading dash and any
// spaces after it, then reduces any remaining double dash to a single one.
function stripDescriptionDash(raw: string): string {
  return raw.replace(/^-\s*/, "").replace(/^--/, "-");
}

/** Matches `NFD(uc($1))` + stripping combining diacritical marks. */
const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;

function normalizeAlias(raw: string): string {
  return raw.toUpperCase().normalize("NFD").replace(COMBINING_MARKS_RE, "");
}

const RE_MINUTES = /^(\d+)\s*$/;
const RE_TIME = /^\s*(\d+):(\d+)\s*$/;
const RE_DATE_DMY = /^\s*(\d+)\.(\d+)\.(\d+)\s*$/;
const RE_DATE_DM = /^\s*(\d+)\.(\d+)\.(\d+)?$/;
const RE_DATE_ISO = /^\s*(\d+)-(\d+)-(\d+)\s*$/;
const RE_DESC = /^\s*-/;
const RE_TOKEN = /^\s*(\S+)\s*$/;
const RE_TODO_MARKER = /#\s*TODO/;
const RE_COMMENT = /^\s*#/;

export function parseTimesheet(
  raw: string,
  period: string,
): ParseTimesheetResult {
  const year = period.slice(0, 4);

  const perPerson = new Map<string, PersonTimesheet>();
  const dayMinutesByAlias = new Map<string, Map<string, number>>(); // alias -> date -> minutes
  const errors: string[] = [];

  let idx = 1000;
  let todo = false;

  let kdo = "";
  let datum = "";
  let od = "";
  let co: string[] = [];

  const pushEntry = (minutes: number) => {
    if (!kdo) return; // no point recording an entry without an alias (same as in Perl, where it'd go to OUT{''})
    if (!perPerson.has(kdo)) {
      perPerson.set(kdo, { alias: kdo, entries: [], totalMinutes: 0 });
    }
    const person = perPerson.get(kdo)!;
    person.entries.push({
      date: datum,
      idx,
      minutes,
      description: [...co],
    });
    person.totalMinutes += minutes;

    if (!dayMinutesByAlias.has(kdo)) dayMinutesByAlias.set(kdo, new Map());
    const days = dayMinutesByAlias.get(kdo)!;
    days.set(datum, (days.get(datum) ?? 0) + minutes);
  };

  const lines = raw.split(/\r\n|\r|\n/);

  for (const [lineIdx, rawLine] of lines.entries()) {
    const lineNumber = lineIdx + 1;
    const line = rawLine.replace(/\s+$/, ""); // chomp equivalent (trailing whitespace)

    if (/^\s*$/.test(line)) continue; // empty line

    if (RE_TODO_MARKER.test(line)) {
      todo = !todo;
      continue;
    }
    if (todo) continue;
    if (RE_COMMENT.test(line)) continue;

    idx++;

    const timeMatch = RE_TIME.exec(line);
    const minutesOnlyMatch = !timeMatch ? RE_MINUTES.exec(line) : null;
    const dmyMatch = !timeMatch && !minutesOnlyMatch ? RE_DATE_DMY.exec(line) : null;

    if (minutesOnlyMatch && datum !== "") {
      // MINUTES — duration given directly in minutes
      pushEntry(Number(minutesOnlyMatch[1]));
      od = "";
      co = [];
    } else if (timeMatch) {
      // TIME
      const time = `${timeMatch[1]}:${timeMatch[2]}`;
      if (od !== "" && co.length > 0) {
        // Unlike the original prace.pl, we support an interval crossing midnight (e.g.
        // 22:00–1:00) — a negative difference is treated as overflowing into the next
        // day and 24h is added.
        let trvani = minutesOf(time) - minutesOf(od);
        if (trvani < 0) trvani += 24 * 60;
        pushEntry(trvani);
        od = time;
        co = [];
      } else {
        od = time;
      }
    } else if (dmyMatch) {
      // DATE d.m.yyyy
      const [, d, m, r] = dmyMatch;
      datum = `${r}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    } else if (RE_DATE_DM.test(line)) {
      // DATE d.m. (no year, filled in from period)
      const m2 = RE_DATE_DM.exec(line)!;
      const d = m2[1]!;
      const mo = m2[2]!;
      datum = `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    } else if (RE_DATE_ISO.test(line)) {
      // DATE yyyy-mm-dd
      const m3 = RE_DATE_ISO.exec(line)!;
      const [, r, m, d] = m3;
      datum = `${r}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    } else if (RE_DESC.test(line)) {
      // WHAT — description (accumulated into a single entry)
      co.push(stripDescriptionDash(line));
    } else if (RE_TOKEN.test(line)) {
      // WHO — customer alias
      kdo = normalizeAlias(RE_TOKEN.exec(line)![1]!);
    } else {
      errors.push(`Řádek ${lineNumber}: Neznám: ${line}`);
    }
  }

  const timesheets: TimesheetSummaryEntry[] = [...perPerson.values()]
    .sort((a, b) => a.alias.localeCompare(b.alias))
    .map((person) => {
      const days = dayMinutesByAlias.get(person.alias) ?? new Map<string, number>();
      const overtime: OvertimeDay[] = [...days.entries()]
        .filter(([, minutes]) => minutes / 60 > 8)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, minutes]) => ({ date, hours: round2(minutes / 60) }));

      return {
        name: person.alias,
        filepath: `${period}/Výkaz_${person.alias}_${period}.htm`,
        hours: round2(person.totalMinutes / 60),
        overtime,
      };
    });

  return {
    timesheets,
    errors,
    perPerson: [...perPerson.values()],
  };
}

/** `H:MM` format, same as `hodin()` in `prace.pl` — used in the generated .htm. */
export function formatHoursColon(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes - h * 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** The HTML body of one customer's timesheet, without the `<html>` wrapper — for
 * composing several timesheets into one document (e.g. a bulk PDF), see
 * `~/app/api/timesheets/report`. */
export function renderTimesheetBody(person: PersonTimesheet, period: string): string {
  const rows = [...person.entries]
    .sort((a, b) => (a.date === b.date ? a.idx - b.idx : a.date.localeCompare(b.date)))
    .map((entry) => {
      // Matches the Perl `$p{co}.=$r.'\n'` (one "\n" after EVERY description line,
      // including the last) + `s/\\n/<br>/g` at render time.
      const desc = entry.description.map((line) => `${line}<br>`).join("");
      return `<tr id="${entry.date}_${entry.idx}"><td>${entry.date}</td><td>${desc}</td><td>${formatHoursColon(entry.minutes)}</td></tr>`;
    })
    .join("\n");

  return `<h1>Výkaz ${person.alias} ${period}</h1><table align="left" border="1"><tr><th>Datum</th><th>Popis</th><th>Hodiny</th></tr>${rows}
<tr><td></td><td></td><td>${formatHoursColon(person.totalMinutes)}</td></tr></table>`;
}

/** An HTML timesheet for one customer — equivalent to the file `prace.pl` used to write to .htm. */
export function renderTimesheetHtml(person: PersonTimesheet, period: string): string {
  return `<html><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><body>${renderTimesheetBody(person, period)}</body></html>`;
}
