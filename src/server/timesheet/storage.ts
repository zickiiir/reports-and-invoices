import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "~/env";
import { suggestedFilename } from "./filename";
import {
  parseTimesheet,
  renderTimesheetHtml,
  type ParseTimesheetResult,
} from "./parse";

const PERIOD_RE = /^\d{6}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lazy evaluation (not a top-level constant) — the module also gets imported just for
// its types (the tRPC router graph), and the build (`next build`) might not have
// `env.DATA_DIR` available (SKIP_ENV_VALIDATION also skips the zod schema's defaults).
function getDataRoot(): string {
  return path.resolve(process.cwd(), env.DATA_DIR);
}

function assertSafeUserId(userId: string) {
  if (!UUID_RE.test(userId)) {
    throw new Error(`Neplatné userId pro přístup k souborům výkazů: ${userId}`);
  }
}

function assertSafePeriod(period: string) {
  if (!PERIOD_RE.test(period)) {
    throw new Error(`Neplatné období (očekáváno YYYYMM): ${period}`);
  }
}

function userRoot(userId: string): string {
  assertSafeUserId(userId);
  return path.join(getDataRoot(), userId);
}

function periodDir(userId: string, period: string): string {
  assertSafePeriod(period);
  return path.join(userRoot(userId), period);
}

function rawFilePath(userId: string, period: string): string {
  return path.join(periodDir(userId, period), suggestedFilename(period));
}

/** Returns the list of periods (YYYYMM) the user has a timesheet file for, descending. */
export async function listPeriods(userId: string): Promise<string[]> {
  const root = userRoot(userId);
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && PERIOD_RE.test(e.name))
      .map((e) => e.name)
      .sort((a, b) => b.localeCompare(a));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** Reads the raw timesheet content (an empty string if it doesn't exist yet). */
export async function readTimesheetRaw(
  userId: string,
  period: string,
): Promise<string> {
  try {
    return await readFile(rawFilePath(userId, period), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

export async function timesheetExists(
  userId: string,
  period: string,
): Promise<boolean> {
  try {
    await stat(rawFilePath(userId, period));
    return true;
  } catch {
    return false;
  }
}

/**
 * Saves the raw timesheet content to disk and regenerates the derived .htm files for
 * each customer (equivalent to `prace.pl -d`). Returns the parse result for immediate
 * display in the UI.
 */
export async function saveTimesheet(
  userId: string,
  period: string,
  content: string,
): Promise<ParseTimesheetResult> {
  const dir = periodDir(userId, period);
  await mkdir(dir, { recursive: true });
  await writeFile(rawFilePath(userId, period), content, "utf-8");

  const result = parseTimesheet(content, period);
  for (const person of result.perPerson) {
    const html = renderTimesheetHtml(person, period);
    const filename = `Výkaz_${person.alias}_${period}.htm`;
    await writeFile(path.join(dir, filename), html, "utf-8");
  }
  return result;
}

/** Just parses the content without saving — for a live hours preview while typing in the editor. */
export function parseTimesheetLive(
  content: string,
  period: string,
): ParseTimesheetResult {
  return parseTimesheet(content, period);
}
