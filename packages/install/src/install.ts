// The checks before install and the install steps on GitLab. Each step first looks at the host, so a second run
// continues from the first step that did not finish and repeats nothing. Phase 1b writes files, creates hub-state,
// stores HUB_STATE_TOKEN and opens the hub-report merge requests. Phase 2 adds hub-guard: the hub-ci project,
// HUB_GUARD_TOKEN, the CI configuration of product-specs, "Pipelines must succeed" and a protected main. Once main is
// protected, the files reach it through a merge request that merges itself, like every other change.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitLab, HostError, WORDS, type GitLabGroup, type GitLabProject, type GitLabUser } from "@sdlc-hub/host";
import { CLAUDE_BLOCK, hostUrl, hubFiles, teamId, withBlock, withIgnore, type SetupAnswers } from "./answers.ts";
import { HUB_CI_FILE, HUB_CI_PROJECT, HUB_REPORT_FILE, hubGuardCi, hubReportJob, reportStage, withInclude } from "./ci.ts";

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
const INSTALL_BRANCH = "sdlc-hub/install";
/** GitLab access levels. */
const NO_ONE = 0;
const DEVELOPER = 30;
const MAINTAINER = 40;

type Protection = Awaited<ReturnType<GitLab["protectedBranch"]>>;
const isProtected = (b: Protection, push: number, merge: number) =>
  !!b && b.push_access_levels.length > 0 && b.push_access_levels.every((l) => l.access_level === push) && b.merge_access_levels.length > 0 && b.merge_access_levels.every((l) => l.access_level === merge);

/** Protects a branch with exactly these levels. The API has no update on Free, so a different protection is replaced. */
async function protect(gl: GitLab, projectId: number, branch: string, push: number, merge: number): Promise<boolean> {
  const now = await gl.protectedBranch(projectId, branch);
  if (isProtected(now, push, merge)) return false;
  if (now) await gl.unprotectBranch(projectId, branch);
  await gl.protectBranch(projectId, branch, push, merge);
  return true;
}

/** A project access token stored in a masked CI variable, created once; returns its expiry for the reminder. */
async function tokenVariable(gl: GitLab, o: { projectId: number; name: string; scopes: string[]; level: number; now: Date; has: () => Promise<unknown>; store: (token: string) => Promise<unknown> }) {
  if (await o.has()) {
    const t = (await gl.projectTokens(o.projectId).catch(() => [])).find((x) => x.name === o.name && x.active && !x.revoked);
    return { created: false, expires: t?.expires_at ?? "" };
  }
  const exp = new Date(o.now.getTime() + 364 * 86_400_000).toISOString().slice(0, 10);
  const t = await gl.createProjectToken(o.projectId, o.name, o.scopes, o.level, exp);
  await o.store(t.token);
  return { created: true, expires: t.expires_at };
}

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

  // 1. The hub and its settings, in one commit on main; through a merge request once main is protected.
  const locked = isProtected(await gl.protectedBranch(p.id, main), NO_ONE, DEVELOPER);
  const ok1 = await step("files", `wrote .hub/, hub/cli.js, CLAUDE.md${a.assistants.codex || a.assistants.cursor ? ", AGENTS.md" : ""} and .gitignore to ${specsPath}`, async () => {
    const existingRoles = await gl.file(p.id, ".hub/roles.yaml", main);
    const { files, issues } = hubFiles(a, { user: user.username, name: user.name });
    if (issues.some((i) => i.level === "error")) throw new Error(issues.map((i) => i.message).join("; "));
    if (existingRoles) delete files[".hub/roles.yaml"]; // a second run keeps the people the admin added
    files["hub/cli.js"] = opts.hubBundle;
    // product-specs has no package.json: this one makes Node load hub/cli.js as the ES module it is.
    files["hub/package.json"] = '{ "private": true, "type": "module" }\n';
    files["CLAUDE.md"] = withBlock(await gl.file(p.id, "CLAUDE.md", main), CLAUDE_BLOCK);
    if (a.assistants.codex || a.assistants.cursor) files["AGENTS.md"] = withBlock(await gl.file(p.id, "AGENTS.md", main), CLAUDE_BLOCK);
    files[".gitignore"] = withIgnore(await gl.file(p.id, ".gitignore", main), ".claude/sdd.local.md");
    // An install merge request still waiting for its pipeline already carries some of the files.
    const pending = locked ? (await gl.openMergeRequests(p.id, INSTALL_BRANCH))[0] : undefined;
    const actions = [];
    let behindMain = false;
    for (const [path, content] of Object.entries(files)) {
      const now = await gl.file(p.id, path, main);
      if (now === content) continue;
      behindMain = true;
      const there = pending ? await gl.file(p.id, path, INSTALL_BRANCH) : now;
      if (there === content) continue;
      actions.push({ action: there === null ? ("create" as const) : ("update" as const), file_path: path, content });
    }
    if (!behindMain) return { state: "skip" as const, text: `${specsPath} already has the hub files` };
    if (!locked) {
      const c = await gl.commit(p.id, main, "Install SDLC Hub", actions);
      return { link: c.web_url };
    }
    if (!actions.length && pending) {
      await gl.autoMerge(p.id, pending.iid);
      return { state: "skip" as const, text: `the hub files wait in ${w.changeRequest} ${w.sign}${pending.iid}, which merges itself when hub-guard passes`, link: pending.web_url };
    }
    const mr = await gl.propose(p.id, { target: main, branch: INSTALL_BRANCH, title: "Update SDLC Hub", description: "Written by setup. It merges itself when hub-guard passes.", actions });
    return { text: `opened ${w.changeRequest} ${w.sign}${mr.iid} with the hub files; it merges itself when hub-guard passes`, link: mr.web_url };
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
  const now = opts.now ?? new Date();
  await step("token", "stored a project access token for hub-report as the masked group variable HUB_STATE_TOKEN", async () => {
    const t = await tokenVariable(gl, {
      projectId: p.id,
      name: "hub-report",
      scopes: ["read_repository", "write_repository"],
      level: DEVELOPER,
      now,
      has: () => gl.groupVariable(group.id, "HUB_STATE_TOKEN"),
      store: (token) => gl.setGroupVariable(group.id, "HUB_STATE_TOKEN", token, { masked: true, protected: false }),
    });
    // Remind of the expiry on every run: the token stops working on that day.
    if (t.expires) left.push(`Renew HUB_STATE_TOKEN before ${t.expires}: it is a project access token of ${specsPath} and GitLab expires it then`);
    if (!t.created) return { state: "skip" as const, text: "the group variable HUB_STATE_TOKEN already exists" };
  });

  // 5. hub-guard. hub-ci holds the CI configuration of product-specs; its main only Maintainers change.
  const ciPath = `${group.full_path}/${HUB_CI_PROJECT}`;
  await step("hub-ci", `created ${ciPath} with the hub-guard job, its main protected`, async () => {
    let ci = await gl.project(ciPath);
    let changed = false;
    if (!ci) {
      ci = await gl.createProject(group.id, HUB_CI_PROJECT);
      changed = true;
    }
    const branch = ci.default_branch ?? "main";
    const now = await gl.file(ci.id, HUB_CI_FILE, branch);
    if (now !== hubGuardCi()) {
      await gl.commit(ci.id, branch, "The hub-guard job (SDLC Hub)", [{ action: now === null ? "create" : "update", file_path: HUB_CI_FILE, content: hubGuardCi() }]);
      changed = true;
    }
    if (await protect(gl, ci.id, branch, MAINTAINER, MAINTAINER)) changed = true;
    if (!changed) return { state: "skip" as const, text: `${ciPath} already has the current hub-guard job` };
  });

  // HUB_GUARD_TOKEN: read_api, so the guard can ask who opened a merge request and who pushed to it.
  await step("guard-token", "stored a read-only project access token for hub-guard as the masked variable HUB_GUARD_TOKEN", async () => {
    const t = await tokenVariable(gl, {
      projectId: p.id,
      name: "hub-guard",
      scopes: ["read_api"],
      level: 20,
      now,
      has: () => gl.projectVariable(p.id, "HUB_GUARD_TOKEN"),
      store: (token) => gl.setProjectVariable(p.id, "HUB_GUARD_TOKEN", token, { masked: true, protected: false }),
    });
    if (t.expires) left.push(`Renew HUB_GUARD_TOKEN before ${t.expires}: after that day hub-guard fails and no merge request into ${specsPath} can merge`);
    if (!t.created) return { state: "skip" as const, text: "the variable HUB_GUARD_TOKEN already exists" };
  });

  // The CI configuration file of product-specs points at hub-ci, and a merge request merges only when it passes.
  const ciConfig = `${HUB_CI_FILE}@${ciPath}`;
  await step("ci-config", `pointed the CI configuration of ${specsPath} at ${ciConfig} and turned on "Pipelines must succeed"`, async () => {
    const now = await gl.project(specsPath);
    if (now?.ci_config_path === ciConfig && now.only_allow_merge_if_pipeline_succeeds && !now.allow_merge_on_skipped_pipeline)
      return { state: "skip" as const, text: `${specsPath} already runs ${ciConfig} and needs it to pass` };
    await gl.updateProject(p.id, { ci_config_path: ciConfig, only_allow_merge_if_pipeline_succeeds: true, allow_merge_on_skipped_pipeline: false });
  });

  // Last: main takes no pushes, and Developers merge, which is what "merges itself" does in their name.
  await step("protect", `protected main of ${specsPath}: no one pushes, Developers merge`, async () => {
    if (!(await protect(gl, p.id, main, NO_ONE, DEVELOPER))) return { state: "skip" as const, text: `main of ${specsPath} is already protected` };
  });

  // 6. One merge request per team repository that adds the hub-report job.
  const opened: string[] = [];
  for (const t of a.teams) {
    const id = teamId(t.name);
    const path = `${group.full_path}/${t.repo.trim()}`;
    await step(`report-${id}`, `opened the ${w.changeRequest} that adds hub-report to ${path}`, async () => {
      const proj = await gl.project(path);
      if (!proj) throw new Error(`there is no repository ${path}`);
      const target = proj.default_branch ?? "main";
      const open = await gl.openMergeRequests(proj.id, REPORT_BRANCH);
      const ci = await gl.file(proj.id, ".gitlab-ci.yml", target);
      const current = await gl.file(proj.id, HUB_REPORT_FILE, target);
      // A team that merged an earlier version of the job gets the new one; a team that has this one is done.
      const job = hubReportJob({ specs: specsPath, team: id, stage: current ? (/^  stage: (.+)$/m.exec(current)?.[1] ?? reportStage(ci)) : reportStage(ci) });
      if (current === job && ci !== null && withInclude(ci) === ci) return { state: "skip" as const, text: `${path} already has the hub-report job` };
      if (open[0]) {
        opened.push(`${t.repo.trim()} ${w.sign}${open[0].iid}`);
        // The open merge request keeps its number; an older job on its branch is replaced.
        const onBranch = await gl.file(proj.id, HUB_REPORT_FILE, REPORT_BRANCH);
        if (onBranch === job) return { state: "skip" as const, text: `${path} already has the ${w.changeRequest} ${w.sign}${open[0].iid}`, link: open[0].web_url };
        await gl.commit(proj.id, REPORT_BRANCH, "Update the hub-report job (SDLC Hub)", [{ action: onBranch === null ? "create" : "update", file_path: HUB_REPORT_FILE, content: job }]);
        return { text: `updated the hub-report job in ${path} ${w.sign}${open[0].iid}`, link: open[0].web_url };
      }
      const actions = [
        { action: current === null ? ("create" as const) : ("update" as const), file_path: HUB_REPORT_FILE, content: job },
        ...(ci !== null && withInclude(ci) === ci ? [] : [{ action: ci === null ? ("create" as const) : ("update" as const), file_path: ".gitlab-ci.yml", content: withInclude(ci) }]),
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
  left.push(`Keep the people of the hub at the Developer role in ${group.full_path}: a Maintainer can change ${ciPath} and the protection of main`);
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
