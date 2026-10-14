// hub report: run by the hub-report CI job in a team repository. It builds the team's snapshot of each feature and
// publishes it to hub-state of product-specs. Git gets its credentials from the environment the job sets up.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildTeamSnapshot, parseTeamSnapshot, type TeamSnapshot, carryWaits } from "@sdlc-hub/core";
import { workingTreeSource } from "@sdlc-hub/git";
import { writeHubState } from "@sdlc-hub/save";

export interface ReportOptions {
  team: string;
  /** The team repository checkout. */
  cwd: string;
  /** product-specs, as git reaches it. */
  specsUrl: string;
  push: boolean;
  /** GitLab CI variables: CI_COMMIT_REF_NAME, CI_DEFAULT_BRANCH, CI_COMMIT_SHA, CI_OPEN_MERGE_REQUESTS. */
  env: Record<string, string | undefined>;
  now: string;
  /** The team repository's branches; by default asked of its origin. */
  branches?: () => string[];
}

export interface ReportResult {
  slugs: string[];
  snapshots: TeamSnapshot[];
  pushed: boolean;
}

/** The feature a feat/<slug> branch is for. */
const featureOf = (branch: string | undefined) => /^feat\/([a-z0-9][a-z0-9-]*)$/.exec(branch ?? "")?.[1];

/** The branches of the team repository: HUB_BRANCHES (the GitHub workflow asks the API), or as the job's checkout reaches them; none when it cannot ask. */
function remoteBranches(cwd: string, env: ReportOptions["env"]): string[] {
  if (env["HUB_BRANCHES"] !== undefined) return env["HUB_BRANCHES"].split("\n").map((b) => b.trim()).filter(Boolean);
  const r = spawnSync("git", ["ls-remote", "--heads", "origin"], { cwd, encoding: "utf8", timeout: 60_000 });
  return r.status === 0 ? r.stdout.split("\n").flatMap((l) => /refs\/heads\/(\S+)$/.exec(l)?.[1] ?? []) : [];
}

/**
 * The features this pipeline speaks for. A feat/<slug> branch speaks for its feature. The default branch speaks for
 * the features that have no branch of their own (before work starts, and once it merged), so it never replaces what
 * a feature's branch said. Any other branch, such as hub/fanout with the shared files, speaks for none.
 */
function slugsOf(cwd: string, env: ReportOptions["env"], branches: () => string[]): string[] {
  const dir = join(cwd, "docs/features");
  const all = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  const branch = env.CI_COMMIT_REF_NAME;
  const feature = featureOf(branch);
  if (feature) return all.filter((s) => s === feature);
  if (branch !== (env.CI_DEFAULT_BRANCH ?? "main")) return [];
  const own = new Set(branches().flatMap((b) => featureOf(b) ?? []));
  return all.filter((s) => !own.has(s));
}

/** The open merge request of the feature's branch, from CI_OPEN_MERGE_REQUESTS ("group/project!12,..."). */
function mrOf(env: ReportOptions["env"]): TeamSnapshot["mr"] {
  if (!featureOf(env.CI_COMMIT_REF_NAME)) return null;
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
  const slugs = slugsOf(o.cwd, o.env, o.branches ?? (() => remoteBranches(o.cwd, o.env)));
  const snapshots: TeamSnapshot[] = [];
  for (const slug of slugs) {
    const r = buildTeamSnapshot({ team: o.team, slug, source, commit: o.env.CI_COMMIT_SHA ?? null, now: o.now, mr: mrOf(o.env) });
    // Never publish a record the site would ignore.
    const check = parseTeamSnapshot(JSON.stringify(r.value), "snapshot");
    if (!check.value) throw new Error(`The snapshot of ${slug} is not valid: ${check.issues.map((i) => i.message).join("; ")}`);
    snapshots.push(check.value);
  }
  if (!o.push || !snapshots.length) return { slugs, snapshots, pushed: false };

  const pushed = writeHubState({
    url: o.specsUrl,
    message: `hub-report: ${o.team} (${snapshots.map((s) => s.slug).join(", ")})`,
    author: { name: o.env.GITLAB_USER_NAME ?? "hub-report", email: o.env.GITLAB_USER_EMAIL ?? "hub-report@localhost" },
    edit(dir) {
      let changed = false;
      for (const fresh of snapshots) {
        const path = join(dir, "features", fresh.slug, "teams", `${o.team}.json`);
        // The waits on other teams keep their start from the snapshot before this one.
        const prev = existsSync(path) ? parseTeamSnapshot(readFileSync(path, "utf8"), path).value : undefined;
        const s = carryWaits(prev, fresh, o.now);
        const text = JSON.stringify(s, null, 2) + "\n";
        if (existsSync(path) && withoutTime(readFileSync(path, "utf8")) === withoutTime(text)) continue;
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, text);
        changed = true;
      }
      return changed;
    },
  });
  return { slugs, snapshots, pushed };
}

export interface TestsOptions {
  team: string;
  cwd: string;
  specsUrl: string;
  result: "passed" | "failed";
  /** GitLab CI variables: CI_COMMIT_REF_NAME, CI_COMMIT_SHA, CI_PIPELINE_ID, CI_PIPELINE_URL. */
  env: Record<string, string | undefined>;
  now: string;
}

/**
 * The result of this pipeline, for the autotests gate: one record per feature the branch reports, named by the
 * pipeline so a retried job does not add a second one. The hub-tests-passed and hub-tests-failed jobs run it.
 */
export function reportTests(o: TestsOptions): { slugs: string[]; pushed: boolean } {
  // Only a feature's own branch runs that feature's tests.
  const feature = featureOf(o.env.CI_COMMIT_REF_NAME);
  const slugs = feature && existsSync(join(o.cwd, "docs/features", feature)) ? [feature] : [];
  if (!slugs.length) return { slugs, pushed: false };
  const id = o.env.CI_PIPELINE_ID ?? o.now.replace(/\D/g, "");
  const branch = o.env.CI_COMMIT_REF_NAME;
  const sha = o.env.CI_COMMIT_SHA?.slice(0, 7);
  const run = { source: "ci", team: o.team, result: o.result, at: o.now, ...(o.env.CI_PIPELINE_URL ? { url: o.env.CI_PIPELINE_URL } : {}), ...(branch && sha ? { ref: `${branch}@${sha}` } : {}) };
  const pushed = writeHubState({
    url: o.specsUrl,
    message: `hub-report: ${o.team} pipeline ${id} ${o.result}`,
    author: { name: o.env.GITLAB_USER_NAME ?? "hub-report", email: o.env.GITLAB_USER_EMAIL ?? "hub-report@localhost" },
    edit(dir) {
      for (const slug of slugs) {
        const path = join(dir, "features", slug, "tests", `ci-${o.team}-${id}.json`);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify(run, null, 2) + "\n");
      }
      return true;
    },
  });
  return { slugs, pushed };
}
