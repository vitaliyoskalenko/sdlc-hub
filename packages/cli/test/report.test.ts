import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseTeamSnapshot, parseTestRun } from "@sdlc-hub/core";
import { report, reportTests } from "../src/report.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));
const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x", GIT_CONFIG_GLOBAL: "/dev/null" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();

/** A bare product-specs with a hub-state branch, and a team repository with one feature. */
function repos() {
  const dir = mkdtempSync(join(tmpdir(), "hub-report-"));
  temp.push(dir);
  const specs = join(dir, "product-specs.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", specs]);
  const seed = join(dir, "seed");
  mkdirSync(seed);
  git(seed, "init", "-q", "-b", "hub-state");
  writeFileSync(join(seed, "README.md"), "# hub-state\n");
  git(seed, "add", ".");
  git(seed, "commit", "-q", "-m", "start");
  git(seed, "push", "-q", specs, "hub-state");
  const team = join(dir, "web-admin");
  mkdirSync(join(team, "docs/features/bulk-order-export/tasks"), { recursive: true });
  git(team, "init", "-q", "-b", "main");
  writeFileSync(join(team, "docs/features/bulk-order-export/tasks.json"), JSON.stringify({ slug: "bulk-order-export", tasks: [{ id: "T1", title: "ui: export dialog", layer: "ui", deps: [], acs: ["AC-01"] }] }));
  writeFileSync(join(team, "docs/features/bulk-order-export/tasks/tracker.md"), "| # | Task | Layer | Owner | Estimate | Blocked by | Status |\n|---|---|---|---|---|---|---|\n| T1 | ui: export dialog | ui | p | S | backend:T2 | blocked |\n");
  git(team, "add", ".");
  git(team, "commit", "-q", "-m", "tasks");
  return { specs, team };
}

const read = (specs: string, path: string) => execFileSync("git", ["--git-dir", specs, "show", `hub-state:${path}`], { encoding: "utf8" });

describe("hub report", () => {
  it("publishes a valid snapshot of each feature to hub-state", () => {
    const { specs, team } = repos();
    const r = report({ team: "web", cwd: team, specsUrl: specs, push: true, env: { CI_COMMIT_REF_NAME: "feat/bulk-order-export", CI_COMMIT_SHA: "abc123", CI_OPEN_MERGE_REQUESTS: "shop/web-admin!12" }, now: "2026-10-08T10:00:00Z" });
    expect(r.slugs).toEqual(["bulk-order-export"]);
    const snap = parseTeamSnapshot(read(specs, "features/bulk-order-export/teams/web.json"), "web.json");
    expect(snap.issues).toEqual([]);
    expect(snap.value).toMatchObject({ team: "web", source_commit: "abc123", mr: { iid: 12, state: "opened" } });
    expect(snap.value?.tracker?.[0]?.blocked_by).toEqual(["backend:T2"]);
  });

  it("reports only the feature of a feat/<slug> branch", () => {
    const { specs, team } = repos();
    mkdirSync(join(team, "docs/features/other"), { recursive: true });
    writeFileSync(join(team, "docs/features/other/spec.md"), "# other\n");
    const r = report({ team: "web", cwd: team, specsUrl: specs, push: false, env: { CI_COMMIT_REF_NAME: "feat/bulk-order-export" }, now: "2026-10-08T10:00:00Z" });
    expect(r.slugs).toEqual(["bulk-order-export"]);
  });

  it("speaks on main only for the features that have no branch of their own, and never with a merge request", () => {
    const { specs, team } = repos();
    mkdirSync(join(team, "docs/features/other"), { recursive: true });
    writeFileSync(join(team, "docs/features/other/spec.md"), "# other\n");
    const r = report({ team: "web", cwd: team, specsUrl: specs, push: true, env: { CI_COMMIT_REF_NAME: "main", CI_DEFAULT_BRANCH: "main", CI_COMMIT_SHA: "abc123" }, now: "2026-10-08T10:00:00Z", branches: () => ["main", "feat/bulk-order-export"] });
    expect(r.slugs).toEqual(["other"]);
    expect(parseTeamSnapshot(read(specs, "features/other/teams/web.json"), "web.json").value?.mr).toBeNull();
  });

  it("says nothing from main when it cannot learn the branches: a wrong snapshot would replace the branch's", () => {
    const { specs, team } = repos();
    const r = report({ team: "web", cwd: team, specsUrl: specs, push: true, env: { CI_COMMIT_REF_NAME: "main", CI_DEFAULT_BRANCH: "main" }, now: "2026-10-08T10:00:00Z", branches: () => null });
    expect(r).toMatchObject({ slugs: [], pushed: false });
  });

  it("says nothing from any other branch, such as the merge request of shared files", () => {
    const { specs, team } = repos();
    const r = report({ team: "web", cwd: team, specsUrl: specs, push: true, env: { CI_COMMIT_REF_NAME: "hub/fanout", CI_DEFAULT_BRANCH: "main", CI_OPEN_MERGE_REQUESTS: "shop/web-admin!2" }, now: "2026-10-08T10:00:00Z" });
    expect(r).toMatchObject({ slugs: [], pushed: false });
  });

  it("does not commit when nothing changed", () => {
    const { specs, team } = repos();
    const opts = { team: "web", cwd: team, specsUrl: specs, push: true, env: { CI_COMMIT_REF_NAME: "main", CI_COMMIT_SHA: "abc123" }, now: "2026-10-08T10:00:00Z", branches: () => ["main"] };
    expect(report(opts).pushed).toBe(true);
    const before = execFileSync("git", ["--git-dir", specs, "rev-parse", "hub-state"], { encoding: "utf8" });
    expect(report({ ...opts, now: "2026-10-08T11:00:00Z" }).pushed).toBe(false);
    expect(execFileSync("git", ["--git-dir", specs, "rev-parse", "hub-state"], { encoding: "utf8" })).toBe(before);
  });
});

describe("hub report and waits on other teams", () => {
  it("keeps a wait's start from report to report, and records it when it ends", () => {
    const { specs, team } = repos();
    const opts = { team: "web", cwd: team, specsUrl: specs, push: true, env: { CI_COMMIT_REF_NAME: "main", CI_COMMIT_SHA: "abc123" }, branches: () => ["main"] };
    report({ ...opts, now: "2026-10-08T10:00:00Z" });
    report({ ...opts, now: "2026-10-09T10:00:00Z" });
    const path = "features/bulk-order-export/teams/web.json";
    expect(parseTeamSnapshot(read(specs, path), "web.json").value?.waits).toEqual([{ task: "T1", on: ["backend:T2"], since: "2026-10-08T10:00:00Z" }]);
    writeFileSync(join(team, "docs/features/bulk-order-export/tasks/tracker.md"), "| # | Task | Layer | Owner | Estimate | Blocked by | Status |\n|---|---|---|---|---|---|---|\n| T1 | ui: export dialog | ui | p | S | backend:T2 | in_progress |\n");
    git(team, "commit", "-qam", "unblocked");
    report({ ...opts, now: "2026-10-10T16:00:00Z" });
    const snap = parseTeamSnapshot(read(specs, path), "web.json").value!;
    expect(snap.waits).toEqual([]);
    expect(snap.waited).toEqual([{ task: "T1", on: ["backend:T2"], from: "2026-10-08T10:00:00Z", to: "2026-10-10T16:00:00Z" }]);
  });
});

describe("hub report --tests", () => {
  it("records the result of the feature branch's pipeline, labelled ci, with its address and commit", () => {
    const { specs, team } = repos();
    const r = reportTests({ team: "web", cwd: team, specsUrl: specs, result: "failed", env: { CI_COMMIT_REF_NAME: "feat/bulk-order-export", CI_COMMIT_SHA: "abc1234def", CI_PIPELINE_ID: "77", CI_PIPELINE_URL: "https://gl/shop/web-admin/-/pipelines/77" }, now: "2026-10-08T10:00:00Z" });
    expect(r).toEqual({ slugs: ["bulk-order-export"], pushed: true });
    const run = parseTestRun(git(specs, "show", "hub-state:features/bulk-order-export/tests/ci-web-77.json"), "t");
    expect(run.value).toEqual({ source: "ci", team: "web", result: "failed", at: "2026-10-08T10:00:00Z", url: "https://gl/shop/web-admin/-/pipelines/77", ref: "feat/bulk-order-export@abc1234" });
  });
  it("records nothing from main or another branch: their tests are not the feature's", () => {
    const { specs, team } = repos();
    for (const branch of ["main", "hub/fanout"]) expect(reportTests({ team: "web", cwd: team, specsUrl: specs, result: "passed", env: { CI_COMMIT_REF_NAME: branch, CI_DEFAULT_BRANCH: "main", CI_PIPELINE_ID: "78" }, now: "2026-10-08T10:00:00Z" })).toEqual({ slugs: [], pushed: false });
  });
});
