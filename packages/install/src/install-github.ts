// The install on GitHub: the same result as on GitLab with GitHub's means. Built from GitHub's documentation of
// 2026-10-09 (claim 5). Each step looks at GitHub first, so a second run continues where the first stopped.
//
// GitHub Free gives private repositories no rulesets, branch protection, auto-merge or organization secrets, so a
// private product-specs needs GitHub Team; the checks say so before anything is written.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitHub, HostError, hubRuleset, WORDS, type GitHubRepo, type GitHubUser } from "@sdlc-hub/host";
import { agentSkillFiles, codexFiles, cursorFiles, marketplaceFile, pluginFiles, withClaudeSettings } from "@sdlc-hub/plugin/files";
import { AGENTS_BLOCK, CLAUDE_BLOCK, hubFiles, teamId, withBlock, withIgnore, type SetupAnswers } from "./answers.ts";
import { GUARD_WORKFLOW, hubGuardWorkflow, hubReportWorkflow, REPORT_WORKFLOW } from "./github-ci.ts";
import { pushOrphan, type Check, type InstallOptions, type InstallResult, type Preflight, type StepEvent, type StepState } from "./install.ts";
import { pushFiles } from "./push.ts";

const HUB_STATE = "hub-state";
const INSTALL_BRANCH = "sdlc-hub/install";
const REPORT_BRANCH = "sdlc-hub/hub-report";
const RULESET = "sdlc-hub: main";
const KEY_TITLE = "sdlc-hub hub-state";
const KEY_SECRET = "HUB_STATE_KEY";

/** github.com, or a GitHub Enterprise Server's address. */
export const githubWeb = (address: string) => (address.trim() ? address.trim().replace(/\/+$/, "") : "https://github.com").replace(/^(?!https?:\/\/)/, "https://");
export const githubApi = (address: string) => (/^https:\/\/github\.com$/.test(githubWeb(address)) ? "https://api.github.com" : `${githubWeb(address)}/api/v3`);

export async function preflightGitHub(a: SetupAnswers, gh: GitHub): Promise<Preflight> {
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, text: string, blocking = true) => checks.push({ id, ok, blocking, text });
  let me: GitHubUser;
  try {
    me = await gh.me();
    add("signin", true, `Signed in as ${me.login}`);
  } catch (e) {
    add("signin", false, e instanceof HostError && e.status === 401 ? "The token was refused. Make a fine-grained token for the organization with the permissions setup lists." : `Cannot reach GitHub: ${(e as Error).message}`);
    return { checks, ok: false };
  }
  const org = await gh.org(a.namespace.trim());
  if (!org) {
    add("group", false, `There is no organization ${a.namespace.trim()}, or the token cannot see it`);
    return { checks, ok: false };
  }
  const role = await gh.orgRole(org.login);
  add("owner", role === "admin", role === "admin" ? `You are an owner of ${org.login}` : `You need to be an owner of ${org.login} (yours: ${role ?? "none"})`);
  const specs = await gh.repo(org.login, a.repo.trim());
  if (a.repoMode === "existing") add("specs", !!specs, specs ? `Found ${specs.full_name}` : `There is no repository ${org.login}/${a.repo.trim()}`);
  else add("specs", !specs, specs ? `${specs.full_name} already exists: choose "Use an existing repository"` : `${org.login}/${a.repo.trim()} will be created as a private repository`);
  // Rulesets, auto-merge and the required check need GitHub Team for a private repository.
  const plan = org.plan?.name ?? "unknown";
  const isPrivate = specs ? specs.private : true;
  const paid = plan !== "free";
  add("plan", !isPrivate || paid, !isPrivate ? `${org.login} is on ${plan}; ${a.repo.trim()} is public, so rulesets and auto-merge are available` : paid ? `${org.login} is on GitHub ${plan}: rulesets and auto-merge are available for private repositories` : `${org.login} is on GitHub Free, which gives private repositories no rulesets and no auto-merge. Upgrade it to GitHub Team, or make ${a.repo.trim()} public`);
  for (const t of a.teams) {
    const r = await gh.repo(org.login, t.repo.trim());
    add(`team-${teamId(t.name)}`, !!r, r ? `Found ${r.full_name} for ${t.name.trim()}` : `There is no repository ${org.login}/${t.repo.trim()} for ${t.name.trim()}`);
  }
  try {
    execFileSync("ssh-keygen", ["-?"], { stdio: "ignore" });
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
    add("ssh-keygen", !missing, missing ? "ssh-keygen is missing: install OpenSSH, which makes the key team CI writes hub-state with" : "ssh-keygen is available", true);
  }
  return { user: { id: me.id, username: me.login, name: me.name ?? me.login }, checks, ok: checks.every((c) => c.ok || !c.blocking) };
}

/** A new ed25519 key pair in OpenSSH format, made by ssh-keygen, never written anywhere but a temporary folder. */
function newDeployKey(): { publicKey: string; privateKey: string } {
  const dir = mkdtempSync(join(tmpdir(), "hub-key-"));
  try {
    execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", KEY_TITLE, "-f", join(dir, "key")], { stdio: "ignore" });
    return { publicKey: readFileSync(join(dir, "key.pub"), "utf8").trim(), privateKey: readFileSync(join(dir, "key"), "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function installGitHub(a: SetupAnswers, gh: GitHub, opts: InstallOptions): Promise<InstallResult> {
  const steps: StepEvent[] = [];
  const left: string[] = [];
  const w = WORDS.github;
  const emit = (e: StepEvent) => {
    opts.onStep?.(e);
    if (e.state !== "running") steps.push(e);
  };
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

  const web = githubWeb(a.address);
  const me = await gh.me();
  const org = a.namespace.trim();
  const name = a.repo.trim();
  let specs = await gh.repo(org, name);
  if (a.repoMode === "new" && !specs) {
    if (!(await step("create-repo", `created private repository ${org}/${name}`, async () => void (specs = await gh.createRepo(org, name, true))))) return { ok: false, steps, left };
  }
  if (!specs) throw new Error(`There is no repository ${org}/${name}`);
  const p: GitHubRepo = specs;
  const main = p.default_branch;
  const url = `${web}/${org}/${name}.git`;
  const author = { name: me.name ?? me.login, email: me.email ?? `${me.id}+${me.login}@users.noreply.github.com` };
  const locked = (await gh.rulesets(org, name).catch(() => [])).some((r) => r.name === RULESET);

  // 1. The hub and its settings, pushed with git; through a pull request once the ruleset protects main.
  const ok1 = await step("files", `wrote .hub/, hub/cli.js, the hub plugin, the hub-guard workflow and CLAUDE.md to ${org}/${name}`, async () => {
    const { files, issues } = hubFiles(a, { user: me.login, name: me.name ?? me.login });
    if (issues.some((i) => i.level === "error")) throw new Error(issues.map((i) => i.message).join("; "));
    if (await gh.file(org, name, ".hub/roles.yaml", main)) delete files[".hub/roles.yaml"];
    files["hub/cli.js"] = opts.hubBundle;
    files["hub/package.json"] = '{ "private": true, "type": "module" }\n';
    files["CLAUDE.md"] = withBlock(await gh.file(org, name, "CLAUDE.md", main), CLAUDE_BLOCK);
    if (a.assistants.codex || a.assistants.cursor) files["AGENTS.md"] = withBlock(await gh.file(org, name, "AGENTS.md", main), AGENTS_BLOCK);
    files[".gitignore"] = withIgnore(withIgnore(await gh.file(org, name, ".gitignore", main), ".claude/sdd.local.md"), ".claude/settings.local.json");
    Object.assign(files, pluginFiles());
    files[".claude-plugin/marketplace.json"] = marketplaceFile(a.project.trim() || name);
    files[".claude/settings.json"] = withClaudeSettings(await gh.file(org, name, ".claude/settings.json", main), a.engine === "sdd" ? { id: "sdd", source: "genkovich/sdd" } : null);
    if (a.assistants.codex || a.assistants.cursor) Object.assign(files, agentSkillFiles());
    if (a.assistants.codex) Object.assign(files, codexFiles());
    if (a.assistants.cursor) Object.assign(files, cursorFiles());
    files[GUARD_WORKFLOW] = hubGuardWorkflow();
    const changed: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) if ((await gh.file(org, name, path, main)) !== content) changed[path] = content;
    if (!Object.keys(changed).length) return { state: "skip" as const, text: `${org}/${name} already has the hub files` };
    const push = (from: string, to: string, force = false) => pushFiles({ url, authHeader: gh.gitAuthHeader(), from, to, files: changed, message: "Install SDLC Hub", author, force });
    if (!locked) {
      const sha = push(main, main);
      return sha ? { link: `${web}/${org}/${name}/commit/${sha}` } : { state: "skip" as const };
    }
    const pending = (await gh.openPulls(org, name, INSTALL_BRANCH))[0];
    const sha = push(pending ? INSTALL_BRANCH : main, INSTALL_BRANCH, !pending);
    for (let i = 0; i < 30 && sha && (await gh.branch(org, name, INSTALL_BRANCH))?.commit.sha !== sha; i++) await new Promise((r) => setTimeout(r, 1000));
    const pr = pending ?? (await gh.createPull(org, name, INSTALL_BRANCH, main, "Update SDLC Hub", "Written by setup. It merges itself when hub-guard passes."));
    await gh.autoMerge(pr);
    return { text: `opened ${w.changeRequest} ${w.sign}${pr.number} with the hub files; it merges itself when hub-guard passes`, link: pr.html_url };
  });
  if (!ok1) return { ok: false, steps, left };

  // 2. Pull requests merge themselves and their branches go; no forks.
  await step("settings", `turned on auto-merge and branch deletion after merge, and turned off forking of ${org}/${name}`, async () => {
    const now = (await gh.repo(org, name))!;
    // A public repository can always be forked; pull requests from forks still go through hub-guard.
    if (now.allow_auto_merge && now.delete_branch_on_merge && (now.allow_forking === false || !now.private)) return { state: "skip" as const, text: `${org}/${name} already merges by itself and takes no forks` };
    await gh.updateRepo(org, name, { allow_auto_merge: true, delete_branch_on_merge: true });
    // Forking of private repositories is often off for the whole organization already; then GitHub refuses the field.
    await gh.updateRepo(org, name, { allow_forking: false }).catch(() => undefined);
  });

  // 3. hub-state: an orphan branch that is never merged into main.
  await step("hub-state", `created branch ${HUB_STATE} for machine data`, async () => {
    if (await gh.branch(org, name, HUB_STATE)) return { state: "skip" as const, text: `branch ${HUB_STATE} already exists` };
    pushOrphan(web, `${org}/${name}`, gh.gitAuthHeader(), HUB_STATE);
  });

  // 4. Team CI writes hub-state with a deploy key of product-specs; its private half is a secret of each team repository.
  await step("token", `added a deploy key to ${org}/${name} and stored its private half as ${KEY_SECRET} in each team repository`, async () => {
    const keys = await gh.deployKeys(org, name);
    const missing = [];
    for (const t of a.teams) if (!(await gh.repoSecret(org, t.repo.trim(), KEY_SECRET))) missing.push(t.repo.trim());
    if (keys.some((k) => k.title.startsWith(KEY_TITLE) && !k.read_only) && !missing.length) return { state: "skip" as const, text: `${org}/${name} has its deploy key, and every team repository the secret` };
    // A new team repository needs the private key, which is not kept anywhere: make a new key for all of them.
    const key = newDeployKey();
    await gh.addDeployKey(org, name, `${KEY_TITLE} ${new Date().toISOString().slice(0, 10)}`, key.publicKey, false);
    for (const t of a.teams) await gh.setRepoSecret(org, t.repo.trim(), KEY_SECRET, key.privateKey);
  });
  left.push(`The deploy key on ${org}/${name} can write any branch but main; remove older "${KEY_TITLE}" keys once team CI uses the newest`);

  // 5. main takes pull requests only, and hub-guard must pass.
  await step("protect", `added the ruleset "${RULESET}": pull requests only, hub-guard must pass, no deletion or force push`, async () => {
    const existing = (await gh.rulesets(org, name)).find((r) => r.name === RULESET);
    if (existing) {
      const now = await gh.ruleset(org, name, existing.id);
      const want = hubRuleset();
      if (JSON.stringify(now.rules.map((r) => r.type)) === JSON.stringify(want.rules.map((r) => r.type)) && now.enforcement === "active") return { state: "skip" as const, text: `${org}/${name} already has the ruleset` };
      await gh.updateRuleset(org, name, existing.id, want);
      return;
    }
    await gh.createRuleset(org, name, hubRuleset());
  });

  // 6. One pull request per team repository with the hub-report workflow.
  const opened: string[] = [];
  for (const t of a.teams) {
    const id = teamId(t.name);
    const repo = t.repo.trim();
    await step(`report-${id}`, `opened the ${w.changeRequest} that adds hub-report to ${org}/${repo}`, async () => {
      const r = await gh.repo(org, repo);
      if (!r) throw new Error(`there is no repository ${org}/${repo}`);
      const flows = (await gh.workflows(org, repo)).filter((f) => f.state === "active" && !f.path.endsWith("hub-report.yml")).map((f) => f.name);
      const job = hubReportWorkflow({ specs: `${org}/${name}`, team: id, workflows: flows, host: new URL(web).host });
      if ((await gh.file(org, repo, REPORT_WORKFLOW, r.default_branch)) === job) return { state: "skip" as const, text: `${org}/${repo} already has the hub-report workflow` };
      const pending = (await gh.openPulls(org, repo, REPORT_BRANCH))[0];
      if (pending && (await gh.file(org, repo, REPORT_WORKFLOW, REPORT_BRANCH)) === job) {
        opened.push(`${repo} ${w.sign}${pending.number}`);
        return { state: "skip" as const, text: `${org}/${repo} has the ${w.changeRequest} open already`, link: pending.html_url };
      }
      pushFiles({ url: `${web}/${org}/${repo}.git`, authHeader: gh.gitAuthHeader(), from: pending ? REPORT_BRANCH : r.default_branch, to: REPORT_BRANCH, files: { [REPORT_WORKFLOW]: job }, message: "Add the hub-report workflow (SDLC Hub)", author, force: !pending });
      const pr = pending ?? (await gh.createPull(org, repo, REPORT_BRANCH, r.default_branch, "Add the hub-report workflow (SDLC Hub)", `SDLC Hub was installed in ${org}/${name}. This workflow publishes this team's tasks, tracker, review verdict and the result of its workflows for each feature to its hub-state branch. It changes nothing in this repository.\n\nThe team lead merges it.`));
      opened.push(`${repo} ${w.sign}${pr.number}`);
      return { link: pr.html_url };
    });
  }
  if (opened.length) left.push(`${a.teams.length === 1 ? "The team lead merges" : "Each team lead merges"} the ${w.changeRequest} that adds the hub-report workflow: ${opened.join(", ")}`);
  left.push("Add each person on People and roles, then send them their setup script");
  return { ok: steps.every((s) => s.state !== "fail"), steps, left };
}
