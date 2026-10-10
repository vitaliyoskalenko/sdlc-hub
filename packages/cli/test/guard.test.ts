import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { base } from "@sdlc-hub/fixtures";
import { GitHub, GitLab } from "@sdlc-hub/host";
import { formatFindings, guardRepo, mergeRequestPeople, pullRequestPeople, recordRefusal } from "../src/guard.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));
const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x", GIT_CONFIG_GLOBAL: "/dev/null" };
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, env, encoding: "utf8" }).trim();
const write = (root: string, files: Record<string, string>) => {
  for (const [p, t] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), t);
  }
};

/** product-specs at a base commit on main, and a branch with the merge request's changes. */
function repo(changes: Record<string, string>, remove: string[] = [], onMain: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "hub-guard-"));
  temp.push(dir);
  git(dir, "init", "-q", "-b", "main");
  write(dir, { ...base(), "docs/features/tasks-issues/spec.md": "# Spec\n", "docs/features/tasks-issues/hub/feature.yaml": "title: T\nowner: olena.k\n", ...onMain });
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "base");
  const baseSha = git(dir, "rev-parse", "HEAD");
  git(dir, "checkout", "-q", "-b", "save");
  write(dir, changes);
  for (const r of remove) git(dir, "rm", "-q", r);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--allow-empty", "-m", "change");
  return { dir, baseSha };
}

describe("hub guard on a merge request", () => {
  it("passes a change inside the author's role", async () => {
    const { dir, baseSha } = repo({ "docs/features/tasks-issues/spec.md": "# Spec v2\n" });
    const r = await guardRepo({ cwd: dir, baseSha, author: "olena.k", pushers: ["olena.k"] });
    expect(r).toEqual({ ok: true, findings: [] });
  });

  it("refuses a change outside the role, judged by roles.yaml on main, not the one in the merge request", async () => {
    // The merge request also tries to make its author an admin: the guard reads roles.yaml from the base.
    const roles = base()[".hub/roles.yaml"]!.replace("{ user: olena.k, name: Olena K., role: po }", "{ user: olena.k, name: Olena K., role: admin }");
    const { dir, baseSha } = repo({ ".hub/roles.yaml": roles, ".hub/config.yaml": "changed: true\n" });
    const r = await guardRepo({ cwd: dir, baseSha, author: "olena.k", pushers: ["olena.k"] });
    expect(r.ok).toBe(false);
    expect([...new Set(r.findings.map((f) => f.path))].sort()).toEqual([".hub/config.yaml", ".hub/roles.yaml"]);
  });

  it("counts a deletion and both sides of a rename", async () => {
    const del = repo({}, ["docs/features/tasks-issues/hub/feature.yaml"]);
    expect((await guardRepo({ cwd: del.dir, baseSha: del.baseSha, author: "daria.l", pushers: [] })).findings[0]?.path).toBe("docs/features/tasks-issues/hub/feature.yaml");
    const ren = repo({});
    git(ren.dir, "mv", "docs/features/tasks-issues/spec.md", "docs/features/tasks-issues/screens.md");
    git(ren.dir, "commit", "-q", "-m", "rename");
    const r = await guardRepo({ cwd: ren.dir, baseSha: ren.baseSha, author: "daria.l", pushers: [] });
    expect(r.ok).toBe(false); // the designer may write screens.md, not delete spec.md
  });
});

describe("the people of a merge request", () => {
  const pages: Record<string, unknown> = {
    "/projects/7/merge_requests/3": { iid: 3, source_branch: "hub/save-1", author: { username: "olena.k" } },
    "/projects/7/events?action=pushed&after=2026-10-06&per_page=100&page=1": [
      { author_username: "olena.k", created_at: "2026-10-07T10:00:00Z", push_data: { ref: "hub/save-1", ref_type: "branch" } },
      { author_username: "daria.l", created_at: "2026-10-07T11:00:00Z", push_data: { ref: "hub/save-1", ref_type: "branch" } },
      { author_username: "taras.m", created_at: "2026-10-07T11:00:00Z", push_data: { ref: "other", ref_type: "branch" } },
      { author_username: "petro.v", created_at: "2026-10-06T09:00:00Z", push_data: { ref: "hub/save-1", ref_type: "branch" } },
    ],
  };
  const fake = (async (url: string) => {
    const path = String(url).replace("https://gl.test/api/v4", "");
    return new Response(JSON.stringify(pages[path] ?? { message: "404 Not Found" }), { status: path in pages ? 200 : 404 });
  }) as typeof fetch;
  const gl = new GitLab("https://gl.test", "t", fake);

  it("names the author from the API and everyone who pushed to the branch since its base", async () => {
    const r = await mergeRequestPeople(gl, { CI_MERGE_REQUEST_IID: "3", CI_PROJECT_ID: "7", GITLAB_USER_LOGIN: "olena.k" }, "2026-10-07T00:00:00.000Z");
    expect(r).toEqual({ author: "olena.k", pushers: ["daria.l", "olena.k"] });
  });

  it("refuses to run outside a merge request pipeline", async () => {
    await expect(mergeRequestPeople(gl, {}, "2026-10-07T00:00:00Z")).rejects.toThrow(/merge request pipeline/);
  });

  it("in advisory mode (set on main) reports what breaks a rule as warnings and passes", async () => {
    const { dir, baseSha } = repo({ "docs/features/tasks-issues/spec.md": "# Spec by the designer\n" }, [], { ".hub/config.yaml": `${base()[".hub/config.yaml"]}guard:\n  mode: advisory\n` });
    const r = await guardRepo({ cwd: dir, baseSha, author: "daria.l", pushers: ["daria.l"] });
    expect(r).toMatchObject({ ok: false, advisory: true, findings: [{ user: "daria.l", path: "docs/features/tasks-issues/spec.md" }] });
    const text = formatFindings(r, "daria.l", ["daria.l"]);
    expect(text).toContain("hub-guard: passed with warnings (author daria.l)");
    expect(text).toContain("advisory");
  });

  it("explains a refusal path by path", () => {
    const text = formatFindings({ ok: false, findings: [{ user: "daria.l", path: ".hub/config.yaml", reason: "No role of daria.l (designer) may change .hub/config.yaml" }] }, "olena.k", ["daria.l", "olena.k"]);
    expect(text).toContain("refused (author olena.k; also pushed: daria.l)");
    expect(text).toContain("✗ .hub/config.yaml — No role of daria.l");
  });
});

describe("a refused save from the site", () => {
  it("is recorded in hub-state and its branch deleted, which closes the merge request", () => {
    const work = mkdtempSync(join(tmpdir(), "hub-refuse-"));
    const remote = mkdtempSync(join(tmpdir(), "hub-remote-"));
    temp.push(work, remote);
    git(remote, "init", "-q", "--bare", "-b", "main");
    git(work, "init", "-q", "-b", "main");
    write(work, { "README.md": "x\n" });
    git(work, "add", ".");
    git(work, "commit", "-q", "-m", "main");
    git(work, "push", "-q", remote, "main", "main:hub-state", "main:hub/olena.k/config-1");
    recordRefusal({ url: remote, token: "t", branch: "hub/olena.k/config-1", mr: 3, author: "olena.k", sha: "abcdef1", at: "2026-10-08T10:00:00Z", findings: [{ user: "olena.k", path: ".hub/config.yaml", reason: "No role" }], env });
    expect(JSON.parse(git(remote, "show", "hub-state:saves/olena.k/config-1.json"))).toMatchObject({ mr: 3, findings: [{ path: ".hub/config.yaml" }] });
    expect(git(remote, "branch", "--list", "hub/*")).toBe("");
  });

  it("in advisory mode is recorded as warnings, and the branch stays to merge", () => {
    const work = mkdtempSync(join(tmpdir(), "hub-refuse-"));
    const remote = mkdtempSync(join(tmpdir(), "hub-remote-"));
    temp.push(work, remote);
    git(remote, "init", "-q", "--bare", "-b", "main");
    git(work, "init", "-q", "-b", "main");
    write(work, { "README.md": "x\n" });
    git(work, "add", ".");
    git(work, "commit", "-q", "-m", "main");
    git(work, "push", "-q", remote, "main", "main:hub-state", "main:hub/daria.l/spec-1");
    recordRefusal({ url: remote, token: "t", branch: "hub/daria.l/spec-1", mr: 4, author: "daria.l", sha: "abcdef1", at: "2026-10-09T10:00:00Z", advisory: true, findings: [{ user: "daria.l", path: "docs/spec.md", reason: "No role" }], env });
    expect(JSON.parse(git(remote, "show", "hub-state:saves/daria.l/spec-1.json"))).toMatchObject({ advisory: true, findings: [{ path: "docs/spec.md" }] });
    expect(git(remote, "branch", "--list", "hub/*")).toContain("hub/daria.l/spec-1");
  });
});

describe("the people of a pull request on GitHub", () => {
  const fetcher = (async (url: string) => {
    const path = String(url).replace("https://api.github.com", "");
    const answers: Record<string, unknown> = {
      "/repos/shop/product-specs/activity?ref=refs%2Fheads%2Fhub%2Folena.k%2Fspec-1&activity_type=push&per_page=100&page=1": [{ actor: { login: "olena.k" } }, { actor: { login: "taras.m" } }],
      "/repos/shop/product-specs/activity?ref=refs%2Fheads%2Fhub%2Folena.k%2Fspec-1&activity_type=force_push&per_page=100&page=1": [],
    };
    return new Response(JSON.stringify(answers[path] ?? []), { status: 200 });
  }) as typeof fetch;
  it("names the author from the event and everyone who pushed from the repository's activity", async () => {
    const r = await pullRequestPeople(new GitHub("t", undefined, fetcher), { GITHUB_REPOSITORY: "shop/product-specs", GITHUB_ACTOR: "olena.k" }, { pull_request: { user: { login: "olena.k" }, head: { ref: "hub/olena.k/spec-1" }, number: 7 } });
    expect(r).toEqual({ author: "olena.k", pushers: ["olena.k", "taras.m"], branch: "hub/olena.k/spec-1", number: 7 });
  });
  it("refuses to run outside a pull request workflow", async () => {
    await expect(pullRequestPeople(new GitHub("t", undefined, fetcher), {}, {})).rejects.toThrow(/pull_request_target/);
  });
});

describe("hub guard and invalid files", () => {
  it("refuses a feature.yaml that does not load, even in advisory mode", async () => {
    const { dir, baseSha } = repo({ "docs/features/tasks-issues/hub/feature.yaml": "title: T\nowner: [olena.k\n" }, [], { ".hub/config.yaml": `${base()[".hub/config.yaml"]}guard:\n  mode: advisory\n` });
    const r = await guardRepo({ cwd: dir, baseSha, author: "maksym.d", pushers: ["maksym.d"] });
    expect(r.ok).toBe(false);
    expect(r.advisory).toBeUndefined();
    expect(r.findings[0]?.reason).toMatch(/Not a valid hub file/);
  });
});
