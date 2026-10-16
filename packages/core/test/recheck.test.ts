import { describe, expect, it } from "vitest";
import { changedIds, idBlocks, memoryHistory, memorySource, rechecksFor, type FileSource, type RecheckInput } from "../src/index.ts";

const SPEC = `# Spec

Intro text that names AC-02 in passing.

### US-01: Add a note
As staff I add a note.

### AC-01 (US-01) — happy path
**Given** an order **When** staff adds a note **Then** it is saved.

### AC-02 (US-01) — error
**Given** an empty text **Then** it is refused.

## Test plan
- AC-01: one unit test
`;

describe("the ids a spec defines", () => {
  it("takes a heading that starts with an id as its definition, and a mention in a sentence as a reference", () => {
    const b = idBlocks(SPEC);
    expect([...b.keys()]).toEqual(["US-01", "AC-01", "AC-02"]);
    expect(b.get("AC-01")).toContain("it is saved");
    expect(b.get("AC-02")).not.toContain("Test plan");
  });

  it("finds the changed, added and removed ids, and ignores a change of spacing", () => {
    const after = SPEC.replace("it is refused", "it is refused with a message").replace("### AC-01", "###  AC-01").concat("\n### AC-03 (US-01) — limit\n**Then** at most 30.\n");
    expect(changedIds(SPEC, after)).toEqual({ changed: ["AC-02"], added: ["AC-03"], removed: [] });
  });
});

const dir = "docs/features/notes";
const T0 = "2026-10-01T09:00:00Z", T1 = "2026-10-02T09:00:00Z", T2 = "2026-10-03T09:00:00Z";

/** A spec at T0, the flows (naming AC-01) and the test plan (naming AC-02) at T1, and the spec's AC-02 changed at T2. */
function source(): FileSource {
  const changed = SPEC.replace("it is refused", "it is refused with a message");
  const history = memoryHistory([
    { at: T0, files: { [`${dir}/spec.md`]: SPEC } },
    { at: T1, files: { [`${dir}/ux-flows.md`]: "Flow for AC-01.", [`${dir}/test-plan.md`]: "Cases for AC-02." } },
    { at: T2, files: { [`${dir}/spec.md`]: changed } },
  ]);
  const files = { [`${dir}/spec.md`]: changed, [`${dir}/ux-flows.md`]: "Flow for AC-01.", [`${dir}/test-plan.md`]: "Cases for AC-02." };
  return { ...memorySource(files, { [`${dir}/spec.md`]: "olena.k" }), history };
}

const input = (over: Partial<RecheckInput> = {}): RecheckInput => ({
  specs: source(),
  slug: "notes",
  done: new Set(["ux-flows", "plan-tests"]),
  signoffs: [],
  teams: [],
  teamOf: () => undefined,
  ...over,
});

describe("documents built on an older spec", () => {
  it("names the document that refers to a criterion changed after it landed, with who changed it", () => {
    expect(rechecksFor(input())).toEqual([{ step: "plan-tests", file: `${dir}/test-plan.md`, because: [{ file: `${dir}/spec.md`, ids: ["AC-02"], at: T2, by: "olena.k" }] }]);
  });

  it("leaves a step that is not done, and a source without history", () => {
    expect(rechecksFor(input({ done: new Set(["ux-flows"]) }))).toEqual([]);
    expect(rechecksFor(input({ specs: memorySource({}) }))).toEqual([]);
  });

  it("clears once the owner confirmed that nothing needs to change", () => {
    const confirm = { step: "plan-tests", user: "iryna.s", at: "2026-10-03T10:00:00Z", decision: "confirm" as const, file: `${dir}/test-plan.md`, hash: "sha256:00" };
    expect(rechecksFor(input({ signoffs: [confirm] }))).toEqual([]);
  });

  it("counts a new criterion for every document", () => {
    const specs = source();
    const added = `${SPEC}\n### AC-03 (US-01) — limit\n**Then** at most 30.\n`;
    const history = memoryHistory([
      { at: T0, files: { [`${dir}/spec.md`]: SPEC } },
      { at: T1, files: { [`${dir}/ux-flows.md`]: "Flow for AC-01.", [`${dir}/test-plan.md`]: "Cases for AC-02." } },
      { at: T2, files: { [`${dir}/spec.md`]: added } },
    ]);
    const r = rechecksFor(input({ specs: { ...specs, read: (p) => (p === `${dir}/spec.md` ? added : specs.read(p)), history } }));
    expect(r.map((x) => [x.step, x.because[0]!.ids])).toEqual([
      ["ux-flows", ["AC-03"]],
      ["plan-tests", ["AC-03"]],
    ]);
  });

  it("names each team whose tasks refer to a changed criterion, after the tasks stage finished", () => {
    const r = rechecksFor(input({ done: new Set(["tasks"]), tasksFinished: T1, teams: [{ id: "backend", acs: ["AC-02"] }, { id: "web", acs: ["AC-01"] }], contractTeam: "backend" }));
    expect(r).toEqual([{ step: "tasks", file: "backend", team: "backend", because: [{ file: `${dir}/spec.md`, ids: ["AC-02"], at: T2, by: "olena.k" }] }]);
    // A lead confirms for their own team only.
    const confirm = { step: "tasks", user: "petro.v", at: "2026-10-03T10:00:00Z", decision: "confirm" as const, file: `${dir}/spec.md`, hash: "sha256:00" };
    expect(rechecksFor(input({ done: new Set(["tasks"]), tasksFinished: T1, teams: [{ id: "backend", acs: ["AC-02"] }], signoffs: [confirm], teamOf: (u) => (u === "petro.v" ? "web" : undefined) }))).toHaveLength(1);
    expect(rechecksFor(input({ done: new Set(["tasks"]), tasksFinished: T1, teams: [{ id: "backend", acs: ["AC-02"] }], signoffs: [confirm], teamOf: (u) => (u === "petro.v" ? "backend" : undefined) }))).toEqual([]);
  });
});

describe("what counts as a change for a document", () => {
  const sad = `${dir}/sad.md`;
  const withSad = (spec: string): FileSource => {
    const history = memoryHistory([
      { at: T0, files: { [`${dir}/spec.md`]: SPEC } },
      { at: T1, files: { [sad]: "Jobs in the worker." } },
      { at: T2, files: { [`${dir}/spec.md`]: spec } },
    ]);
    return { ...memorySource({ [`${dir}/spec.md`]: spec, [sad]: "Jobs in the worker." }), history };
  };

  it("leaves a document that names no id when a criterion only changed, and names it when one was added", () => {
    const changed = SPEC.replace("it is refused", "it is refused with a message");
    expect(rechecksFor(input({ specs: withSad(changed), done: new Set(["tech-design"]) }))).toEqual([]);
    const added = `${SPEC}\n### AC-03 (US-01) — limit\n**Then** at most 30.\n`;
    expect(rechecksFor(input({ specs: withSad(added), done: new Set(["tech-design"]) })).map((r) => [r.step, r.because[0]!.ids])).toEqual([["tech-design", ["AC-03"]]]);
  });

  it("names a client team's tasks when the contract changed after them, and not when it did not exist then", () => {
    const api = `${dir}/contracts/openapi.yaml`;
    const contract = (first: string) => {
      const history = memoryHistory([
        { at: first, files: { [api]: "paths: {}" } },
        { at: T2, files: { [api]: "paths: { /notes: {} }" } },
      ]);
      return { ...memorySource({ [api]: "paths: { /notes: {} }" }), history };
    };
    const tasks = (specs: FileSource) => rechecksFor(input({ specs, done: new Set(["tasks"]), tasksFinished: T1, teams: [{ id: "backend", acs: [] }, { id: "web", acs: [] }], contractTeam: "backend" }));
    expect(tasks(contract(T0)).map((r) => [r.team, r.because[0]!.file])).toEqual([["web", `${dir}/contracts`]]);
    expect(tasks(contract("2026-10-02T10:00:00Z"))).toEqual([]);
  });
});

describe("the owners' answers", () => {
  it("takes the PO's only-the-wording-changed for every document built on the spec", () => {
    const wording = { step: "clarify", user: "olena.k", at: "2026-10-03T11:00:00Z", decision: "confirm" as const, file: `${dir}/spec.md`, hash: "sha256:00" };
    expect(rechecksFor(input({ signoffs: [wording] }))).toEqual([]);
    // A later change of the spec counts again.
    const later = { ...wording, at: "2026-10-02T12:00:00Z" };
    expect(rechecksFor(input({ signoffs: [later] })).map((r) => r.step)).toEqual(["plan-tests"]);
  });

  it("counts each team's tasks from when its own people finished them", () => {
    const teams = [
      { id: "backend", acs: ["AC-02"], finished: "2026-10-03T12:00:00Z" },
      { id: "web", acs: ["AC-02"] },
    ];
    expect(rechecksFor(input({ done: new Set(["tasks"]), tasksFinished: T1, teams })).map((r) => r.team)).toEqual(["web"]);
  });
});
