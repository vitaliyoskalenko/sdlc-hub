// The install against a real GitLab CE: run e2e/gitlab/bootstrap.mjs first, then `npm run test:gitlab`.
// Skipped in `npm test`. It also checks open-items claims 3, 11, 12 and 13 on GitLab Free.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig, parseTeamSnapshot } from "@sdlc-hub/core";
import { GitLab } from "@sdlc-hub/host";
import { install, preflight, type SetupAnswers } from "../src/index.ts";

const URL_ = "http://localhost:8929";
const FILE = join(homedir(), ".sdlc-hub-test", "gitlab.json");
const enabled = process.env.HUB_GITLAB_IT === "1" && existsSync(FILE);
const secrets = enabled ? (JSON.parse(readFileSync(FILE, "utf8")) as { ownerToken: string; rootToken: string }) : { ownerToken: "", rootToken: "" };

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

const bundle = existsSync("packages/cli/dist/cli.mjs") ? readFileSync("packages/cli/dist/cli.mjs", "utf8") : "// hub bundle\n";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    const specs = (await owner.project("shop/product-specs"))!;
    const config = (await owner.file(specs.id, ".hub/config.yaml", "main"))!;
    expect(parseConfig(config, "c").issues).toEqual([]);
    expect(await owner.file(specs.id, "hub/package.json", "main")).toMatch(/"type": "module"/);
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
  }, 120_000);

  it("changes nothing on a second run", async () => {
    const r = await install(ANSWERS, owner, { hubBundle: bundle });
    expect(r.steps.map((s) => [s.id, s.state])).toEqual(r.steps.map((s) => [s.id, "skip"]));
  }, 120_000);

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
