import { describe, expect, it } from "vitest";
import { fixtures, type Files } from "@sdlc-hub/fixtures";
import { detectFeature, guard, loadProject, memorySource, platformsOf, readCriteria, verdictChange, verificationMatrix, type FileSource } from "../src/index.ts";

const f = fixtures["demo"]!;
const clones = new Map<string, FileSource>(Object.entries(f.teams ?? {}).map(([id, files]: [string, Files]) => [id, memorySource(files)]));
const view = (main: Files) => ({ specs: memorySource(main), hubState: f.hubState ? memorySource(f.hubState) : null, teamClone: (id: string) => clones.get(id) ?? null, now: f.now });
const project = loadProject(memorySource(f.main)).value!;
const slug = "tasks-issues";
const platforms = platformsOf(project.config, detectFeature(project, view(f.main), slug));
const at = "2026-10-08T10:00:00Z";

describe("the criteria of a spec", () => {
  it("are read in both list styles, as written by hand", () => {
    expect(readCriteria("## 5. Acceptance criteria\n\n- AC-01: The thing works.\n- **AC-02** Another.\n- [x] per AC-02, not a criterion\n")).toEqual([
      { id: "AC-01", text: "The thing works." },
      { id: "AC-02", text: "Another." },
    ]);
  });
});

describe("QA's verdicts", () => {
  it("are kept per criterion and client platform; the feature's backend is not a platform", () => {
    expect(platforms).toEqual(["web", "android", "ios"]);
    const m = verificationMatrix(memorySource(f.main), slug, platforms);
    expect(m.criteria.map((c) => c.id)).toEqual(["AC-01", "AC-02", "AC-03", "AC-04", "AC-05"]);
    expect(m.complete).toBe(false);
    // The demo's cycle 1: AC-04 fails on every client; AC-02 on iOS failed, then passed, and the newest counts.
    expect(m.open).toEqual(["AC-04 on web: fail", "AC-04 on android: fail", "AC-04 on ios: fail"]);
  });
  it("are appended, the newest per cell wins, and the matrix is complete when everything passes or does not apply", () => {
    const all = ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05"].flatMap((ac) => platforms.map((platform) => ({ ac, platform, verdict: "pass" as const })));
    const first = verdictChange(memorySource(f.main), slug, platforms, [...all.slice(1), { ac: "AC-01", platform: "web", verdict: "fail", bugs: ["BUG-0013"] }], "iryna.s", at);
    let main = { ...f.main, [first.path]: first.next! };
    expect(verificationMatrix(memorySource(main), slug, platforms).open).toEqual(["AC-01 on web: fail"]);
    const retest = verdictChange(memorySource(main), slug, platforms, [{ ac: "AC-01", platform: "web", verdict: "pass" }], "iryna.s", "2026-10-09T10:00:00Z");
    expect(retest.next!.startsWith(first.next!)).toBe(true);
    main = { ...main, [retest.path]: retest.next! };
    expect(verificationMatrix(memorySource(main), slug, platforms).complete).toBe(true);
  });
  it("refuses an unknown criterion or platform, and a fail without its bug", () => {
    const change = (v: object) => () => verdictChange(memorySource(f.main), slug, platforms, [v as never], "iryna.s", at);
    expect(change({ ac: "AC-99", platform: "web", verdict: "pass" })).toThrow(/not a criterion/);
    expect(change({ ac: "AC-01", platform: "backend", verdict: "pass" })).toThrow(/not a platform/);
    expect(change({ ac: "AC-01", platform: "web", verdict: "fail" })).toThrow(/name the bug/);
  });
  it("are QA's to write", () => {
    const c = verdictChange(memorySource(f.main), slug, platforms, [{ ac: "AC-01", platform: "web", verdict: "pass" }], "iryna.s", at);
    const ctx = { config: project.config, roles: project.roles, flow: project.flow, feature: () => undefined };
    expect(guard({ author: "iryna.s", pushers: [], changes: [c] }, ctx).ok).toBe(true);
    expect(guard({ author: "petro.v", pushers: [], changes: [c] }, ctx).ok).toBe(false);
  });
});
