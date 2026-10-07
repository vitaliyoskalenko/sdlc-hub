import { describe, expect, it } from "vitest";
import { checkRegionEdit, contentHash, extractRefs, normaliseRef, parseStructure } from "../src/index.ts";

describe("contentHash", () => {
  it("normalises line endings", () => {
    expect(contentHash("a\r\nb\r\n")).toBe(contentHash("a\nb\n"));
  });
  it("changes with the content and has the sha256 form", () => {
    expect(contentHash("a")).not.toBe(contentHash("b"));
    expect(contentHash("a")).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("references", () => {
  it("treats AC-04 and AC-4 as one id", () => {
    expect(normaliseRef("AC-04")).toBe("AC-4");
    expect([...extractRefs("See AC-04, AC-4, US-2 and SCR-02. Not BAC-1 or AC-.")].sort()).toEqual(["AC-4", "SCR-2", "US-2"]);
  });
});

const SPEC = `---
status: Draft
owner: "olena.k"
updated_at: "2026-09-18"
feature_size: "S"
---

# Spec — order-notes-fix

## 5. Acceptance criteria

- AC-01: Line breaks survive a save.

## 8. Open questions

- [ ] None.

\`\`\`md
## Test plan
this heading is inside a code block and does not count
\`\`\`
`;

const PLAN = `## Test plan

| AC | Level | Test |
|---|---|---|
| AC-01 | unit | keeps line breaks |
`;

const withPlan = SPEC + "\n" + PLAN;
const TEST_PLAN = { kind: "section", heading: "## Test plan" } as const;
const FEATURE_SIZE = { kind: "front", key: "feature_size" } as const;

describe("parseStructure", () => {
  it("finds front matter keys and sections, ignoring headings in fenced code", () => {
    const s = parseStructure(withPlan);
    expect(s.front?.keys.map((k) => k.key)).toEqual(["status", "owner", "updated_at", "feature_size"]);
    expect(s.sections.map((x) => x.heading)).toEqual([
      "# Spec — order-notes-fix",
      "## 5. Acceptance criteria",
      "## 8. Open questions",
      "## Test plan",
    ]);
  });
  it("ends a section at the next heading of the same or a higher level", () => {
    const text = "## A\nx\n### A.1\ny\n## B\nz\n";
    const a = parseStructure(text).sections.find((x) => x.heading === "## A")!;
    expect(text.slice(a.start, a.end)).toBe("## A\nx\n### A.1\ny\n");
  });
});

describe("checkRegionEdit: one section", () => {
  it("allows a new section at the end", () => {
    expect(checkRegionEdit(SPEC, withPlan, TEST_PLAN)).toEqual({ ok: true });
  });

  it("allows a new section between two existing ones", () => {
    const next = SPEC.replace("## 8. Open questions", PLAN + "\n## 8. Open questions");
    expect(checkRegionEdit(SPEC, next, TEST_PLAN)).toEqual({ ok: true });
  });

  it("allows an edit inside the section, including its subsections", () => {
    const next = withPlan.replace("keeps line breaks", "keeps line breaks\n\n### Load\n\n<!-- N/A: no numeric NFR -->");
    expect(checkRegionEdit(withPlan, next, TEST_PLAN)).toEqual({ ok: true });
  });

  it("allows a new file only when it is nothing but the section", () => {
    expect(checkRegionEdit(undefined, PLAN, TEST_PLAN)).toEqual({ ok: true });
    expect(checkRegionEdit(undefined, "# Spec\n\n" + PLAN, TEST_PLAN).ok).toBe(false);
  });

  it("refuses a renamed heading", () => {
    for (const renamed of ["## Test Plan", "## 9. Test plan", "### Test plan"]) {
      const r = checkRegionEdit(withPlan, withPlan.replace(/^## Test plan$/m, renamed), TEST_PLAN);
      expect(r.ok, renamed).toBe(false);
    }
  });

  it("refuses a moved section and says so", () => {
    const moved = SPEC.replace("## 5. Acceptance criteria", PLAN + "\n## 5. Acceptance criteria");
    const r = checkRegionEdit(withPlan, moved, TEST_PLAN);
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.reason).toMatch(/moved/);
  });

  it("refuses an edit outside the section, with the line", () => {
    const next = withPlan.replace("Line breaks survive a save.", "Line breaks survive a save and a reload.");
    const r = checkRegionEdit(withPlan, next, TEST_PLAN);
    expect(r).toMatchObject({ ok: false, line: 12 });
  });

  it("refuses a heading renamed to capture another section's body", () => {
    const next = SPEC.replace("## 8. Open questions", "## Test plan");
    expect(checkRegionEdit(SPEC, next, TEST_PLAN).ok).toBe(false);
  });

  it("refuses a duplicated heading as ambiguous", () => {
    const r = checkRegionEdit(withPlan, withPlan + "\n" + PLAN, TEST_PLAN);
    expect(r.ok === false && r.reason).toMatch(/more than once/);
  });

  it("does not count a heading inside a fenced code block", () => {
    const next = SPEC.replace("this heading is inside", "THIS heading is inside");
    expect(checkRegionEdit(SPEC, next, TEST_PLAN).ok).toBe(false);
  });
});

describe("checkRegionEdit: one front matter key", () => {
  const SAD = `---
status: Draft
feature_size: "M"
target_surfaces: [backend-service]
---

# SAD
`;
  it("allows a change of that key", () => {
    expect(checkRegionEdit(SAD, SAD.replace('"M"', '"L"'), FEATURE_SIZE)).toEqual({ ok: true });
  });
  it("allows adding the key at a key boundary", () => {
    const base = SAD.replace('feature_size: "M"\n', "");
    expect(checkRegionEdit(base, SAD, FEATURE_SIZE)).toEqual({ ok: true });
  });
  it("refuses a change of another key or of the body", () => {
    expect(checkRegionEdit(SAD, SAD.replace("Draft", "Accepted"), FEATURE_SIZE).ok).toBe(false);
    expect(checkRegionEdit(SAD, SAD.replace("# SAD", "# SAD v2"), FEATURE_SIZE).ok).toBe(false);
  });
  it("refuses moving the key", () => {
    const moved = SAD.replace('feature_size: "M"\ntarget_surfaces: [backend-service]', 'target_surfaces: [backend-service]\nfeature_size: "M"');
    const r = checkRegionEdit(SAD, moved, FEATURE_SIZE);
    expect(r.ok === false && r.reason).toMatch(/moved/);
  });
  it("refuses when the file has no front matter", () => {
    expect(checkRegionEdit("# SAD\n", "# SAD\n", FEATURE_SIZE).ok).toBe(false);
  });
});
