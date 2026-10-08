import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { detectFeature, listFeatures, loadProject, memorySource, type ProjectView } from "@sdlc-hub/core";
import { fixtures, materialize, type Fixture } from "@sdlc-hub/fixtures";
import { openProject } from "../src/index.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));

function onDisk(f: Fixture) {
  const dir = mkdtempSync(join(tmpdir(), "hub-git-"));
  temp.push(dir);
  return materialize(f, dir);
}

function memoryView(f: Fixture): ProjectView {
  const authors = (prefix: string) =>
    Object.fromEntries(Object.entries(f.authors ?? {}).flatMap(([k, v]) => (k.startsWith(prefix) ? [[k.slice(prefix.length), v]] : [])));
  return {
    specs: memorySource(f.main, authors("main/")),
    hubState: f.hubState ? memorySource(f.hubState, authors("hub-state/")) : null,
    teamClone: (t) => (f.teams?.[t] ? memorySource(f.teams[t]) : null),
    now: f.now,
  };
}

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

describe.each(["demo", "implement-blocked", "specify-running", "qa-return-cycle-2", "quick-route"])("fixture %s on disk", (name) => {
  const f = fixtures[name as keyof typeof fixtures]!;
  const { root } = onDisk(f);
  const project = openProject(root, { now: f.now });

  it("detects the same state as from memory", () => {
    const mem = memoryView(f);
    const memProject = loadProject(mem.specs).value!;
    expect(project.issues).toEqual([]);
    const slugs = listFeatures(project.view.specs);
    expect(slugs).toEqual(listFeatures(mem.specs));
    for (const slug of slugs) {
      const a = detectFeature(project.project!, project.view, slug);
      const b = detectFeature(memProject, mem, slug);
      // On disk every file has a git author; in memory only some do, so `by` is compared in its own tests.
      const shape = (s: typeof a) => ({ current: s.current, steps: s.steps.map((x) => [x.id, x.status, x.source ?? null]) });
      expect(shape(a), slug).toEqual(shape(b));
      expect(a.teams.map((t) => t.source), slug).toEqual(b.teams.map((t) => t.source));
    }
  });

  it("leaves the repository untouched", () => {
    const head = git(root, "rev-parse", "HEAD");
    openProject(root, { now: f.now }).view.specs.list("docs");
    expect(git(root, "status", "--porcelain")).toBe("");
    expect(git(root, "rev-parse", "HEAD")).toBe(head);
    expect(git(root, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
  });
});

describe("authors", () => {
  const f = fixtures["specify-running"]!;
  const { root } = onDisk(f);
  const { view } = openProject(root, { now: f.now });

  it("names the author of one line of the event log by their roles.yaml user", () => {
    expect(view.hubState?.author?.("features/bulk-import/events.jsonl#L1")).toBe("olena.k");
  });
  it("names the author of a file on main", () => {
    expect(view.specs.author?.(".hub/config.yaml")).toBe("nazar.t");
  });
});

describe("a repository without hub-state or clones", () => {
  it("reads main only", () => {
    const f = fixtures["clarify-signoff"]!;
    const { root } = onDisk(f);
    const { view } = openProject(root, { now: f.now });
    expect(view.hubState).toBeNull();
    expect(view.teamClone("web")).toBeNull();
    expect(view.specs.read("docs/features/returns-portal/.size")).toBe("L\n");
  });
});

describe("the demo on disk", () => {
  it("names the person on a running step from git blame of the event log", () => {
    const f = fixtures["demo"]!;
    const { root } = onDisk(f);
    const p = openProject(root, { now: f.now });
    const review = detectFeature(p.project!, p.view, "order-notes-fix").steps.find((s) => s.id === "review");
    expect(review).toMatchObject({ status: "running", by: "petro.v" });
  });
});

describe("git calls", () => {
  it("names the authors of every file with one git log per repository, and every event line with one blame per log", async () => {
    const { gitCalls, resetGitCalls } = await import("../src/index.ts");
    const f = fixtures["demo"]!;
    const { root } = onDisk(f);
    resetGitCalls();
    const p = openProject(root, { now: f.now });
    for (const slug of listFeatures(p.view.specs)) detectFeature(p.project!, p.view, slug);
    const calls = gitCalls();
    // main, hub-state and the one team clone with files: at most one `git log` each.
    expect(calls.log ?? 0).toBeLessThanOrEqual(3);
    // One events.jsonl in the demo.
    expect(calls.blame ?? 0).toBeLessThanOrEqual(1);
    // hub-state files are read in one batch.
    expect(calls.show ?? 0).toBe(0);
    expect(calls["cat-file"] ?? 0).toBeLessThanOrEqual(1);
  });
});
