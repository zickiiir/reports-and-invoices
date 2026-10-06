export interface ChangelogRelease {
  version: string;
  /** Markdown of the release's notes (the `### Patch Changes` etc. sections). */
  body: string;
}

const RELEASE_HEADING = /^## +(\S+)\s*$/m;

/** Splits a Changesets-generated CHANGELOG.md into releases, newest first (the order
 * Changesets writes them in). Anything before the first `## <version>` heading (the
 * `# package-name` title) is dropped. */
export function parseChangelog(markdown: string): ChangelogRelease[] {
  const parts = markdown.replace(/\r\n?/g, "\n").split(RELEASE_HEADING);
  // split() with a capture group yields [preamble, version, body, version, body, ...].
  const releases: ChangelogRelease[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    releases.push({ version: parts[i]!, body: (parts[i + 1] ?? "").trim() });
  }
  return releases;
}
