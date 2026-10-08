import { describe, expect, it } from "vitest";
import { base, dir, SPEC } from "@sdlc-hub/fixtures";
import { approvedFile, awaitsSignoff, bugChange, contentHash, detectFeature, guard, loadProject, memorySource, parseBugFile, parseSignoffs, signoffChange } from "../src/index.ts";

const slug = "tasks-issues";
const F = dir(slug);
const files = { ...base(), [`${F}/spec.md`]: SPEC, [`${F}/.size`]: "M\n", [`${F}/.route`]: "full\n", [`${F}/screens.md`]: "# Screens\n", [`${F}/hub/feature.yaml`]: "title: T\nowner: olena.k\n" };
const specs = memorySource(files);
const project = loadProject(specs).value!;
const at = "2026-10-08T10:00:00Z";

describe("the file a sign-off approves", () => {
  it("is the step's own file in product-specs", () => {
    expect(approvedFile(project, specs, slug, "screens")).toBe(`${F}/screens.md`);
  });
  it("is the previous step's file when the gate is the step's only evidence (clarify approves spec.md)", () => {
    expect(approvedFile(project, specs, slug, "clarify")).toBe(`${F}/spec.md`);
  });
  it("is none for a step whose files live in the team repositories", () => {
    expect(approvedFile(project, specs, slug, "tasks")).toBeUndefined();
  });
});

describe("a sign-off from the site", () => {
  it("appends a pass with the approved file and its hash", () => {
    const c = signoffChange(project, specs, slug, "olena.k", { decision: "pass", step: "clarify" }, at);
    expect(c.path).toBe(`${F}/hub/signoffs.yaml`);
    expect(c.base).toBeUndefined();
    expect(parseSignoffs(c.next!, "s").value).toEqual([{ step: "clarify", user: "olena.k", at, file: `${F}/spec.md`, hash: contentHash(SPEC), decision: "pass" }]);
  });
  it("appends a return with its reason and the next cycle, keeping earlier entries byte for byte", () => {
    const first = signoffChange(project, specs, slug, "olena.k", { decision: "return", step: "clarify", reason: "AC-01 is vague" }, at);
    const later = memorySource({ ...files, [first.path]: first.next! });
    const second = signoffChange(project, later, slug, "olena.k", { decision: "return", step: "clarify", reason: "Still vague" }, "2026-10-09T10:00:00Z");
    expect(second.next!.startsWith(first.next!)).toBe(true);
    expect(parseSignoffs(second.next!, "s").value!.map((e) => [e.decision, e.cycle, e.reason])).toEqual([
      ["return", 1, "AC-01 is vague"],
      ["return", 2, "Still vague"],
    ]);
  });
  it("is a change the guard accepts from the gate owner and refuses from anyone else", () => {
    const ctx = { config: project.config, roles: project.roles, flow: project.flow, feature: (s: string) => specs.read(`docs/features/${s}/hub/feature.yaml`) };
    expect(guard({ author: "olena.k", pushers: [], changes: [signoffChange(project, specs, slug, "olena.k", { decision: "pass", step: "clarify" }, at)] }, ctx).ok).toBe(true);
    expect(guard({ author: "maksym.d", pushers: [], changes: [signoffChange(project, specs, slug, "maksym.d", { decision: "pass", step: "clarify" }, at)] }, ctx).ok).toBe(false);
  });
  it("needs a reason for a return", () => {
    expect(() => signoffChange(project, specs, slug, "olena.k", { decision: "return", step: "clarify", reason: " " }, at)).toThrow(/reason/);
  });
});

describe("a gate that waits for its sign-off", () => {
  const { [`${F}/screens.md`]: _screens, ...early } = files;
  const view = { specs: memorySource(early), hubState: null, teamClone: () => null, now: at };
  it("is clarify once the spec is written, because the sign-off is its only evidence", () => {
    const state = detectFeature(project, view, slug);
    expect(awaitsSignoff(project, state, "clarify")).toBe(true);
    expect(awaitsSignoff(project, state, "specify")).toBe(false); // no gate
    expect(awaitsSignoff(project, state, "epic")).toBe(false); // epic waits for clarify first
  });
});

describe("a bug filed from the plugin", () => {
  const withBugs = memorySource({ ...files, [`${F}/hub/bugs/BUG-0012.md`]: "---\nid: BUG-0012\n---\n", "docs/features/other/hub/bugs/BUG-0041.md": "---\nid: BUG-0041\n---\n" });
  it("takes the next free number across all features and passes the guard for QA", () => {
    const c = bugChange(withBugs, slug, { title: "Counter does not go down", ac: "AC-01", platforms: ["web"], team: "web", severity: "high", body: "Close a task: the counter stays." }, "iryna.s", "verify");
    expect(c.path).toBe(`${F}/hub/bugs/BUG-0042.md`);
    const parsed = parseBugFile(c.next!, c.path);
    expect(parsed.issues).toEqual([]);
    expect(parsed.value!.front).toMatchObject({ id: "BUG-0042", status: "open", found_by: "iryna.s", found_in: "verify", team: "web", severity: "high" });
    const ctx = { config: project.config, roles: project.roles, flow: project.flow, feature: () => undefined };
    expect(guard({ author: "iryna.s", pushers: [], changes: [c] }, ctx).ok).toBe(true);
    expect(guard({ author: "olena.k", pushers: [], changes: [c] }, ctx).ok).toBe(false);
  });
  it("refuses a bug that would not be valid", () => {
    expect(() => bugChange(withBugs, slug, { title: "", team: "web", severity: "high" }, "iryna.s")).toThrow(/title/i);
    expect(() => bugChange(withBugs, slug, { title: "x", team: "nope", severity: "high" }, "iryna.s", undefined, ["web"])).toThrow(/team/i);
  });
});
