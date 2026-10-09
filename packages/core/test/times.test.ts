import { describe, expect, it } from "vitest";
import { featureTime, stepTimes } from "../src/index.ts";

const ev = (step: string, event: "started" | "finished" | "returned", at: string) => ({ step, event, role: "po", at });

describe("lead time from stage events", () => {
  it("takes each step from its first start to its last finish, and a running step up to now", () => {
    const events = [ev("specify", "started", "2026-10-01T09:00:00Z"), ev("specify", "finished", "2026-10-01T15:00:00Z"), ev("clarify", "started", "2026-10-02T09:00:00Z"), ev("specify", "started", "2026-10-03T09:00:00Z"), ev("specify", "finished", "2026-10-03T10:00:00Z")];
    expect(stepTimes(events, "2026-10-04T09:00:00Z")).toEqual([
      { step: "specify", started: "2026-10-01T09:00:00Z", finished: "2026-10-03T10:00:00Z", hours: 49 },
      { step: "clarify", started: "2026-10-02T09:00:00Z", hours: 48 },
    ]);
  });
  it("measures the feature from its first start to its release, or to now", () => {
    const events = [ev("specify", "started", "2026-10-01T09:00:00Z")];
    expect(featureTime(events, "2026-10-05T09:00:00Z")).toEqual({ started: "2026-10-01T09:00:00Z", days: 4 });
    expect(featureTime(events, "2026-10-09T09:00:00Z", "2026-10-03T21:00:00Z")).toEqual({ started: "2026-10-01T09:00:00Z", finished: "2026-10-03T21:00:00Z", days: 2.5 });
    expect(featureTime([], "2026-10-05T09:00:00Z")).toBeUndefined();
  });
});
