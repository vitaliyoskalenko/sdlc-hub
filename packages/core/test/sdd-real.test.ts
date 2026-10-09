// The hub's SDD readers against real output: genkovich/sdd v2.3.0 run from specify to tasks on a toy feature
// (9 October 2026). The files in fixtures/sdd-2.3.0/ are copied unchanged, except sad.md (its front matter only).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normaliseRef, parseTasksJson, parseTracker, readCriteria, readRoute, readSize, readTargetSurfaces } from "../src/index.ts";

const dir = join(import.meta.dirname, "fixtures/sdd-2.3.0/bulk-order-export");
const read = (p: string) => readFileSync(join(dir, p), "utf8");

describe("SDD 2.3.0, real output", () => {
  it("reads the acceptance criteria SDD writes as headings with Given/When/Then, suffixed ids included", () => {
    const acs = readCriteria(read("spec.md"));
    expect(acs.length).toBeGreaterThan(10);
    expect(acs[0]).toEqual({ id: "AC-01", text: "happy path" });
    expect(acs.map((a) => a.id)).toContain("AC-02b");
    expect(normaliseRef("AC-02b")).toBe("AC-2b");
  });

  it("reads the tracker's task ids from the markdown links SDD writes", () => {
    const r = parseTracker(read("tasks/tracker.md"), "tracker.md");
    expect(r.issues).toEqual([]);
    expect(r.value!.slice(0, 5).map((x) => x.id)).toEqual(["T01", "T02", "T03", "T04", "T05"]);
    expect(r.value![4]).toMatchObject({ title: "Implement the order_exports repository", status: "todo", blocked_by: ["T01", "T03"] });
  });

  it("reads tasks.json, .size, .route and the surfaces in sad.md", () => {
    const t = parseTasksJson(read("tasks.json"), "tasks.json");
    expect(t.issues).toEqual([]);
    expect(t.value!.tasks).toHaveLength(20);
    expect(t.value!.tasks.flatMap((x) => x.acs)).toContain("AC-02b");
    expect(readSize(read(".size")).value).toBe("L");
    expect(readRoute(read(".route")).value).toBe("full");
    expect(readTargetSurfaces(read("sad.md"))).toEqual(["backend-service", "web-frontend", "worker"]);
  });
});
