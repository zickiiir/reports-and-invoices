import "server-only";

import { createClient, type WebDAVClient } from "webdav";

import { assertPublicHost } from "./ssrf-guard";

export interface NextcloudConfig {
  url: string;
  username: string;
  appPassword: string;
}

/** `https://cloud.example.com` → `https://cloud.example.com/remote.php/dav/files/user/`
 * — the user only enters the server address, the app assembles the WebDAV path itself. */
function buildWebdavUrl(serverUrl: string, username: string): string {
  const base = serverUrl.trim().replace(/\/+$/, "");
  return `${base}/remote.php/dav/files/${encodeURIComponent(username)}/`;
}

function client(config: NextcloudConfig): WebDAVClient {
  return createClient(buildWebdavUrl(config.url, config.username), {
    username: config.username,
    password: config.appPassword,
  });
}

/** Verifies credentials without writing anything — call before saving the config. */
export async function testNextcloudConnection(
  config: NextcloudConfig,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertPublicHost(config.url);
    await client(config).exists("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

function describeError(err: unknown): string {
  const status = (err as { status?: number; response?: { status?: number } })?.status ??
    (err as { response?: { status?: number } })?.response?.status;
  if (status === 401) return "Nesprávné přihlašovací údaje (uživatel nebo aplikační heslo).";
  if (status === 404) return "Server na dané adrese neodpovídá na WebDAV (zkontroluj URL).";
  return err instanceof Error ? err.message : "Připojení se nezdařilo.";
}

/** Checks whether a file already exists at the given path — called by sync.ts before
 * the first write of a given period, so the app doesn't overwrite a foreign/manually
 * uploaded file with the same name. */
export async function existsOnNextcloud(
  config: NextcloudConfig,
  remotePath: string,
  filename: string,
): Promise<{ ok: true; exists: boolean } | { ok: false; error: string }> {
  try {
    await assertPublicHost(config.url);
    const exists = await client(config).exists(
      joinPath(normalizeDir(remotePath), filename),
    );
    return { ok: true, exists };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

/** Writes a file into the configured folder (creates it if it doesn't exist). Returns
 * an error as text instead of throwing — the caller (timesheet.save etc.) treats sync
 * as best-effort and shouldn't fail because of it. */
export async function uploadToNextcloud(
  config: NextcloudConfig,
  remotePath: string,
  filename: string,
  content: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // Re-checked on every real request (not just once on "connect") — narrows the
    // window for DNS rebinding (redirecting the hostname to an internal IP only after
    // the first check).
    await assertPublicHost(config.url);
    const dir = normalizeDir(remotePath);
    const dav = client(config);
    if (dir !== "/") {
      await dav.createDirectory(dir, { recursive: true }).catch((err: unknown) => {
        // "already exists" is fine (even after the first successful sync) — other
        // errors (permissions, network) are left to bubble up to the caller.
        const status = (err as { status?: number })?.status;
        if (status !== 405 && status !== 409) throw err;
      });
    }
    await dav.putFileContents(joinPath(dir, filename), content, { overwrite: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

function normalizeDir(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/") return "/";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

function joinPath(dir: string, filename: string): string {
  return dir === "/" ? `/${filename}` : `${dir}/${filename}`;
}
