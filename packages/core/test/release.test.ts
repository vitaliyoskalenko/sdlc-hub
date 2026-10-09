import { describe, expect, it } from "vitest";
import { base } from "@sdlc-hub/fixtures";
import { estimateChange, guard, validationChange, loadProject, memorySource, parseRelease, releaseChange, releaseView } from "../src/index.ts";

const slug = "tasks-issues";
const path = `docs/features/${slug}/hub/release.yaml`;
const project = loadProject(memorySource(base())).value!;
const ctx = { config: project.config, roles: project.roles, flow: project.flow, feature: () => undefined };
const at = "2026-10-08T10:00:00Z";
const apply = (main: Record<string, string>, user: string, edit: Parameters<typeof releaseChange>[3]) => {
  const c = releaseChange(memorySource(main), project.flow, slug, edit, user, at);
  expect(guard({ author: user, pushers: [], changes: [c] }, ctx).ok, `${user} ${JSON.stringify(edit)}`).toBe(true);
  return { ...main, [path]: c.next! };
};

describe("the release of a feature", () => {
  it("goes from staging to rollout, each role writing only its own fields, and 100% starts the watch period", () => {
    let main: Record<string, string> = { ...base() };
    expect(releaseView(memorySource(main), project.flow, slug).checklist.map((c) => c.done)).toEqual([false, false, false, false]);
    main = apply(main, "bohdan.r", { kind: "smoke", value: "passed" });
    main = apply(main, "maksym.d", { kind: "go", value: "go" });
    main = apply(main, "bohdan.r", { kind: "check", item: "The rollback plan is checked", done: true });
    main = apply(main, "bohdan.r", { kind: "add-item", item: "Store listing updated" });
    main = apply(main, "bohdan.r", { kind: "rollout", stage: 25 });
    main = apply(main, "bohdan.r", { kind: "rollout", stage: 100 });
    const r = parseRelease(main[path]!, path).value!;
    expect(r.staging).toEqual({ smoke: "passed", at });
    expect(r.go).toEqual({ value: "go", user: "maksym.d", at });
    expect(r.checklist!.map((c) => [c.item, c.done])).toEqual([
      ["Every team's production deploy is done", false],
      ["The rollback plan is checked", true],
      ["Monitoring and alerts are on for the feature", false],
      ["Release notes are published", false],
      ["Store listing updated", false],
    ]);
    expect(r.rollout).toEqual({ stage: 100, at });
    expect(r.watch).toEqual({ started: at, days: 7 });
  });
  it("leaves the go to the PM and the rest to Ops", () => {
    const go = releaseChange(memorySource(base()), project.flow, slug, { kind: "go", value: "no-go" }, "maksym.d", at);
    expect(guard({ author: "bohdan.r", pushers: [], changes: [go] }, ctx).ok).toBe(false);
    const smoke = releaseChange(memorySource(base()), project.flow, slug, { kind: "smoke", value: "failed" }, "bohdan.r", at);
    expect(guard({ author: "maksym.d", pushers: [], changes: [smoke] }, ctx).ok).toBe(false);
  });
  it("refuses what makes no sense", () => {
    const m = memorySource(base());
    expect(() => releaseChange(m, project.flow, slug, { kind: "rollout", stage: 120 }, "bohdan.r", at)).toThrow(/0 to 100/);
    expect(() => releaseChange(m, project.flow, slug, { kind: "check", item: "Nope", done: true }, "bohdan.r", at)).toThrow(/no item/);
    expect(() => releaseChange(m, project.flow, slug, { kind: "add-item", item: "Every team's production deploy is done" }, "bohdan.r", at)).toThrow(/already/);
  });
});

describe("the PM's token estimate of a feature", () => {
  const feature = `docs/features/${slug}/hub/feature.yaml`;
  const main = { ...base(), [feature]: "title: Tasks\nowner: olena.k\nestimate:\n  days: 12\n" };
  it("sets estimate.tokens_m, keeping the rest of feature.yaml", () => {
    const c = estimateChange(memorySource(main), slug, [40, 60]);
    expect(c.next).toBe("title: Tasks\nowner: olena.k\nestimate:\n  days: 12\n  tokens_m: [ 40, 60 ]\n");
    expect(guard({ author: "maksym.d", pushers: [], changes: [c] }, ctx).ok).toBe(true);
    expect(guard({ author: "iryna.s", pushers: [], changes: [c] }, ctx).ok).toBe(false);
  });
  it("refuses a range that makes no sense", () => {
    expect(() => estimateChange(memorySource(main), slug, [60, 40])).toThrow(/low.*high/);
    expect(() => estimateChange(memorySource(main), slug, [-1, 4])).toThrow(/low.*high/);
  });
});

describe("a validation report", () => {
  it("is a new file under hub/validation/, named by its time, that the PO and the feature's leads may write", () => {
    const c = validationChange("tasks-issues", "## spec.md\nConsistent.\n", "2026-10-09T12:30:05Z");
    expect(c).toEqual({ path: "docs/features/tasks-issues/hub/validation/20261009-123005.md", next: "# Validation of tasks-issues, 2026-10-09T12:30:05Z\n\n## spec.md\nConsistent.\n" });
    expect(guard({ author: "olena.k", pushers: [], changes: [c] }, ctx).ok).toBe(true);
    expect(guard({ author: "iryna.s", pushers: [], changes: [c] }, ctx).ok).toBe(false);
    expect(() => validationChange("tasks-issues", "  ", "2026-10-09T12:30:05Z")).toThrow(/empty/);
  });
});
