// Writing product-specs with git rather than GitLab's commits API: the API takes the file contents as JSON, and on
// GitLab CE 19.4 a commit with the vendored hub (about 3 MB) did not finish in five minutes. git sends it as objects.
// The token reaches git through its environment (GIT_CONFIG_*), never its command line or a file.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface PushFiles {
  /** The repository as git reaches it. */
  url: string;
  /** The Authorization header for git over HTTPS; none for a path. */
  authHeader?: string;
  /** The branch to start from, and the branch to push. */
  from: string;
  to: string;
  files: Record<string, string>;
  message: string;
  author: { name: string; email: string };
  /** Replace the branch to push even when it moved: for a branch only the hub writes. */
  force?: boolean;
}

/** Returns the new commit, or null when the files are already so. */
export function pushFiles(o: PushFiles): string | null {
  const dir = mkdtempSync(join(tmpdir(), "hub-push-"));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: o.author.name,
    GIT_AUTHOR_EMAIL: o.author.email,
    GIT_COMMITTER_NAME: o.author.name,
    GIT_COMMITTER_EMAIL: o.author.email,
    ...(o.authHeader ? { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: o.authHeader } : {}),
  };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init", "-q");
    git("fetch", "-q", "--depth", "1", o.url, `refs/heads/${o.from}`);
    git("checkout", "-q", "-b", o.to, "FETCH_HEAD");
    for (const [path, text] of Object.entries(o.files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    git("add", "-A");
    if (!git("status", "--porcelain")) return null;
    git("commit", "-q", "-m", o.message);
    git("push", "-q", ...(o.force ? ["--force"] : []), o.url, `HEAD:refs/heads/${o.to}`);
    return git("rev-parse", "HEAD");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
