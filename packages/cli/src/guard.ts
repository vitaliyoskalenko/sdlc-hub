// hub guard: run by the hub-guard job on every merge request into main of product-specs. The changes come from the
// merge request; who may make them comes from main (roles.yaml, config.yaml, flow.yaml and each feature.yaml), so a
// merge request cannot widen its own rights. See the specification, "Guard rules".

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { guard, loadProject, refusalPath, type Change, type Finding, type SaveRefusal } from "@sdlc-hub/core";
import { refSource } from "@sdlc-hub/git";
import type { GitLab } from "@sdlc-hub/host";
import { tokenEnv, writeHubState } from "@sdlc-hub/save";

export interface GuardRepoOptions {
  /** A checkout of product-specs that has the merge request's commits. */
  cwd: string;
  /** Where the merge request's branch starts on main (CI_MERGE_REQUEST_DIFF_BASE_SHA). */
  baseSha: string;
  /** The merge request's head. */
  head?: string;
  /** The ref the rules are read from: main as it is now. Defaults to the base. */
  rulesRef?: string;
  author: string;
  pushers: string[];
}

export interface GuardResult {
  ok: boolean;
  findings: Finding[];
}

/** Changed paths between the base and the head; a rename keeps both paths. */
function changedPaths(cwd: string, base: string, head: string): { path: string; from?: string }[] {
  const out = execFileSync("git", ["-c", "core.quotePath=false", "diff", "--name-status", "-z", "-M", "--no-ext-diff", base, head, "--"], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const parts = out.split("\0");
  const list: { path: string; from?: string }[] = [];
  for (let i = 0; i < parts.length - 1; ) {
    const status = parts[i++]!;
    if (status.startsWith("R") || status.startsWith("C")) {
      const from = parts[i++]!;
      const path = parts[i++]!;
      list.push(status.startsWith("R") ? { path, from } : { path });
    } else list.push({ path: parts[i++]! });
  }
  return list;
}

export function guardRepo(o: GuardRepoOptions): GuardResult {
  const head = o.head ?? "HEAD";
  const rules = refSource(o.cwd, o.rulesRef ?? o.baseSha);
  const project = loadProject(rules);
  if (!project.value) {
    // Fail closed: without valid rules on main nobody but a fix to them can be judged.
    const reason = `The hub files on main are not valid: ${project.issues.map((i) => `${i.file}: ${i.message}`).join("; ")}`;
    return { ok: false, findings: [{ user: o.author, path: ".hub", reason }] };
  }
  const before = refSource(o.cwd, o.baseSha);
  const after = refSource(o.cwd, head);
  const changes: Change[] = changedPaths(o.cwd, o.baseSha, head).map(({ path, from }) => {
    const base = before.read(from ?? path);
    const next = after.read(path);
    return { path, ...(from ? { from } : {}), ...(base !== undefined ? { base } : {}), ...(next !== undefined ? { next } : {}) };
  });
  const { config, roles, flow } = project.value;
  return guard({ author: o.author, pushers: o.pushers, changes }, { config, roles, flow, feature: (slug) => rules.read(`docs/features/${slug}/hub/feature.yaml`) });
}

/** The GitLab CI variables of a merge request pipeline that the guard reads. */
export interface GuardEnv {
  CI_MERGE_REQUEST_IID?: string;
  CI_MERGE_REQUEST_DIFF_BASE_SHA?: string;
  CI_PROJECT_ID?: string;
  GITLAB_USER_LOGIN?: string;
}

/**
 * The people the guard judges: the merge request author, from the API (a branch name or commit author can be
 * anything), and everyone who pushed to the branch since it was opened, from the project's push events.
 */
export async function mergeRequestPeople(gl: GitLab, env: GuardEnv, since: string): Promise<{ author: string; pushers: string[] }> {
  const iid = Number(env.CI_MERGE_REQUEST_IID);
  const project = env.CI_PROJECT_ID;
  if (!Number.isInteger(iid) || !project) throw new Error("hub guard runs in a merge request pipeline (CI_MERGE_REQUEST_IID and CI_PROJECT_ID are not set)");
  const mr = await gl.mergeRequest(project, iid);
  if (!mr.author) throw new Error(`GitLab did not name the author of merge request !${iid}`);
  const pushed = await gl.pushers(project, mr.source_branch, since);
  return { author: mr.author.username, pushers: [...new Set([...(env.GITLAB_USER_LOGIN ? [env.GITLAB_USER_LOGIN] : []), ...pushed])].sort() };
}

/** The commit time of the merge request's base: pushes to a branch of the same name before it are not this branch's. */
export const baseTime = (cwd: string, sha: string): string =>
  new Date(Number(execFileSync("git", ["show", "-s", "--format=%ct", sha], { cwd, encoding: "utf8" }).trim()) * 1000).toISOString();

export function formatFindings(r: GuardResult, author: string, pushers: string[]): string {
  const who = `author ${author}${pushers.filter((p) => p !== author).length ? `; also pushed: ${pushers.filter((p) => p !== author).join(", ")}` : ""}`;
  if (r.ok) return `hub-guard: passed (${who})`;
  const lines = r.findings.map((f) => `  ✗ ${f.path}${f.line ? `:${f.line}` : ""} — ${f.reason}${f.user !== author ? ` (${f.user})` : ""}`);
  return [`hub-guard: refused (${who})`, ...lines, "", "Only the people whose role allows a path may change it. Ask the admin if your role is wrong."].join("\n");
}

/**
 * A refused save from the site: the reason goes to hub-state, where the person's site reads it, and the branch is
 * deleted, which closes its merge request. Uses HUB_STATE_TOKEN through git's environment.
 */
export function recordRefusal(o: SaveRefusal & { url: string; token: string; env?: NodeJS.ProcessEnv }): void {
  const { url, token, env: base, ...record } = o;
  const env = tokenEnv(token, base);
  writeHubState({
    url,
    env,
    message: `hub-guard: refused ${record.branch}`,
    edit(dir) {
      const path = join(dir, refusalPath(record.branch));
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
      return true;
    },
  });
  execFileSync("git", ["push", "-q", url, "--delete", record.branch], { env: { ...env, GIT_TERMINAL_PROMPT: "0" }, stdio: "pipe" });
}
