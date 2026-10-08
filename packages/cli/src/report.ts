// hub report: run by the hub-report CI job in a team repository. It builds the team's snapshot of each feature and
// publishes it to hub-state of product-specs. Git gets its credentials from the environment the job sets up.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildTeamSnapshot, parseTeamSnapshot, type TeamSnapshot } from "@sdlc-hub/core";
import { workingTreeSource } from "@sdlc-hub/git";

export interface ReportOptions {
  team: string;
  /** The team repository checkout. */
  cwd: string;
  /** product-specs, as git reaches it. */
  specsUrl: string;
  push: boolean;
  /** GitLab CI variables: CI_COMMIT_REF_NAME, CI_COMMIT_SHA, CI_OPEN_MERGE_REQUESTS. */
  env: Record<string, string | undefined>;
  now: string;
}

export interface ReportResult {
  slugs: string[];
  snapshots: TeamSnapshot[];
  pushed: boolean;
}

/** The features to report: the one of a feat/<slug> branch, or every feature folder on other branches. */
function slugsOf(cwd: string, branch: string | undefined): string[] {
  const dir = join(cwd, "docs/features");
  const all = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  const m = /^feat\/([a-z0-9][a-z0-9-]*)$/.exec(branch ?? "");
  return m ? all.filter((s) => s === m[1]) : all;
}

/** The open merge request of this branch, from CI_OPEN_MERGE_REQUESTS ("group/project!12,..."). */
function mrOf(env: ReportOptions["env"]): TeamSnapshot["mr"] {
  const first = env.CI_OPEN_MERGE_REQUESTS?.split(",")[0];
  const iid = first ? Number(first.split("!")[1]) : NaN;
  return Number.isInteger(iid) ? { iid, state: "opened" } : null;
}

const withoutTime = (s: string) => {
  try {
    const { generated_at: _t, ...rest } = JSON.parse(s) as Record<string, unknown>;
    return JSON.stringify(rest);
  } catch {
    return s;
  }
};

export function report(o: ReportOptions): ReportResult {
  const source = workingTreeSource(o.cwd);
  const slugs = slugsOf(o.cwd, o.env.CI_COMMIT_REF_NAME);
  const snapshots: TeamSnapshot[] = [];
  for (const slug of slugs) {
    const r = buildTeamSnapshot({ team: o.team, slug, source, commit: o.env.CI_COMMIT_SHA ?? null, now: o.now, mr: mrOf(o.env) });
    // Never publish a record the site would ignore.
    const check = parseTeamSnapshot(JSON.stringify(r.value), "snapshot");
    if (!check.value) throw new Error(`The snapshot of ${slug} is not valid: ${check.issues.map((i) => i.message).join("; ")}`);
    snapshots.push(check.value);
  }
  if (!o.push || !snapshots.length) return { slugs, snapshots, pushed: false };

  // Someone else may push between our fetch and push: try again from a fresh copy.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const dir = mkdtempSync(join(tmpdir(), "hub-report-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe", env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: o.env.GITLAB_USER_NAME ?? "hub-report", GIT_AUTHOR_EMAIL: o.env.GITLAB_USER_EMAIL ?? "hub-report@localhost", GIT_COMMITTER_NAME: "hub-report", GIT_COMMITTER_EMAIL: "hub-report@localhost" } }).toString();
    try {
      git("init", "-q");
      git("fetch", "-q", "--depth", "1", o.specsUrl, "hub-state");
      git("checkout", "-q", "-B", "hub-state", "FETCH_HEAD");
      let changed = false;
      for (const s of snapshots) {
        const path = join(dir, "features", s.slug, "teams", `${o.team}.json`);
        const text = JSON.stringify(s, null, 2) + "\n";
        if (existsSync(path) && withoutTime(readFileSync(path, "utf8")) === withoutTime(text)) continue;
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, text);
        changed = true;
      }
      if (!changed) return { slugs, snapshots, pushed: false };
      git("add", "-A");
      git("commit", "-q", "-m", `hub-report: ${o.team} (${snapshots.map((s) => s.slug).join(", ")})`);
      try {
        git("push", "-q", o.specsUrl, "HEAD:refs/heads/hub-state");
        return { slugs, snapshots, pushed: true };
      } catch (e) {
        if (attempt === 3) throw new Error(`Could not push to hub-state after 3 attempts: ${(e as Error).message}`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return { slugs, snapshots, pushed: false };
}
