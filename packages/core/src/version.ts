// The hub's version. It is written to hub/package.json at install and upgrade; a site whose code is older than the
// hub on main turns read only, so nobody saves with rules older than the ones the guard applies. Raise it with each
// release that changes hub/.

export const HUB_VERSION = "0.6.0";

/** -1, 0 or 1, by major, minor and patch; anything that is not a version counts as 0.0.0. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => (/^(\d+)\.(\d+)\.(\d+)/.exec(v) ?? [, "0", "0", "0"]).slice(1).map(Number);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i]! !== y[i]!) return x[i]! < y[i]! ? -1 : 1;
  return 0;
}

/** hub/package.json: Node loads hub/cli.js as an ES module, and the version says which hub this is. */
export const hubPackageJson = (version = HUB_VERSION) => `{ "private": true, "type": "module", "version": "${version}" }\n`;

/** The version in a hub/package.json, or null for one written before versions. */
export function hubVersionOf(packageJson: string | undefined): string | null {
  try {
    const v = (JSON.parse(packageJson ?? "") as { version?: unknown }).version;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}
