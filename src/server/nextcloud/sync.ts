import "server-only";

import { eq } from "drizzle-orm";

import { db } from "~/server/db";
import { users } from "~/server/db/schema";
import { listPeriods, readTimesheetRaw } from "~/server/timesheet/storage";
import { suggestedFilename } from "~/server/timesheet/filename";

import { decryptSecret } from "./crypto";
import { existsOnNextcloud, uploadToNextcloud, type NextcloudConfig } from "./client";

interface StoredNextcloudConfig extends NextcloudConfig {
  remotePath: string;
  syncedPeriods: Set<string>;
}

async function getConfigForUser(userId: string): Promise<StoredNextcloudConfig | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      nextcloudUrl: true,
      nextcloudUsername: true,
      nextcloudAppPasswordEnc: true,
      nextcloudRemotePath: true,
      nextcloudSyncedPeriods: true,
    },
  });
  if (!user?.nextcloudUrl || !user.nextcloudUsername || !user.nextcloudAppPasswordEnc) {
    return null;
  }
  return {
    url: user.nextcloudUrl,
    username: user.nextcloudUsername,
    appPassword: decryptSecret(user.nextcloudAppPasswordEnc),
    remotePath: user.nextcloudRemotePath ?? "/Vykazy",
    syncedPeriods: new Set(user.nextcloudSyncedPeriods ?? []),
  };
}

/** Writes newly confirmed periods back into "nextcloudSyncedPeriods" — merges with
 * whatever another concurrent sync might have added in the meantime, so nothing gets lost. */
async function markPeriodsSynced(userId: string, newlySynced: string[]): Promise<void> {
  if (newlySynced.length === 0) return;
  const current = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { nextcloudSyncedPeriods: true },
  });
  const merged = new Set([...(current?.nextcloudSyncedPeriods ?? []), ...newlySynced]);
  await db
    .update(users)
    .set({ nextcloudSyncedPeriods: [...merged] })
    .where(eq(users.id, userId));
}

type UploadOutcome = "synced" | "conflict" | "failed";
export type NextcloudSyncOutcome = UploadOutcome | "not-configured";

/**
 * Uploads a single period — if the app has never written it to this path before, it
 * first checks via WebDAV whether the file already exists (so it doesn't overwrite a
 * foreign/manually uploaded file with the same name). Once the app successfully
 * writes it once, it treats the path as "its own" and overwrites it without asking
 * from then on (regular ongoing sync).
 */
async function uploadPeriod(
  config: StoredNextcloudConfig,
  period: string,
  content: string,
): Promise<UploadOutcome> {
  const filename = suggestedFilename(period);
  if (!config.syncedPeriods.has(period)) {
    const check = await existsOnNextcloud(config, config.remotePath, filename);
    if (!check.ok) return "failed";
    if (check.exists) return "conflict";
  }
  const result = await uploadToNextcloud(config, config.remotePath, filename, content);
  return result.ok ? "synced" : "failed";
}

/**
 * Best-effort write of a single timesheet to Nextcloud, if the user has it set up —
 * called from timesheet.save/importBatch after a successful save. Never throws (a
 * sync failure shouldn't fail the timesheet save, same as with the local folder) — the
 * caller instead gets the result back in the mutation's output and can flag it via a
 * notification.
 */
export async function syncTimesheetToNextcloud(
  userId: string,
  period: string,
  content: string,
): Promise<NextcloudSyncOutcome> {
  try {
    const config = await getConfigForUser(userId);
    if (!config) return "not-configured";
    const outcome = await uploadPeriod(config, period, content);
    if (outcome === "synced" && !config.syncedPeriods.has(period)) {
      await markPeriodsSynced(userId, [period]);
    }
    return outcome;
  } catch {
    return "failed";
  }
}

export interface SyncPreviewRow {
  period: string;
  filename: string;
  /** "new" = safe to write, "known" = the app already wrote it here before (a regular
   * overwrite), "conflict" = there's a file at the path the app didn't create, "error"
   * = couldn't determine the state (network/permissions) — neither of the last two
   * gets written without the user's explicit choice. */
  status: "new" | "known" | "conflict" | "error";
}

/**
 * A read-only overview before the actual sync (see NextcloudSyncModal) — for each
 * local period, determines whether a write would be safe, would conflict, or is a
 * path already written by the app before. Writes nothing.
 */
export async function previewNextcloudSync(userId: string): Promise<SyncPreviewRow[] | null> {
  const config = await getConfigForUser(userId);
  if (!config) return null;

  const periods = await listPeriods(userId);
  const rows: SyncPreviewRow[] = [];
  for (const period of periods) {
    const filename = suggestedFilename(period);
    if (config.syncedPeriods.has(period)) {
      rows.push({ period, filename, status: "known" });
      continue;
    }
    const check = await existsOnNextcloud(config, config.remotePath, filename);
    if (!check.ok) {
      rows.push({ period, filename, status: "error" });
    } else {
      rows.push({ period, filename, status: check.exists ? "conflict" : "new" });
    }
  }
  return rows;
}

/**
 * Writes exactly the periods the user explicitly selected in NextcloudSyncModal
 * (including any conflicts they consciously chose to overwrite) — without re-checking
 * existence, the user already saw that in the preview.
 */
export async function syncSelectedPeriodsToNextcloud(
  userId: string,
  periods: string[],
): Promise<{ synced: number; failed: number }> {
  const config = await getConfigForUser(userId);
  if (!config) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const newlySynced: string[] = [];

  for (const period of periods) {
    const content = await readTimesheetRaw(userId, period);
    const result = await uploadToNextcloud(
      config,
      config.remotePath,
      suggestedFilename(period),
      content,
    );
    if (result.ok) {
      synced++;
      if (!config.syncedPeriods.has(period)) newlySynced.push(period);
    } else {
      failed++;
    }
  }

  await markPeriodsSynced(userId, newlySynced);
  return { synced, failed };
}
