import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { refusalPath } from "@sdlc-hub/core";
import { createSaver, gitlabPushOptions, Pending } from "../src/index.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));
const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x", GIT_CONFIG_GLOBAL: "/dev/null" };
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, env, encoding: "utf8" }).trim();
const tmp = (p: string) => {
  const d = mkdtempSync(join(tmpdir(), p));
  temp.push(d);
  return d;
};

/** A remote product-specs with main and hub-state, and a person's clone of it. */
function setup() {
  const remote = tmp("hub-remote-");
  git(remote, "init", "-q", "--bare", "-b", "main");
  git(remote, "config", "receive.advertisePushOptions", "true");
  const seed = tmp("hub-seed-");
  git(seed, "init", "-q", "-b", "main");
  mkdirSync(join(seed, "docs"), { recursive: true });
  writeFileSync(join(seed, "docs/spec.md"), "# Spec\n");
  git(seed, "add", ".");
  git(seed, "commit", "-q", "-m", "seed");
  git(seed, "push", "-q", remote, "main", "main:hub-state");
  const clone = tmp("hub-clone-");
  git(clone, "clone", "-q", remote, ".");
  return { remote, clone };
}

/** What GitLab does when the merge request merges: a merge commit on main. */
function mergeOnRemote(remote: string, branch: string) {
  const w = tmp("hub-merge-");
  git(w, "clone", "-q", remote, ".");
  git(w, "fetch", "-q", "origin", branch);
  git(w, "merge", "-q", "--no-ff", "-m", `Merge ${branch}`, "FETCH_HEAD");
  git(w, "push", "-q", "origin", "main", `:${branch}`);
}

describe("saving from the site", () => {
  it("commits in its own worktree as the person, pushes a branch and is pending until main has it", async () => {
    const { remote, clone } = setup();
    writeFileSync(join(clone, "docs/spec.md"), "# My unsaved edit\n"); // the checkout the assistant works in
    const saver = createSaver({ root: clone, identity: { name: "Olena K.", email: "olena.k@example.com" }, now: () => new Date("2026-10-08T10:00:00Z") });
    const s = await saver.save({ user: "olena.k", label: "sign off clarify", title: "Sign off clarify", build: (main) => [{ path: "docs/signoffs.yaml", next: `- step: clarify # on top of ${main.read("docs/spec.md")!.trim()}\n` }] });
    expect(s).toMatchObject({ state: "pending", branch: "hub/olena.k/sign-off-clarify-20261008100000", paths: ["docs/signoffs.yaml"] });
    expect(readFileSync(join(clone, "docs/spec.md"), "utf8")).toBe("# My unsaved edit\n");
    expect(git(clone, "status", "--porcelain")).toBe("M docs/spec.md");
    expect(git(remote, "show", `${s.branch}:docs/signoffs.yaml`)).toBe("- step: clarify # on top of # Spec");
    expect(git(remote, "log", "-1", "--format=%an <%ae>", s.branch)).toBe("Olena K. <olena.k@example.com>");

    expect(saver.refresh()[0]!.state).toBe("pending");
    mergeOnRemote(remote, s.branch);
    expect(saver.refresh()[0]!.state).toBe("merged");
  });

  it("shows a refusal that hub-guard recorded in hub-state", async () => {
    const { remote, clone } = setup();
    const saver = createSaver({ root: clone, identity: { name: "Olena K.", email: "olena.k@example.com" }, now: () => new Date("2026-10-08T11:00:00Z") });
    const s = await saver.save({ user: "olena.k", label: "config", title: "Change config", build: () => [{ path: ".hub/config.yaml", next: "x: 1\n" }] });
    const w = tmp("hub-guardjob-");
    git(w, "clone", "-q", "-b", "hub-state", remote, ".");
    const path = join(w, refusalPath(s.branch));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ branch: s.branch, mr: 4, author: "olena.k", sha: s.sha, at: "2026-10-08T11:01:00Z", findings: [{ user: "olena.k", path: ".hub/config.yaml", reason: "No role of olena.k (po) may change .hub/config.yaml" }] }));
    git(w, "add", ".");
    git(w, "commit", "-q", "-m", "refused");
    git(w, "push", "-q", "origin", "hub-state", `:${s.branch}`);
    const [r] = saver.refresh();
    expect(r).toMatchObject({ state: "refused", findings: [{ path: ".hub/config.yaml" }] });
  });

  it("shows the warnings of advisory mode on a save that merged anyway", async () => {
    const { remote, clone } = setup();
    const saver = createSaver({ root: clone, identity: { name: "Daria L.", email: "daria.l@example.com" }, now: () => new Date("2026-10-09T11:00:00Z") });
    const s = await saver.save({ user: "daria.l", label: "spec", title: "Spec", build: () => [{ path: "docs/spec.md", next: "# By the designer\n" }] });
    const w = tmp("hub-guardjob-");
    git(w, "clone", "-q", "-b", "hub-state", remote, ".");
    const path = join(w, refusalPath(s.branch));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ branch: s.branch, mr: 5, advisory: true, author: "daria.l", sha: s.sha, at: "2026-10-09T11:01:00Z", findings: [{ user: "daria.l", path: "docs/spec.md", reason: "No role of daria.l (designer) may change docs/spec.md" }] }));
    git(w, "add", ".");
    git(w, "commit", "-q", "-m", "warnings");
    git(w, "push", "-q", "origin", "hub-state");
    expect(saver.refresh()[0]).toMatchObject({ state: "pending", warnings: [{ path: "docs/spec.md" }] });
    mergeOnRemote(remote, s.branch);
    expect(saver.refresh()[0]).toMatchObject({ state: "merged", warnings: [{ path: "docs/spec.md" }] });
  });

  it("pushes to a remote named by a relative path, as git resolves it from the checkout", async () => {
    const { remote, clone } = setup();
    git(clone, "remote", "set-url", "origin", relative(clone, remote));
    const saver = createSaver({ root: clone, identity: { name: "O", email: "o@x" } });
    const s = await saver.save({ user: "olena.k", label: "x", title: "x", build: () => [{ path: "docs/x.md", next: "x\n" }] });
    expect(git(remote, "show", `${s.branch}:docs/x.md`)).toBe("x");
  });

  it("keeps the merge request link GitLab prints", async () => {
    const { remote, clone } = setup();
    writeFileSync(join(remote, "hooks/post-receive"), "#!/bin/sh\necho 'View merge request for hub/x:' >&2\necho '  http://gl.test/shop/product-specs/-/merge_requests/14' >&2\n", { mode: 0o755 });
    const saver = createSaver({ root: clone, identity: { name: "O", email: "o@x" } });
    const s = await saver.save({ user: "olena.k", label: "x", title: "x", build: () => [{ path: "docs/x.md", next: "x\n" }] });
    expect(s.mr).toEqual({ iid: 14, url: "http://gl.test/shop/product-specs/-/merge_requests/14" });
  });

  it("keeps its records out of the repository and across restarts", async () => {
    const { clone } = setup();
    const a = createSaver({ root: clone, identity: { name: "O", email: "o@x" }, now: () => new Date("2026-10-08T12:00:00Z") });
    await a.save({ user: "olena.k", label: "x", title: "x", build: () => [{ path: "docs/x.md", next: "x\n" }] });
    expect(git(clone, "status", "--porcelain")).toBe("");
    expect(createSaver({ root: clone, identity: { name: "O", email: "o@x" } }).list()).toHaveLength(1);
  });

  it("refuses a second change to a file while the person's first one still waits to merge", async () => {
    const { clone } = setup();
    const saver = createSaver({ root: clone, identity: { name: "O", email: "o@x" }, now: () => new Date("2026-10-08T13:00:00Z") });
    await saver.save({ user: "olena.k", label: "a", title: "a", build: () => [{ path: "docs/x.md", next: "a\n" }] });
    await expect(saver.save({ user: "olena.k", label: "b", title: "b", build: () => [{ path: "docs/x.md", next: "b\n" }] })).rejects.toThrow(Pending);
    // Another file, or another person, is fine.
    await saver.save({ user: "olena.k", label: "c", title: "c", build: () => [{ path: "docs/y.md", next: "c\n" }] });
    await saver.save({ user: "taras.m", label: "d", title: "d", build: () => [{ path: "docs/x.md", next: "d\n" }] });
  });

  it("refuses a change that changes nothing", async () => {
    const { clone } = setup();
    const saver = createSaver({ root: clone, identity: { name: "O", email: "o@x" } });
    await expect(saver.save({ user: "olena.k", label: "x", title: "x", build: () => [{ path: "docs/spec.md", next: "# Spec\n" }] })).rejects.toThrow(/nothing to save/i);
  });

  it("opens the pull request itself where push options do not (GitHub), and records it", async () => {
    const { remote, clone } = setup();
    const asked: unknown[] = [];
    const saver = createSaver({
      root: clone,
      identity: { name: "O", email: "o@x" },
      pushOptions: () => [],
      propose: async (p) => (asked.push(p), { iid: 7, url: "https://github.com/shop/product-specs/pull/7" }),
      now: () => new Date("2026-10-09T10:00:00Z"),
    });
    const s = await saver.save({ user: "olena.k", label: "x", title: "Sign off clarify", build: () => [{ path: "docs/x.md", next: "x\n" }] });
    expect(asked).toEqual([{ branch: s.branch, title: "Sign off clarify", target: "main" }]);
    expect(s.mr).toEqual({ iid: 7, url: "https://github.com/shop/product-specs/pull/7" });
    expect(git(remote, "branch", "--list", s.branch)).toContain(s.branch);
  });

  it("takes the pushed branch back when the pull request cannot be opened", async () => {
    const { remote, clone } = setup();
    const saver = createSaver({ root: clone, identity: { name: "O", email: "o@x" }, pushOptions: () => [], propose: () => Promise.reject(new Error("GitHub answered 403")) });
    await expect(saver.save({ user: "olena.k", label: "x", title: "x", build: () => [{ path: "docs/x.md", next: "x\n" }] })).rejects.toThrow(/taken back: GitHub answered 403/);
    expect(git(remote, "branch", "--list", "hub/*")).toBe("");
    expect(saver.list()).toEqual([]);
  });

  it("asks GitLab for a merge request that merges itself", () => {
    expect(gitlabPushOptions("Sign off clarify", "main")).toEqual([
      "-o", "merge_request.create",
      "-o", "merge_request.target=main",
      "-o", "merge_request.merge_when_pipeline_succeeds",
      "-o", "merge_request.remove_source_branch",
      "-o", "merge_request.title=Sign off clarify",
    ]);
  });
});
