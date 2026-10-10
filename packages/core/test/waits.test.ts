import { describe, expect, it } from "vitest";
import { carryWaits, waitedFor, type TeamSnapshot } from "../src/index.ts";

const snap = (tracker: { id: string; status: string; blocked_by?: string[] }[], extra: Partial<TeamSnapshot> = {}): TeamSnapshot =>
  ({ schema_version: 1, team: "web", slug: "x", source_commit: null, generated_at: "2026-10-01T00:00:00Z", files: [], tasks: null, tracker: tracker.map((r) => ({ blocked_by: [], ...r })), review: null, mr: null, pipeline: null, warnings: [], ...extra }) as TeamSnapshot;

describe("how long a team waited for another", () => {
  it("carries a blocked task's start from one snapshot to the next, and closes it when it is no longer blocked", () => {
    const first = carryWaits(undefined, snap([{ id: "T3", status: "blocked", blocked_by: ["backend:T2"] }, { id: "T4", status: "blocked", blocked_by: ["T3"] }]), "2026-10-01T10:00:00Z");
    expect(first.waits).toEqual([{ task: "T3", on: ["backend:T2"], since: "2026-10-01T10:00:00Z" }]); // T4 waits inside its own team
    const second = carryWaits(first, snap([{ id: "T3", status: "blocked", blocked_by: ["backend:T2"] }]), "2026-10-02T10:00:00Z");
    expect(second.waits?.[0]?.since).toBe("2026-10-01T10:00:00Z");
    const third = carryWaits(second, snap([{ id: "T3", status: "in_progress", blocked_by: ["backend:T2"] }]), "2026-10-03T22:00:00Z");
    expect(third.waits).toEqual([]);
    expect(third.waited).toEqual([{ task: "T3", on: ["backend:T2"], from: "2026-10-01T10:00:00Z", to: "2026-10-03T22:00:00Z" }]);
  });

  it("counts the days each team waited for the contract team, ended waits and current ones", () => {
    const web = snap([], { waited: [{ task: "T3", on: ["backend:T2"], from: "2026-10-01T00:00:00Z", to: "2026-10-03T12:00:00Z" }] });
    const android = snap([], { team: "android", waits: [{ task: "T1", on: ["backend:T5"], since: "2026-10-04T00:00:00Z" }] });
    expect(waitedFor([{ id: "web", snapshot: web }, { id: "android", snapshot: android }, { id: "backend", snapshot: snap([], { team: "backend" }) }], "backend", "2026-10-05T00:00:00Z")).toEqual([
      { team: "web", days: 2.5, waiting: false },
      { team: "android", days: 1, waiting: true },
    ]);
  });
});
