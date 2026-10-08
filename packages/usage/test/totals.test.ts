import { describe, expect, it } from "vitest";
import { openTotals, type UsageRecord } from "../src/index.ts";

const rec = (slug: string, step: string, role: string, output: number): UsageRecord => ({
  at: "2026-10-08T10:00:00Z", session: "s", assistant: "claude", model: "claude-opus-5-5", role, slug, step, messages: 1,
  tokens: { input: 0, cache_write_5m: 0, cache_write_1h: 0, cache_read: 0, output },
});

describe("open totals", () => {
  const records = [
    { user: "a", record: rec("tasks-issues", "implement", "dev", 1e6) },
    { user: "b", record: rec("tasks-issues", "implement", "dev", 1e6) },
    { user: "c", record: rec("tasks-issues", "implement", "dev", 1e6) },
    { user: "d", record: rec("returns-portal", "clarify", "po", 1e6) },
    { user: "e", record: rec("order-webhooks", "tech-design", "dev", 2e6) },
  ];
  const rows = openTotals("2026-10", records);
  const of = (d: string) => Object.fromEntries(rows.filter((r) => r.dimension === d).map((r) => [r.key, r]));
  it("show a group of three people or more, with its cost and how many people, never who", () => {
    expect(of("feature")["tasks-issues"]).toMatchObject({ people: 3, cost: 60 });
    expect(JSON.stringify(rows)).not.toMatch(/"user"|\b[a-e]\b"/);
  });
  it("never show one person: smaller groups go into other, and an other of fewer than three is left out", () => {
    expect(of("feature")["returns-portal"]).toBeUndefined();
    expect(of("feature")["other"]).toBeUndefined(); // two people: d and e
    expect(of("role")["po"]).toBeUndefined();
    expect(of("role")["dev"]).toMatchObject({ people: 4, cost: 100 });
    expect(of("model")["claude-opus-5-5"]).toMatchObject({ people: 5, cost: 120 });
  });
  it("say when a model has no price", () => {
    const r = openTotals("2026-10", records.slice(0, 3).map((x) => ({ ...x, record: { ...x.record, model: "mystery-1" } })));
    expect(r.find((x) => x.dimension === "feature")!.cost).toBeNull();
  });
});
