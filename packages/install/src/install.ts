// The checks before install and the install steps on GitLab. Each step first looks at the host, so a second run
// continues from the first step that did not finish and repeats nothing. Phase 1b writes files, creates hub-state,
// stores HUB_STATE_TOKEN and opens the hub-report merge requests; protecting main comes with phase 2.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitLab, HostError, WORDS, type GitLabGroup, type GitLabProject, type GitLabUser } from "@sdlc-hub/host";
import { CLAUDE_BLOCK, hostUrl, hubFiles, teamId, withBlock, withIgnore, type SetupAnswers } from "./answers.ts";
import { HUB_REPORT_FILE, hubReportJob, reportStage, withInclude } from "./ci.ts";

export interface Check {
  id: string;
  ok: boolean;
  /** False for a check that only warns. */
  blocking: boolean;
  text: string;
}

export interface Preflight {
  user?: GitLabUser;
  version?: string;
  checks: Check[];
  ok: boolean;
}

/** What setup checks before the review screen: sign-in, version, Owner rights, repositories, a CI runner, forking. */
export async function preflight(a: SetupAnswers, gl: GitLab): Promise<Preflight> {
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, text: string, blocking = true) => checks.push({ id, ok, blocking, text });
  let user: GitLabUser | undefined;
  let version: string | undefined;
  try {
    user = await gl.me();
    add("signin", true, `Signed in as ${user.username}`);
  } catch (e) {
    add("signin", false, e instanceof HostError && e.status === 401 ? "The token was refused. Paste a personal access token with the api scope." : `Cannot reach ${gl.url}: ${(e as Error).message}`);
    return { checks, ok: false };
  }
  try {
    version = (await gl.version()).version;
    add("version", true, `GitLab ${version}`);
  } catch {
    add("version", false, "The GitLab version could not be read", false);
  }
  const group = await gl.group(a.namespace.trim());
  if (!group) {
    add("group", false, `There is no group ${a.namespace.trim()}, or you cannot see it`);
    return { user, version, checks, ok: false };
  }
  const level = await gl.groupAccess(group.id, user.id);
  add("owner", level >= 50, level >= 50 ? `You are an Owner of ${group.full_path}` : `You need the Owner role in ${group.full_path} (yours: ${roleName(level)})`);

  const specs = await gl.project(`${group.full_path}/${a.repo.trim()}`);
  if (a.repoMode === "existing") add("specs", !!specs, specs ? `Found ${specs.path_with_namespace}` : `There is no repository ${group.full_path}/${a.repo.trim()}`);
  else add("specs", !specs, specs ? `${specs.path_with_namespace} already exists: choose "Use an existing repository"` : `${group.full_path}/${a.repo.trim()} will be created as a private repository`);

  const teams: GitLabProject[] = [];
  for (const t of a.teams) {
    const p = await gl.project(`${group.full_path}/${t.repo.trim()}`);
    add(`team-${teamId(t.name)}`, !!p, p ? `Found ${p.path_with_namespace} for ${t.name.trim()}` : `There is no repository ${group.full_path}/${t.repo.trim()} for ${t.name.trim()}`);
    if (p) teams.push(p);
  }
  // A runner must be able to run the team pipelines, or hub-report never runs. (Claim 11: as an Owner, not an admin.)
  const probe = teams[0] ?? specs;
  if (probe) {
    const runners = await gl.runners(probe.id).catch(() => []);
    const online = runners.filter((r) => r.online ?? r.status === "online");
    const shared = probe.shared_runners_enabled;
    add("runner", online.length > 0 || shared, online.length ? `${online.length} runner${online.length === 1 ? " is" : "s are"} online for ${probe.path_with_namespace}` : shared ? "Instance runners are on; setup cannot see whether one is online" : "No runner is online and instance runners are off: no pipeline could run");
  }
  if (specs) add("forking", specs.forking_access_level === "disabled", specs.forking_access_level === "disabled" ? "Forking of the specifications repository is off" : "Forking of the specifications repository is on; Install turns it off", false);
  return { user, version, checks, ok: checks.every((c) => c.ok || !c.blocking) };
}

const roleName = (level: number) => ({ 0: "none", 10: "Guest", 15: "Planner", 20: "Reporter", 30: "Developer", 40: "Maintainer", 50: "Owner" })[level] ?? String(level);

export type StepState = "ok" | "skip" | "man" | "fail";

export interface StepEvent {
  id: string;
  state: StepState | "running";
  text: string;
  link?: string;
}

export interface InstallOptions {
  /** The vendored hub: the bundled hub/cli.js. */
  hubBundle: string;
  /** Called for every step as it starts and ends. */
  onStep?: (e: StepEvent) => void;
  /** The current time, for the token's expiry. */
  now?: Date;
}

export interface InstallResult {
  ok: boolean;
  steps: StepEvent[];
  /** What setup leaves for people. */
  left: string[];
}

const HUB_STATE = "hub-state";
const REPORT_BRANCH = "sdlc-hub/hub-report";

export async function install(a: SetupAnswers, gl: GitLab, opts: InstallOptions): Promise<InstallResult> {
  const steps: StepEvent[] = [];
  const left: string[] = [];
  const w = WORDS.gitlab;
  const emit = (e: StepEvent) => {
    opts.onStep?.(e);
    if (e.state !== "running") steps.push(e);
  };
  /** A step's result: nothing for done, or a change of state ("skip" when it was already done), text or link. */
  type Outcome = { state?: StepState; text?: string; link?: string } | void;
  const step = async (id: string, text: string, run: () => Promise<Outcome>) => {
    emit({ id, state: "running", text });
    try {
      const r = (await run()) ?? {};
      emit({ id, state: r.state ?? "ok", text: r.text ?? text, ...(r.link ? { link: r.link } : {}) });
      return true;
    } catch (e) {
      emit({ id, state: "fail", text: `${text}: ${(e as Error).message}` });
      return false;
    }
  };

  const user = await gl.me();
  const group = (await gl.group(a.namespace.trim())) as GitLabGroup;
  const specsPath = `${group.full_path}/${a.repo.trim()}`;
  let specs = await gl.project(specsPath);

  if (a.repoMode === "new" && !specs) {
    if (!(await step("create-repo", `created private repository ${specsPath}`, async () => void (specs = await gl.createProject(group.id, a.repo.trim()))))) return { ok: false, steps, left };
  }
  if (!specs) throw new Error(`There is no repository ${specsPath}`);
  const p = specs;
  const main = p.default_branch ?? "main";

  // 1. The hub and its settings, in one commit on main.
  const ok1 = await step("files", `wrote .hub/, hub/cli.js, CLAUDE.md${a.assistants.codex || a.assistants.cursor ? ", AGENTS.md" : ""} and .gitignore to ${specsPath}`, async () => {
    const existingRoles = await gl.file(p.id, ".hub/roles.yaml", main);
    const { files, issues } = hubFiles(a, { user: user.username, name: user.name });
    if (issues.some((i) => i.level === "error")) throw new Error(issues.map((i) => i.message).join("; "));
    if (existingRoles) delete files[".hub/roles.yaml"]; // a second run keeps the people the admin added
    files["hub/cli.js"] = opts.hubBundle;
    files["CLAUDE.md"] = withBlock(await gl.file(p.id, "CLAUDE.md", main), CLAUDE_BLOCK);
    if (a.assistants.codex || a.assistants.cursor) files["AGENTS.md"] = withBlock(await gl.file(p.id, "AGENTS.md", main), CLAUDE_BLOCK);
    files[".gitignore"] = withIgnore(await gl.file(p.id, ".gitignore", main), ".claude/sdd.local.md");
    const actions = [];
    for (const [path, content] of Object.entries(files)) {
      const now = await gl.file(p.id, path, main);
      if (now === content) continue;
      actions.push({ action: now === null ? ("create" as const) : ("update" as const), file_path: path, content });
    }
    if (!actions.length) return { state: "skip" as const, text: `${specsPath} already has the hub files` };
    const c = await gl.commit(p.id, main, "Install SDLC Hub", actions);
    return { link: c.web_url };
  });
  if (!ok1) return { ok: false, steps, left };

  // 2. Forking off, so a merge request cannot come from a fork that runs its own pipeline.
  await step("forking", "turned off forking of the specifications repository", async () => {
    if (p.forking_access_level === "disabled") return { state: "skip" as const, text: "forking of the specifications repository is already off" };
    await gl.setForking(p.id, "disabled");
  });

  // 3. hub-state: an orphan branch that is never merged into main.
  await step("hub-state", `created branch ${HUB_STATE} for machine data`, async () => {
    if (await gl.branch(p.id, HUB_STATE)) return { state: "skip" as const, text: `branch ${HUB_STATE} already exists` };
    pushOrphan(hostUrl(a.address), specsPath, gl.gitAuthHeader(), HUB_STATE);
  });

  // 4. HUB_STATE_TOKEN: a project access token that hub-report uses to write hub-state, as a masked group variable.
  let expires = "";
  await step("token", "stored a project access token for hub-report as the masked group variable HUB_STATE_TOKEN", async () => {
    if (await gl.groupVariable(group.id, "HUB_STATE_TOKEN")) return { state: "skip" as const, text: "the group variable HUB_STATE_TOKEN already exists" };
    const now = opts.now ?? new Date();
    const exp = new Date(now.getTime() + 364 * 86_400_000).toISOString().slice(0, 10);
    const t = await gl.createProjectToken(p.id, "hub-report", ["read_repository", "write_repository"], 30, exp);
    await gl.setGroupVariable(group.id, "HUB_STATE_TOKEN", t.token, { masked: true, protected: false });
    expires = t.expires_at;
  });
  if (expires) left.push(`Renew HUB_STATE_TOKEN before ${expires}: it is a project access token of ${specsPath} and GitLab expires it then`);

  // 5. One merge request per team repository that adds the hub-report job.
  const opened: string[] = [];
  for (const t of a.teams) {
    const id = teamId(t.name);
    const path = `${group.full_path}/${t.repo.trim()}`;
    await step(`report-${id}`, `opened the ${w.changeRequest} that adds hub-report to ${path}`, async () => {
      const proj = await gl.project(path);
      if (!proj) throw new Error(`there is no repository ${path}`);
      const target = proj.default_branch ?? "main";
      const open = await gl.openMergeRequests(proj.id, REPORT_BRANCH);
      if (open[0]) {
        opened.push(`${t.repo.trim()} ${w.sign}${open[0].iid}`);
        return { state: "skip" as const, text: `${path} already has the ${w.changeRequest} ${w.sign}${open[0].iid}`, link: open[0].web_url };
      }
      const ci = await gl.file(proj.id, ".gitlab-ci.yml", target);
      const job = hubReportJob({ specs: specsPath, team: id, stage: reportStage(ci) });
      const actions = [
        { action: (await gl.file(proj.id, HUB_REPORT_FILE, target)) === null ? ("create" as const) : ("update" as const), file_path: HUB_REPORT_FILE, content: job },
        { action: ci === null ? ("create" as const) : ("update" as const), file_path: ".gitlab-ci.yml", content: withInclude(ci) },
      ];
      if (!(await gl.branch(proj.id, REPORT_BRANCH))) await gl.commit(proj.id, REPORT_BRANCH, "Add the hub-report job (SDLC Hub)", actions, target);
      const mr = await gl.createMergeRequest(
        proj.id,
        REPORT_BRANCH,
        target,
        "Add the hub-report job (SDLC Hub)",
        `SDLC Hub was installed in ${specsPath}. This job publishes this team's tasks, tracker, review verdict and ${w.changeRequest} for each feature to its hub-state branch. It changes nothing in this repository.\n\nThe team lead merges it.`,
      );
      opened.push(`${t.repo.trim()} ${w.sign}${mr.iid}`);
      return { link: mr.web_url };
    });
  }
  if (opened.length) left.push(`${a.teams.length === 1 ? "The team lead merges" : "Each team lead merges"} the ${w.changeRequest} that adds the hub-report job: ${opened.join(", ")}`);
  if (!/gitlab\.com$/.test(new URL(hostUrl(a.address)).hostname)) left.push("Optional: install the pre-receive server hook. It needs access to the GitLab server");
  if (a.engine === "custom") left.push("Fill in .hub/engines/custom.yaml: one command per stage");
  left.push("Protecting main and the hub-guard job come with phase 2: run setup again then");
  return { ok: steps.every((s) => s.state !== "fail"), steps, left };
}

/**
 * Pushes a new branch with no history, holding one README, to the specifications repository. The token reaches git
 * through its environment (GIT_CONFIG_*), never through the command line or a file in the repository.
 */
function pushOrphan(base: string, path: string, authHeader: string, branch: string) {
  const dir = mkdtempSync(join(tmpdir(), "hub-state-"));
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0: authHeader,
    GIT_AUTHOR_NAME: "SDLC Hub",
    GIT_AUTHOR_EMAIL: "sdlc-hub@localhost",
    GIT_COMMITTER_NAME: "SDLC Hub",
    GIT_COMMITTER_EMAIL: "sdlc-hub@localhost",
    GIT_TERMINAL_PROMPT: "0",
  };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, env, stdio: "pipe" });
  try {
    git("init", "-q", "-b", branch);
    writeFileSync(join(dir, "README.md"), "# hub-state\n\nMachine data of SDLC Hub: team snapshots, test runs, events and usage. Written by CI and the hub plugin, never merged into main, never trusted for a gate.\n");
    git("add", "README.md");
    git("commit", "-q", "-m", "Start hub-state");
    git("push", "-q", `${base}/${path}.git`, `HEAD:refs/heads/${branch}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
