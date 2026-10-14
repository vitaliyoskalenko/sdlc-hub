import { describe, expect, it } from "vitest";
import {
  buildTeamSnapshot,
  latestReviewFile,
  memorySource,
  parseTasksJson,
  parseTracker,
  readReviewVerdict,
  readRoute,
  readSize,
  readTargetSurfaces,
} from "../src/index.ts";

// SDD v2.3.0, skills/tasks/templates/tracker.md, filled in.
const TRACKER = `# Tracker — tasks-issues

> Status of every task in the epic. \`implement\` updates \`done\` as it commits each task.
> States: \`todo\` · \`in_progress\` · \`blocked\` · \`review\` · \`done\`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T1 | Task list screen | ui | petro.v | S | — | done |
| T2 | Switch to the staging API | wiring | petro.v | M | T1, backend:T2 | blocked |
| T3 | Assignee filter | ui | <owner / TBD> | M | T2 | todo |

**Total:** 3 tasks, ~3 person-days.
`;

describe(".size and .route", () => {
  it("read one bare word", () => {
    expect(readSize("M\n")).toEqual({ value: "M" });
    expect(readRoute("quick")).toEqual({ value: "quick" });
  });
  it("refuse anything else", () => {
    expect(readSize("M # medium\n").value).toBeUndefined();
    expect(readRoute("fast\n").value).toBeUndefined();
  });
});

describe("sad.md target_surfaces", () => {
  it("reads the list from the front matter, as SDD's design stage writes it", () => {
    expect(readTargetSurfaces("---\nstatus: Draft\ntarget_surfaces: [backend-service, web-frontend]  # filled in §4\n---\n# SAD\n")).toEqual(["backend-service", "web-frontend"]);
  });
  it("is undefined when there is no list", () => {
    expect(readTargetSurfaces("# SAD\n")).toBeUndefined();
    expect(readTargetSurfaces("---\nstatus: Draft\n---\n")).toBeUndefined();
  });
});

describe("tasks/tracker.md", () => {
  it("reads the SDD 2.3 template table", () => {
    const r = parseTracker(TRACKER, "tracker.md");
    expect(r.issues).toEqual([]);
    expect(r.value).toEqual([
      { id: "T1", title: "Task list screen", status: "done", blocked_by: [] },
      { id: "T2", title: "Switch to the staging API", status: "blocked", blocked_by: ["T1", "backend:T2"] },
      { id: "T3", title: "Assignee filter", status: "todo", blocked_by: ["T2"] },
    ]);
  });
  it("reports a status outside SDD's list on its line and keeps the other rows", () => {
    const r = parseTracker(TRACKER.replace("| todo |", "| waiting |"), "tracker.md");
    expect(r.value?.map((x) => x.id)).toEqual(["T1", "T2"]);
    expect(r.issues).toMatchObject([{ level: "error", line: 10 }]);
  });
  it("reports a tracker with no status table", () => {
    expect(parseTracker("# Tracker\n\nNothing yet.\n", "tracker.md").issues[0]?.message).toMatch(/table/);
  });
});

describe("tasks.json", () => {
  it("reads the SDD 2.3 contract", () => {
    const r = parseTasksJson(
      JSON.stringify({
        slug: "tasks-issues",
        tasks: [
          { id: "T1", title: "staff_tasks migration", layer: "migration", deps: [], acs: ["AC-01"], dod: "applies and reverts", files_hint: ["docs/features/tasks-issues/migrations/01_*"], file: "docs/features/tasks-issues/tasks/t1.md" },
          { id: "T2", title: "POST tasks", layer: "ports", deps: ["T1"], acs: ["AC-02"], dod: "handler returns AC-02", files_hint: ["src/tasks"], file: "docs/features/tasks-issues/tasks/t2.md" },
        ],
      }),
      "tasks.json",
    );
    expect(r.issues).toEqual([]);
    expect(r.value?.tasks.map((t) => t.id)).toEqual(["T1", "T2"]);
  });
  it("reports a dependency on an id that is not in the file", () => {
    const r = parseTasksJson(JSON.stringify({ slug: "s", tasks: [{ id: "T1", title: "t", layer: "ui", deps: ["backend:T2"], acs: [] }] }), "tasks.json");
    expect(r.issues[0]?.message).toMatch(/same file/);
  });
});

describe("review records", () => {
  it("picks the latest record by the date in its name", () => {
    expect(latestReviewFile(["_review/review-2026-09-30.md", "_review/review-2026-10-02.md", "_review/notes.md"])).toBe("_review/review-2026-10-02.md");
    expect(latestReviewFile(["spec.md"])).toBeUndefined();
    // A second review the same day, as SDD 2.3 names it (seen in the full cycle): -2 or -r2 after the date.
    expect(latestReviewFile(["_review/review-2026-10-14.md", "_review/review-2026-10-14-2.md"])).toBe("_review/review-2026-10-14-2.md");
    expect(latestReviewFile(["_review/review-2026-10-14-r2.md", "_review/review-2026-10-14.md"])).toBe("_review/review-2026-10-14-r2.md");
    expect(latestReviewFile(["_review/review-2026-10-14-r10.md", "_review/review-2026-10-14-r9.md", "_review/review-2026-10-13-r3.md"])).toBe("_review/review-2026-10-14-r10.md");
  });
  it("@assumed-sdd-format reads the gate result", () => {
    expect(readReviewVerdict("# Review\n\nFindings: none.\n\n**Gate result:** PASS\n")).toBe("PASS");
    expect(readReviewVerdict("## Gate result\n\nCHANGES REQUESTED — AC-03 is not met.\n")).toBe("CHANGES REQUESTED");
  });
  it("@assumed-sdd-format gives no verdict when both literals appear without a gate line", () => {
    expect(readReviewVerdict("The verdict is PASS or CHANGES REQUESTED.\n")).toBeUndefined();
  });
});

describe("buildTeamSnapshot", () => {
  const F = "docs/features/tasks-issues";
  const source = memorySource({
    [`${F}/spec.md`]: "# Spec\n",
    [`${F}/tasks.json`]: JSON.stringify({ slug: "tasks-issues", tasks: [{ id: "T1", title: "List", layer: "ui", deps: [], acs: ["AC-01"] }, { id: "T2", title: "API", layer: "wiring", deps: ["T1"], acs: [] }, { id: "T3", title: "Filter", layer: "ui", deps: ["T2"], acs: [] }] }),
    [`${F}/tasks/tracker.md`]: TRACKER,
    [`${F}/_review/review-2026-10-02.md`]: "**Gate result:** CHANGES REQUESTED\n",
    [`${F}/sad.md`]: "---\ntarget_surfaces: [web-frontend]\n---\n# SAD\n",
    "src/app.ts": "",
  });

  it("collects the SDD files of the feature, the tasks, the tracker and the review", () => {
    const r = buildTeamSnapshot({ team: "web", slug: "tasks-issues", source, commit: "abc", now: "2026-10-07T10:00:00Z" });
    expect(r.issues).toEqual([]);
    expect(r.value).toMatchObject({
      schema_version: 1,
      team: "web",
      slug: "tasks-issues",
      source_commit: "abc",
      files: ["_review/review-2026-10-02.md", "sad.md", "spec.md", "tasks.json", "tasks/tracker.md"],
      target_surfaces: ["web-frontend"],
      review: { file: "_review/review-2026-10-02.md", verdict: "CHANGES REQUESTED" },
      mr: null,
      pipeline: null,
    });
    expect(r.value?.tracker?.[1]?.blocked_by).toEqual(["T1", "backend:T2"]);
  });

  it("is empty but valid for a team that has not started", () => {
    const r = buildTeamSnapshot({ team: "ios", slug: "tasks-issues", source: memorySource({}), commit: null, now: "2026-10-07T10:00:00Z" });
    expect(r.value).toMatchObject({ files: [], tasks: null, tracker: null, review: null });
  });

  it("carries a broken tasks.json as a warning instead of failing", () => {
    const broken = memorySource({ [`${F}/tasks.json`]: "{" });
    const r = buildTeamSnapshot({ team: "web", slug: "tasks-issues", source: broken, commit: null, now: "2026-10-07T10:00:00Z" });
    expect(r.value?.tasks).toBeNull();
    expect(r.value?.warnings[0]).toMatch(/tasks.json/);
  });
});
