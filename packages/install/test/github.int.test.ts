// The install against a real GitHub organization: run e2e/github/bootstrap.mjs first, then `npm run test:github`.
// Skipped in `npm test`. Public repositories, so a Free organization has rulesets, auto-merge and repository secrets.
// It checks that hub-guard runs from the default branch on each pull request and that auto-merge merges it, a save
// from the site opening its own pull request, the pushers from the activity API, hub-report publishing with the deploy
// key, and, when github.json names a second person, a refusal recorded in hub-state.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseConfig, parseSaveRefusal, parseTeamSnapshot, refusalPath } from "@sdlc-hub/core";
import { GitHub } from "@sdlc-hub/host";
import { createSaver, type Save, type Saver } from "@sdlc-hub/save";
import { hostSaves } from "../../cli/src/host-saves.ts";
import { installGitHub, preflightGitHub, type SetupAnswers } from "../src/index.ts";

const FILE = join(homedir(), ".sdlc-hub-test", "github.json");
const enabled = process.env.HUB_GITHUB_IT === "1" && existsSync(FILE);
type Secrets = { org: string; token: string; people?: Record<string, string> };
const secrets: Secrets = enabled ? (JSON.parse(readFileSync(FILE, "utf8")) as Secrets) : { org: "", token: "" };
const ORG = secrets.org;
const SPECS = "product-specs";

const ANSWERS: SetupAnswers = {
  host: "github",
  address: "github.com",
  namespace: ORG,
  repoMode: "existing",
  repo: SPECS,
  teams: [
    { name: "Backend", repo: "backend", kind: "backend" },
    { name: "Web", repo: "web-admin", kind: "web" },
  ],
  contract: 0,
  project: "Marketplace",
  tracker: { type: "none" },
  links: {},
  assistants: { claude: true, codex: true, cursor: true },
  engine: "sdd",
  headless: false,
};

const bundle = existsSync("packages/cli/dist/cli.mjs") ? readFileSync("packages/cli/dist/cli.mjs", "utf8") : "";
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** git with a person's token as an HTTP header: nothing lands in a file. */
const gitEnv = (gh: GitHub, name: string) => ({ ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: gh.gitAuthHeader(), GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: `${name}@example.com`, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: `${name}@example.com` });

/** A person's clone of product-specs and their saver, as `hub serve` makes it on GitHub. */
function personSaver(gh: GitHub, token: string, login: string): Saver {
  const dir = mkdtempSync(join(tmpdir(), "hub-gh-"));
  temp.push(dir);
  const env = gitEnv(gh, login);
  execFileSync("git", ["clone", "-q", `https://github.com/${ORG}/${SPECS}.git`, dir], { env });
  const config = parseConfig(readFileSync(join(dir, ".hub/config.yaml"), "utf8"), "c").value!;
  return createSaver({ root: dir, identity: { name: login, email: `${login}@example.com` }, env, ...hostSaves(config, { fill: () => token }) });
}

/** Waits until a save merged or was refused. */
async function settle(saver: Saver, branch: string): Promise<Save> {
  let s = saver.list().find((x) => x.branch === branch)!;
  for (let i = 0; i < 60 && s.state === "pending"; i++) {
    await wait(5000);
    s = saver.refresh().find((x) => x.branch === branch)!;
  }
  return s;
}

describe.skipIf(!enabled)("install on GitHub (Free organization, public repositories)", () => {
  const owner = new GitHub(secrets.token);
  let login = "";

  it("passes the checks as an owner of the organization", async () => {
    login = (await owner.me()).login;
    const pre = await preflightGitHub(ANSWERS, owner);
    expect(pre.ok, JSON.stringify(pre.checks)).toBe(true);
  }, 60_000);

  it("installs: files, settings, hub-state, the deploy key and its secret, the ruleset and one pull request per team", async () => {
    const r = await installGitHub(ANSWERS, owner, { hubBundle: bundle });
    expect(r.steps.filter((s) => s.state === "fail"), JSON.stringify(r.steps)).toEqual([]);
    const at = (await owner.openPulls(ORG, SPECS, "sdlc-hub/install"))[0] ? "sdlc-hub/install" : "main";
    expect(parseConfig((await owner.file(ORG, SPECS, ".hub/config.yaml", at))!, "c").value?.git).toMatchObject({ provider: "github", host: "github.com", namespace: ORG });
    expect(await owner.file(ORG, SPECS, ".github/workflows/hub-guard.yml", at)).toContain("pull_request_target");
    expect(await owner.file(ORG, SPECS, ".cursor/mcp.json", at)).toContain("${workspaceFolder}");
    const repo = (await owner.repo(ORG, SPECS))!;
    expect(repo).toMatchObject({ allow_auto_merge: true, delete_branch_on_merge: true });
    expect(await owner.branch(ORG, SPECS, "hub-state")).not.toBeNull();
    expect((await owner.deployKeys(ORG, SPECS)).some((k) => k.title.startsWith("sdlc-hub hub-state") && !k.read_only)).toBe(true);
    for (const team of ["backend", "web-admin"]) {
      expect(await owner.repoSecret(ORG, team, "HUB_STATE_KEY"), team).not.toBeNull();
      const open = (await owner.openPulls(ORG, team, "sdlc-hub/hub-report")).length;
      const merged = (await owner.file(ORG, team, ".github/workflows/hub-report.yml", "main")) !== null;
      expect(open === 1 || merged, team).toBe(true);
    }
    const set = (await owner.rulesets(ORG, SPECS)).find((x) => x.name === "sdlc-hub: main")!;
    expect((await owner.ruleset(ORG, SPECS, set.id)).rules.map((x) => x.type).sort()).toEqual(["deletion", "non_fast_forward", "pull_request", "required_status_checks"]);
  }, 300_000);

  it("changes nothing on a second run", async () => {
    const r = await installGitHub(ANSWERS, owner, { hubBundle: bundle });
    expect(r.steps.map((s) => [s.id, s.state])).toEqual(r.steps.map((s) => [s.id, "skip"]));
  }, 180_000);

  it("refuses a direct push to main, even by an owner", () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-gh-"));
    temp.push(dir);
    const env = gitEnv(owner, login);
    execFileSync("git", ["clone", "-q", "--depth", "1", `https://github.com/${ORG}/${SPECS}.git`, dir], { env });
    execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "direct"], { cwd: dir, env });
    const push = spawnSync("git", ["push", "origin", "HEAD:main"], { cwd: dir, env, encoding: "utf8" });
    expect(push.status).not.toBe(0);
    expect(push.stderr).toMatch(/rule|protected|GH013/i);
  }, 60_000);

  it("merges a save from the site by itself once hub-guard passes, in the person's name", async () => {
    const saver = personSaver(owner, secrets.token, login);
    const stamp = new Date().toISOString();
    const s = await saver.save({ user: login, label: "spec", title: "Spec from the site", build: () => [{ path: "docs/features/bulk-order-export/spec.md", next: `# Bulk order export\n\nSaved from the site ${stamp}.\n` }] });
    expect(s.mr?.url).toMatch(new RegExp(`github\\.com/${ORG}/${SPECS}/pull/\\d+`));
    // The guard judges everyone who pushed to the branch: the activity API names them.
    let pushers: string[] = [];
    for (let i = 0; i < 12 && !pushers.length; i++) {
      pushers = await owner.pushers(ORG, SPECS, s.branch);
      if (!pushers.length) await wait(5000);
    }
    expect(pushers).toEqual([login]);
    const done = await settle(saver, s.branch);
    expect(done.state).toBe("merged");
    const pr = await owner.pull(ORG, SPECS, s.mr!.iid);
    expect(pr).toMatchObject({ merged: true, user: { login } });
  }, 420_000);

  it("runs hub-report after the team's CI and publishes the snapshot to hub-state with the deploy key", async () => {
    // The team lead merges the hub-report pull request; then a push to main runs CI, and hub-report after it.
    const pr = (await owner.openPulls(ORG, "backend", "sdlc-hub/hub-report"))[0];
    if (pr) {
      const res = await fetch(`https://api.github.com/repos/${ORG}/backend/pulls/${pr.number}/merge`, { method: "PUT", headers: { authorization: `Bearer ${secrets.token}`, accept: "application/vnd.github+json" } });
      expect(res.ok, await res.text()).toBe(true);
    }
    const before = await owner.file(ORG, SPECS, "features/bulk-order-export/teams/backend.json", "hub-state");
    const now = await fetch(`https://api.github.com/repos/${ORG}/backend/contents/run.txt`, { headers: { authorization: `Bearer ${secrets.token}` } }).then((r) => (r.ok ? (r.json() as Promise<{ sha: string }>) : null));
    const put = await fetch(`https://api.github.com/repos/${ORG}/backend/contents/run.txt`, {
      method: "PUT",
      headers: { authorization: `Bearer ${secrets.token}`, accept: "application/vnd.github+json" },
      body: JSON.stringify({ message: "Run CI", content: Buffer.from(new Date().toISOString()).toString("base64"), ...(now ? { sha: now.sha } : {}) }),
    });
    expect(put.ok, await put.text()).toBe(true);
    let snap: string | null = null;
    for (let i = 0; i < 72; i++) {
      snap = await owner.file(ORG, SPECS, "features/bulk-order-export/teams/backend.json", "hub-state");
      if (snap && snap !== before) break;
      await wait(5000);
    }
    expect(snap, "hub-report did not publish within 6 minutes").not.toBeNull();
    expect(parseTeamSnapshot(snap!, "backend.json").value).toMatchObject({ team: "backend", slug: "bulk-order-export", tracker: [{ id: "T1", status: "in_progress" }] });
  }, 480_000);

  const [person, personToken] = Object.entries(secrets.people ?? {})[0] ?? [];
  it.skipIf(!person)("refuses a person's change outside their role at merge, with the reason recorded in hub-state", async () => {
    // The owner adds the person as the PO, through a save that merges by itself.
    const admin = personSaver(owner, secrets.token, login);
    const added = await admin.save({
      user: login,
      label: "people",
      title: `Add ${person}`,
      build: (main) => {
        const roles = main.read(".hub/roles.yaml")!;
        return roles.includes(`user: ${person}`) ? [] : [{ path: ".hub/roles.yaml", next: `${roles}  - { user: ${person}, name: ${person}, role: po }\n` }];
      },
    }).catch((e: Error) => (/nothing to save/i.test(e.message) ? undefined : Promise.reject(e)));
    if (added) expect((await settle(admin, added.branch)).state).toBe("merged");

    const gh = new GitHub(personToken!);
    const saver = personSaver(gh, personToken!, person!);
    const s = await saver.save({ user: person!, label: "config", title: "Config from the site", build: (main) => [{ path: ".hub/config.yaml", next: `${main.read(".hub/config.yaml")}# site ${Date.now()}\n` }] });
    const done = await settle(saver, s.branch);
    expect(done.state).toBe("refused");
    expect(done.findings?.map((f) => f.path)).toEqual([".hub/config.yaml"]);
    const record = parseSaveRefusal((await owner.file(ORG, SPECS, refusalPath(s.branch), "hub-state"))!, "r").value!;
    expect(record).toMatchObject({ sha: s.sha, author: person });
    expect(await owner.branch(ORG, SPECS, s.branch)).toBeNull();
  }, 600_000);
});
