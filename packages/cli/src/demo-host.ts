// The demo's stand-in for the git host. The demo repository gets a bare remote as origin; after a save is pushed,
// this runs hub-guard on the branch exactly as the CI job would, then merges it into main (merge when the pipeline
// succeeds) or records the refusal in hub-state and deletes the branch. Then it brings the demo checkout up to date.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { refusalPath } from "@sdlc-hub/core";
import type { Save } from "@sdlc-hub/save";
import { guardRepo } from "./guard.ts";
import { writeHubState } from "./hub-state.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }).trim();

/** Gives the demo checkout a bare remote as origin, next to it. */
export function addDemoRemote(root: string): string {
  const remote = join(dirname(root), "remote.git");
  git(dirname(root), "clone", "-q", "--bare", root, remote);
  git(root, "remote", "add", "origin", remote);
  git(root, "fetch", "-q", "origin");
  git(root, "branch", "-q", "--set-upstream-to=origin/main", "main");
  return remote;
}

export interface DemoHost {
  afterPush(save: Save): void;
  /** Resolves when every judged save is settled; for tests. */
  idle(): Promise<void>;
}

export function demoHost(o: { root: string; remote: string; delayMs?: number; onSettled?: () => void; now?: () => string }): DemoHost {
  let queue = Promise.resolve();
  const now = o.now ?? (() => new Date().toISOString().replace(/\.\d+Z$/, "Z"));

  function judge(save: Save) {
    git(o.root, "fetch", "-q", "origin");
    const main = "refs/remotes/origin/main";
    const base = git(o.root, "merge-base", main, save.sha);
    const r = guardRepo({ cwd: o.root, baseSha: base, head: save.sha, rulesRef: main, author: save.user, pushers: [save.user] });
    if (r.ok) {
      const wt = mkdtempSync(join(tmpdir(), "hub-demo-merge-"));
      try {
        git(o.root, "worktree", "add", "-q", "--detach", "-f", wt, main);
        const env = { GIT_AUTHOR_NAME: save.user, GIT_AUTHOR_EMAIL: `${save.user}@example.com`, GIT_COMMITTER_NAME: save.user, GIT_COMMITTER_EMAIL: `${save.user}@example.com` };
        execFileSync("git", ["merge", "-q", "--no-ff", "-m", `Merge branch '${save.branch}' into 'main'\n\n${save.title}`, save.sha], { cwd: wt, env: { ...process.env, ...env }, stdio: "pipe" });
        git(wt, "push", "-q", "origin", "HEAD:refs/heads/main", `:refs/heads/${save.branch}`);
      } finally {
        execFileSync("git", ["worktree", "remove", "--force", wt], { cwd: o.root, stdio: "ignore" });
        rmSync(wt, { recursive: true, force: true });
      }
      git(o.root, "fetch", "-q", "origin");
      // The demo checkout has no edits of its own: bring it to main, as hub sync would.
      git(o.root, "merge", "-q", "--ff-only", main);
    } else {
      writeHubState({
        url: o.remote,
        message: `hub-guard: refused ${save.branch}`,
        edit(dir) {
          const path = join(dir, refusalPath(save.branch));
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, JSON.stringify({ branch: save.branch, author: save.user, sha: save.sha, at: now(), findings: r.findings }, null, 2) + "\n");
          return true;
        },
      });
      git(o.root, "push", "-q", "origin", "--delete", save.branch);
      git(o.root, "fetch", "-q", "origin");
    }
    o.onSettled?.();
  }

  return {
    afterPush(save) {
      queue = queue.then(
        () =>
          new Promise<void>((resolve) =>
            setTimeout(() => {
              try {
                judge(save);
              } catch (e) {
                console.error(`demo host: ${(e as Error).message}`);
              }
              resolve();
            }, o.delayMs ?? 1500),
          ),
      );
    },
    idle: () => queue,
  };
}
