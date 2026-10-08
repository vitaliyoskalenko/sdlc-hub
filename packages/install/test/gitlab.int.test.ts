// The install against a real GitLab CE: run e2e/gitlab/bootstrap.mjs first, then `npm run test:gitlab`.
// Skipped in `npm test`. It also checks open-items claims 3, 11, 12 and 13 on GitLab Free, and that hub-guard
// refuses at merge an edit outside a role while edits inside a role merge by themselves.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig, parsePersonState, parseRoles, parseTeamSnapshot, parseTestRun, setupScript } from "@sdlc-hub/core";
import { GitLab, type MergeRequest } from "@sdlc-hub/host";
import { createSaver, type Save } from "@sdlc-hub/save";
import { install, preflight, type SetupAnswers } from "../src/index.ts";

const URL_ = "http://localhost:8929";
const FILE = join(homedir(), ".sdlc-hub-test", "gitlab.json");
const enabled = process.env.HUB_GITLAB_IT === "1" && existsSync(FILE);
type Secrets = { ownerToken: string; rootToken: string; people: Record<string, string> };
const secrets: Secrets = enabled ? (JSON.parse(readFileSync(FILE, "utf8")) as Secrets) : { ownerToken: "", rootToken: "", people: {} };

const ANSWERS: SetupAnswers = {
  host: "gitlab",
  address: URL_,
  namespace: "shop",
  repoMode: "existing",
  repo: "product-specs",
  teams: [
    { name: "Backend", repo: "backend", kind: "backend" },
    { name: "Web", repo: "web-admin", kind: "web" },
    { name: "Android", repo: "android-app", kind: "android" },
    { name: "iOS", repo: "ios-app", kind: "ios" },
  ],
  contract: 0,
  project: "Marketplace",
  tracker: { type: "none" },
  links: {},
  assistants: { claude: true, codex: true, cursor: false },
  engine: "sdd",
  headless: false,
};

// A bundle that differs on every run, so that once main is protected the install's merge request path runs each time.
const bundle = `${existsSync("packages/cli/dist/cli.mjs") ? readFileSync("packages/cli/dist/cli.mjs", "utf8") : ""}\n// test run ${Date.now()}\n`;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Polls a merge request until it merged or its pipeline failed. */
async function settle(gl: GitLab, projectId: number, iid: number): Promise<MergeRequest> {
  let m = await gl.mergeRequest(projectId, iid);
  for (let i = 0; i < 60 && m.state !== "merged" && m.head_pipeline?.status !== "failed"; i++) {
    await wait(5000);
    m = await gl.mergeRequest(projectId, iid);
  }
  return m;
}

/** The log of the hub-guard job of a merge request's pipeline. */
async function guardLog(projectId: number, pipeline: number): Promise<string> {
  const h = { "PRIVATE-TOKEN": secrets.rootToken };
  const jobs = (await fetch(`${URL_}/api/v4/projects/${projectId}/pipelines/${pipeline}/jobs`, { headers: h }).then((r) => r.json())) as { id: number; name: string }[];
  const job = jobs.find((j) => j.name === "hub-guard");
  return job ? fetch(`${URL_}/api/v4/projects/${projectId}/jobs/${job.id}/trace`, { headers: h }).then((r) => r.text()) : "";
}

describe.skipIf(!enabled)("install on GitLab CE (Free)", () => {
  const owner = new GitLab(URL_, secrets.ownerToken);
  const root = new GitLab(URL_, secrets.rootToken);

  it("passes the checks as a group Owner who is not an instance admin (claim 11)", async () => {
    const me = await owner.me();
    expect(me.is_admin ?? false).toBe(false);
    const pre = await preflight(ANSWERS, owner);
    const by = Object.fromEntries(pre.checks.map((c) => [c.id, c]));
    expect(by["owner"]?.ok, by["owner"]?.text).toBe(true);
    expect(by["runner"]?.ok, by["runner"]?.text).toBe(true);
    expect(pre.ok, JSON.stringify(pre.checks)).toBe(true);
  }, 60_000);

  it("installs: files, forking off, hub-state, HUB_STATE_TOKEN (claim 3) and one merge request per team", async () => {
    const r = await install(ANSWERS, owner, { hubBundle: bundle });
    expect(r.steps.filter((s) => s.state === "fail"), JSON.stringify(r.steps)).toEqual([]);
    // With main protected (from an earlier run), the files go through a merge request that merges itself.
    const files = r.steps.find((s) => s.id === "files")!;
    if (/merge request/.test(files.text)) expect(files.text).toMatch(/opened merge request !\d+ with the hub files; it merges itself when hub-guard passes/);
    const specs = (await owner.project("shop/product-specs"))!;
    const config = (await owner.file(specs.id, ".hub/config.yaml", "main"))!;
    expect(parseConfig(config, "c").issues).toEqual([]);
    expect(await owner.file(specs.id, "hub/package.json", "main")).toMatch(/"type": "module"/);
    // The hub plugin for Claude Code, its marketplace and the shared settings (on main, or in the install merge request).
    const at = (await owner.openMergeRequests(specs.id, "sdlc-hub/install"))[0] ? "sdlc-hub/install" : "main";
    expect(JSON.parse((await owner.file(specs.id, "hub/plugin/.mcp.json", at))!).mcpServers.hub.args[0]).toBe("${CLAUDE_PROJECT_DIR}/hub/cli.js");
    expect(JSON.parse((await owner.file(specs.id, ".claude/settings.json", at))!).enabledPlugins).toMatchObject({ "hub@product-specs": true, "sdd@sdd": true });
    expect(specs.forking_access_level).toBe("disabled");
    expect(await owner.branch(specs.id, "hub-state")).not.toBeNull();
    const group = (await owner.group("shop"))!;
    expect(await owner.groupVariable(group.id, "HUB_STATE_TOKEN")).toMatchObject({ masked: true, protected: false });
    // Each team has the merge request open, or merged it already (in an earlier run of this test).
    for (const repo of ["backend", "web-admin", "android-app", "ios-app"]) {
      const p = (await owner.project(`shop/${repo}`))!;
      const open = (await owner.openMergeRequests(p.id, "sdlc-hub/hub-report")).length;
      const merged = (await owner.file(p.id, "ci/hub-report.gitlab-ci.yml", "main")) !== null;
      expect(open === 1 || (open === 0 && merged), repo).toBe(true);
    }
    // The web team's own CI stays as it was, with the include above it.
    const web = (await owner.project("shop/web-admin"))!;
    expect(await owner.file(web.id, ".gitlab-ci.yml", "sdlc-hub/hub-report")).toBe("include:\n  - local: ci/hub-report.gitlab-ci.yml\nstages: [build, test]\nbuild:\n  stage: build\n  script: [echo build]\n");
    expect(r.left.join("\n")).toMatch(/Renew HUB_STATE_TOKEN before \d{4}-\d{2}-\d{2}/);
    expect(r.left.join("\n")).toMatch(/Renew HUB_GUARD_TOKEN before \d{4}-\d{2}-\d{2}/);
    // Phase 2: hub-ci, the CI configuration, "Pipelines must succeed" and main protected.
    const now = (await owner.project("shop/product-specs"))!;
    expect(now).toMatchObject({ ci_config_path: "ci/product-specs.yml@shop/hub-ci", only_allow_merge_if_pipeline_succeeds: true, allow_merge_on_skipped_pipeline: false });
    const pb = (await owner.protectedBranch(specs.id, "main"))!;
    expect([pb.push_access_levels.map((l) => l.access_level), pb.merge_access_levels.map((l) => l.access_level)]).toEqual([[0], [30]]);
    const ci = (await owner.project("shop/hub-ci"))!;
    expect(await owner.file(ci.id, "ci/product-specs.yml", "main")).toContain("guard --rules FETCH_HEAD");
    expect(await owner.projectVariable(specs.id, "HUB_GUARD_TOKEN")).toMatchObject({ masked: true, protected: false });
  }, 180_000);

  it("changes nothing on a second run", async () => {
    const r = await install(ANSWERS, owner, { hubBundle: bundle });
    expect(r.steps.map((s) => [s.id, s.state])).toEqual(r.steps.map((s) => [s.id, "skip"]));
  }, 120_000);

  describe("hub-guard at merge", () => {
    const specsId = async () => (await root.project("shop/product-specs"))!.id;
    const as = (user: string) => new GitLab(URL_, secrets.people[user]!);
    const stamp = Date.now();

    it("merges the admin's merge request that adds people to roles.yaml", async () => {
      const id = await specsId();
      // An install merge request left from an earlier run merges first: the admin passes the guard.
      const pending = (await owner.openMergeRequests(id, "sdlc-hub/install"))[0];
      if (pending) expect((await settle(owner, id, pending.iid)).state).toBe("merged");
      const roles = (await owner.file(id, ".hub/roles.yaml", "main"))!;
      if (roles.includes("olena.k")) return;
      const next = `${roles}  - { user: olena.k, name: Olena K., role: po }\n  - { user: taras.m, name: Taras M., role: dev, team: backend, lead: true }\n`;
      const mr = await owner.propose(id, { target: "main", branch: `people-${stamp}`, title: "Add Olena and Taras", description: "", actions: [{ action: "update", file_path: ".hub/roles.yaml", content: next }] });
      const m = await settle(owner, id, mr.iid);
      expect(m.state, await guardLog(id, m.head_pipeline?.id ?? 0)).toBe("merged");
    }, 360_000);

    it("sets a person up from their generated script, with only their own git credential (the phase 2 exit check)", async () => {
      const id = await specsId();
      const config = parseConfig((await root.file(id, ".hub/config.yaml", "main"))!, "c").value!;
      const person = parseRoles((await root.file(id, ".hub/roles.yaml", "main"))!, "r").value!.people.find((p) => p.user === "taras.m")!;
      const tmp = execFileSync("mktemp", ["-d"], { encoding: "utf8" }).trim();
      try {
        writeFileSync(join(tmp, "setup.sh"), setupScript({ config, person, shell: "bash", release: "x", date: "2026-10-08", by: "nazar.t" }));
        mkdirSync(join(tmp, "bin"));
        writeFileSync(join(tmp, "bin/claude"), `#!/bin/sh\necho "$@" >> "${join(tmp, "claude.log")}"\n`, { mode: 0o755 });
        // His keychain, as git's environment: the script itself carries nothing secret.
        const env = { ...process.env, PATH: `${join(tmp, "bin")}:${process.env["PATH"]}`, HUB_WORK: join(tmp, "work"), HUB_NO_START: "1", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_COUNT: "3", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`oauth2:${secrets.people["taras.m"]}`).toString("base64")}`, GIT_CONFIG_KEY_1: "user.name", GIT_CONFIG_VALUE_1: "Taras M.", GIT_CONFIG_KEY_2: "user.email", GIT_CONFIG_VALUE_2: "taras.m@example.com" };
        const started = Date.now();
        const r = spawnSync("bash", [join(tmp, "setup.sh")], { encoding: "utf8", env, timeout: 300_000 });
        expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
        expect(Date.now() - started).toBeLessThan(15 * 60_000);
        expect(r.stdout).toContain("✓ You are Taras M. (taras.m), dev");
        expect(existsSync(join(tmp, "work/backend/.git"))).toBe(true);
        expect(existsSync(join(tmp, "work/web-admin"))).toBe(false);
        expect(readFileSync(join(tmp, "claude.log"), "utf8")).toContain("plugin install hub@product-specs --scope local");
        const state = await root.file(id, "people/taras.m.json", "hub-state");
        expect(parsePersonState(state!, "p").value).toMatchObject({ user: "taras.m", assistant: "claude" });
      } finally {
        execFileSync("rm", ["-rf", tmp]);
      }
    }, 360_000);

    it("merges the PO's change to a spec by itself, in her name", async () => {
      const id = await specsId();
      const mr = await as("olena.k").propose(id, {
        target: "main",
        branch: `spec-${stamp}`,
        title: "Spec for bulk order export",
        description: "",
        actions: [{ action: (await root.file(id, "docs/features/bulk-order-export/spec.md", "main")) === null ? "create" : "update", file_path: "docs/features/bulk-order-export/spec.md", content: `# Bulk order export\n\nRevision ${stamp}.\n` }],
      });
      const m = await settle(root, id, mr.iid);
      expect(m.state, await guardLog(id, m.head_pipeline?.id ?? 0)).toBe("merged");
      expect(m.author?.username).toBe("olena.k");
      expect(await guardLog(id, m.head_pipeline!.id)).toContain("hub-guard: passed (author olena.k)");
    }, 360_000);

    it("refuses the PO's change to .hub/config.yaml at merge, with the reason in the job log", async () => {
      const id = await specsId();
      const config = (await root.file(id, ".hub/config.yaml", "main"))!;
      const mr = await as("olena.k").propose(id, { target: "main", branch: `config-${stamp}`, title: "Change the config", description: "", actions: [{ action: "update", file_path: ".hub/config.yaml", content: `${config}# ${stamp}\n` }] });
      const m = await settle(root, id, mr.iid);
      expect(m.state).toBe("opened");
      expect(m.head_pipeline?.status).toBe("failed");
      const log = await guardLog(id, m.head_pipeline!.id);
      expect(log).toContain("hub-guard: refused (author olena.k)");
      expect(log).toContain("✗ .hub/config.yaml — No role of olena.k (po) may change .hub/config.yaml");
      await root.updateMergeRequest(id, mr.iid, { state_event: "close" });
    }, 360_000);

    it("judges everyone who pushed to the branch, found in the push events, not only the author", async () => {
      const id = await specsId();
      const path = "docs/features/bulk-order-export/spec.md";
      const branch = `two-${stamp}`;
      // A developer pushes first and the PO pushes last and opens the merge request: the pipeline runs as the PO.
      await as("taras.m").commit(id, branch, "Spec edit by a developer", [{ action: "update", file_path: path, content: `# Bulk order export\n\nEdited by taras.m ${stamp}.\n` }], "main");
      await as("olena.k").commit(id, branch, "Spec edit by the PO", [{ action: "update", file_path: path, content: `# Bulk order export\n\nEdited by olena.k ${stamp}.\n` }]);
      const mr = await as("olena.k").createMergeRequest(id, branch, "main", "Spec edits by two people", "");
      await as("olena.k").autoMerge(id, mr.iid);
      const m = await settle(root, id, mr.iid);
      expect(m.state).toBe("opened");
      const log = await guardLog(id, m.head_pipeline!.id);
      expect(log).toContain("hub-guard: refused (author olena.k; also pushed: taras.m)");
      expect(log).toMatch(/✗ docs\/features\/bulk-order-export\/spec\.md — No role of taras\.m .*\(taras\.m\)/);
      await root.updateMergeRequest(id, mr.iid, { state_event: "close" });
    }, 360_000);

    it("saves from the site with git alone: a merge that passes, and a refusal hub-guard records in hub-state", async () => {
      // Olena's clone, with her credential in git's environment as her keychain would give it.
      const env = { ...process.env, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`oauth2:${secrets.people["olena.k"]}`).toString("base64")}`, GIT_TERMINAL_PROMPT: "0" };
      const clone = execFileSync("mktemp", ["-d"], { encoding: "utf8" }).trim();
      execFileSync("git", ["clone", "-q", `${URL_}/shop/product-specs.git`, clone], { env, stdio: "pipe" });
      const saver = createSaver({ root: clone, identity: { name: "Olena K.", email: "olena.k@example.com" }, env });
      const until = async (s: Save, state: Save["state"]) => {
        let now = s;
        for (let i = 0; i < 60 && now.state !== state; i++) {
          await wait(5000);
          now = saver.refresh().find((x) => x.branch === s.branch)!;
        }
        return now;
      };
      try {
        const ok = saver.save({ user: "olena.k", label: "spec", title: "Spec from the site", build: () => [{ path: "docs/features/bulk-order-export/spec.md", next: `# Bulk order export\n\nSaved from the site ${stamp}.\n` }] });
        expect(ok.mr?.url).toMatch(/\/-\/merge_requests\/\d+$/);
        expect((await until(ok, "merged")).state).toBe("merged");

        // The site checks first; this save skips that check, as an older hub might.
        const bad = saver.save({ user: "olena.k", label: "config", title: "Config from the site", build: (main) => [{ path: ".hub/config.yaml", next: `${main.read(".hub/config.yaml")}# site ${stamp}\n` }] });
        const refused = await until(bad, "refused");
        expect(refused.state).toBe("refused");
        expect(refused.findings?.[0]).toMatchObject({ path: ".hub/config.yaml", reason: expect.stringMatching(/No role of olena.k/) });
        const id = await specsId();
        expect((await root.mergeRequest(id, bad.mr!.iid)).state).toBe("closed");
      } finally {
        execFileSync("rm", ["-rf", clone]);
      }
    }, 720_000);

    it("does not merge a change whose pipeline was skipped with [skip ci]", async () => {
      const id = await specsId();
      const gl = as("olena.k");
      const config = (await root.file(id, ".hub/config.yaml", "main"))!;
      const branch = `skip-${stamp}`;
      await gl.commit(id, branch, "Change the config [skip ci]", [{ action: "update", file_path: ".hub/config.yaml", content: `${config}# skip ${stamp}\n` }], "main");
      const mr = await gl.createMergeRequest(id, branch, "main", "Change the config [skip ci]", "");
      let merged = false;
      try {
        await gl.autoMerge(id, mr.iid, () => wait(1000));
        await wait(10_000);
        merged = (await root.mergeRequest(id, mr.iid)).state === "merged";
      } catch {
        merged = false;
      }
      await root.updateMergeRequest(id, mr.iid, { state_event: "close" }).catch(() => undefined);
      expect(merged).toBe(false);
    }, 180_000);

    it("refuses a direct push to main, even by the admin", async () => {
      const id = await specsId();
      await expect(owner.commit(id, "main", "direct", [{ action: "create", file_path: `direct-${stamp}.txt`, content: "x" }])).rejects.toThrow(/403|protected|not allowed/i);
    }, 60_000);
  });

  it("runs hub-report in a team pipeline and publishes the snapshot to hub-state (claim 12)", async () => {
    const be = (await root.project("shop/backend"))!;
    // A feature in the backend repository, then the team lead merges the hub-report merge request.
    if (!(await root.file(be.id, "docs/features/bulk-order-export/tasks.json", "main")))
      await root.commit(be.id, "main", "tasks", [
        { action: "create", file_path: "docs/features/bulk-order-export/tasks.json", content: JSON.stringify({ slug: "bulk-order-export", tasks: [{ id: "T1", title: "export_jobs migration", layer: "migration", deps: [], acs: ["AC-01"] }] }) },
        { action: "create", file_path: "docs/features/bulk-order-export/tasks/tracker.md", content: "| # | Task | Layer | Owner | Estimate | Blocked by | Status |\n|---|---|---|---|---|---|---|\n| T1 | export_jobs migration | migration | taras.m | S | — | in_progress |\n" },
      ]);
    const mr = (await root.openMergeRequests(be.id, "sdlc-hub/hub-report"))[0];
    if (mr) {
      const res = await fetch(`${URL_}/api/v4/projects/${be.id}/merge_requests/${mr.iid}/merge`, { method: "PUT", headers: { "PRIVATE-TOKEN": secrets.rootToken } });
      expect(res.ok, await res.text()).toBe(true);
    }
    const specs = (await root.project("shop/product-specs"))!;
    let snap: string | null = null;
    for (let i = 0; i < 60 && !snap; i++) {
      snap = await root.file(specs.id, "features/bulk-order-export/teams/backend.json", "hub-state");
      if (!snap) await wait(5000);
    }
    expect(snap, "the hub-report job did not publish within 5 minutes").not.toBeNull();
    expect(parseTeamSnapshot(snap!, "backend.json").value).toMatchObject({ team: "backend", slug: "bulk-order-export", tracker: [{ id: "T1", status: "in_progress" }] });
  }, 360_000);

  it("records each team pipeline's result for the autotests gate: green on main, red on a feature branch (claim 18)", async () => {
    const specs = (await root.project("shop/product-specs"))!;
    const h = { "PRIVATE-TOKEN": secrets.rootToken };
    const waitFor = async (team: string, pipeline: number) => {
      const name = `ci-${team}-${pipeline}.json`;
      for (let i = 0; i < 72; i++) {
        const text = await root.file(specs.id, `features/bulk-order-export/tests/${name}`, "hub-state");
        if (text) return parseTestRun(text, name).value;
        await wait(5000);
      }
      return undefined;
    };
    // The pipeline of one commit: GitLab cancels an older pipeline of the same branch, so "the newest" may not run.
    const pipelineOf = async (projectId: number, sha: string) => {
      for (let i = 0; i < 24; i++) {
        const p = (await fetch(`${URL_}/api/v4/projects/${projectId}/pipelines?sha=${sha}&per_page=1`, { headers: h }).then((r) => r.json())) as { id: number }[];
        if (p[0]) return p[0].id;
        await wait(5000);
      }
      throw new Error(`no pipeline for ${sha}`);
    };

    // Green: backend has no CI of its own, so the hub job is its pipeline, which counts as passed.
    const be = (await root.project("shop/backend"))!;
    const touch = await root.commit(be.id, "main", "touch", [{ action: (await root.file(be.id, "touch.txt", "main")) === null ? "create" : "update", file_path: "touch.txt", content: `${Date.now()}\n` }]);
    expect(await waitFor("backend", await pipelineOf(be.id, touch.id))).toMatchObject({ source: "ci", team: "backend", result: "passed" });

    // Red: web-admin has CI of its own. Its lead merges the hub job, then a feature branch with a failing test runs:
    // hub-tests-failed records it, and the hub's job leaves the pipeline as red as the team's test made it.
    const web = (await root.project("shop/web-admin"))!;
    const mr = (await root.openMergeRequests(web.id, "sdlc-hub/hub-report"))[0];
    if (mr) {
      for (let i = 0; i < 20; i++) {
        const r = await fetch(`${URL_}/api/v4/projects/${web.id}/merge_requests/${mr.iid}/merge`, { method: "PUT", headers: h });
        if (r.ok) break;
        await wait(3000);
      }
    }
    const branch = "feat/bulk-order-export";
    if (await root.branch(web.id, branch)) await fetch(`${URL_}/api/v4/projects/${web.id}/repository/branches/${encodeURIComponent(branch)}`, { method: "DELETE", headers: h });
    const ci = (await root.file(web.id, ".gitlab-ci.yml", "main"))!;
    const failing = await root.commit(
      web.id,
      branch,
      "Export dialog, with a failing test",
      [
        { action: "update", file_path: ".gitlab-ci.yml", content: `${ci}unit-tests:\n  stage: test\n  script: [exit 1]\n` },
        { action: "create", file_path: "docs/features/bulk-order-export/tasks.json", content: JSON.stringify({ slug: "bulk-order-export", tasks: [{ id: "T1", title: "ui: export dialog", layer: "ui", deps: [], acs: ["AC-01"] }] }) },
      ],
      "main",
    );
    const pipeline = await pipelineOf(web.id, failing.id);
    expect(await waitFor("web", pipeline)).toMatchObject({ source: "ci", team: "web", result: "failed", ref: expect.stringMatching(/^feat\/bulk-order-export@/) });
    const jobs = (await fetch(`${URL_}/api/v4/projects/${web.id}/pipelines/${pipeline}/jobs`, { headers: h }).then((r) => r.json())) as { name: string; status: string }[];
    expect(Object.fromEntries(jobs.map((j) => [j.name, j.status]))).toMatchObject({ "unit-tests": "failed", "hub-tests-failed": "success", "hub-tests-passed": "skipped" });
  }, 900_000);

  it("shows that HUB_STATE_TOKEN can push to any unprotected branch, not only hub-state (claim 13)", async () => {
    const group = (await root.group("shop"))!;
    const v = await fetch(`${URL_}/api/v4/groups/${group.id}/variables/HUB_STATE_TOKEN`, { headers: { "PRIVATE-TOKEN": secrets.rootToken } }).then((r) => r.json() as Promise<{ value: string }>);
    const header = `Authorization: Basic ${Buffer.from(`oauth2:${v.value}`).toString("base64")}`;
    const env = { ...process.env, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: header, GIT_TERMINAL_PROMPT: "0" };
    const tmp = execFileSync("mktemp", ["-d"], { encoding: "utf8" }).trim();
    const git = (...a: string[]) => execFileSync("git", a, { cwd: tmp, env, stdio: "pipe" });
    git("init", "-q", "-b", "claim-13");
    execFileSync("sh", ["-c", "echo x > x.txt"], { cwd: tmp });
    git("add", "x.txt");
    git("-c", "user.name=t", "-c", "user.email=t@x", "commit", "-q", "-m", "claim 13");
    let pushed = true;
    try {
      git("push", "-q", `${URL_}/shop/product-specs.git`, "HEAD:refs/heads/claim-13-check");
    } catch {
      pushed = false;
    }
    const specs = (await root.project("shop/product-specs"))!;
    await fetch(`${URL_}/api/v4/projects/${specs.id}/repository/branches/claim-13-check`, { method: "DELETE", headers: { "PRIVATE-TOKEN": secrets.rootToken } });
    execFileSync("rm", ["-rf", tmp]);
    expect(pushed).toBe(true); // the risk is real until main is protected in phase 2
  }, 60_000);
});
