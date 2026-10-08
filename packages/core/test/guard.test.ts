import { describe, expect, it } from "vitest";
import { DEFAULT_FLOW_YAML, guard, parseConfig, parseFlow, parseRoles, type GuardContext } from "../src/index.ts";
import { CONFIG, ROLES } from "@sdlc-hub/fixtures";

const F = "docs/features/tasks-issues";
const FEATURE = "title: Tasks\nowner: olena.k\nteams:\n  backend: { lead: taras.m }\n  web: { lead: petro.v }\n";
const ctx: GuardContext = {
  config: parseConfig(CONFIG, "c").value!,
  roles: parseRoles(ROLES, "r").value!,
  flow: parseFlow(DEFAULT_FLOW_YAML, "f").value!,
  feature: (slug) => (slug === "tasks-issues" ? FEATURE : undefined),
};
const entry = (step: string, user: string, extra = "") => `- step: ${step}\n  user: ${user}\n  at: 2026-10-08T10:00:00Z\n${extra}`;
const base = entry("clarify", "olena.k");

describe("hub-guard", () => {
  it("passes a change inside the author's role", () => {
    const r = guard({ author: "olena.k", pushers: ["olena.k"], changes: [{ path: `${F}/spec.md`, base: "a\n", next: "b\n" }] }, ctx);
    expect(r).toEqual({ ok: true, findings: [] });
  });

  it("refuses a path outside the role, naming the path and the rule", () => {
    const r = guard({ author: "daria.l", pushers: ["daria.l"], changes: [{ path: `${F}/spec.md`, base: "a\n", next: "b\n" }] }, ctx);
    expect(r.ok).toBe(false);
    expect(r.findings[0]).toMatchObject({ user: "daria.l", path: `${F}/spec.md`, reason: expect.stringMatching(/No role of daria.l/) });
  });

  it("checks every person who pushed, not only the author", () => {
    const r = guard({ author: "olena.k", pushers: ["olena.k", "daria.l"], changes: [{ path: `${F}/spec.md`, base: "a\n", next: "b\n" }] }, ctx);
    expect(r.findings.map((f) => f.user)).toEqual(["daria.l"]);
  });

  it("refuses everyone but the admin under .hub/ and hub/", () => {
    expect(guard({ author: "maksym.d", pushers: [], changes: [{ path: ".hub/roles.yaml", base: "a", next: "b" }] }, ctx).ok).toBe(false);
    expect(guard({ author: "nazar.t", pushers: [], changes: [{ path: ".hub/roles.yaml", base: "a", next: "b" }] }, ctx).ok).toBe(true);
  });

  describe("signoffs.yaml", () => {
    const save = (author: string, add: string) => guard({ author, pushers: [author], changes: [{ path: `${F}/hub/signoffs.yaml`, base, next: base + add }] }, ctx);
    it("accepts a sign-off at a gate the author owns, in the author's name", () => {
      expect(save("maksym.d", entry("epic", "maksym.d")).ok).toBe(true);
      expect(save("iryna.s", entry("plan-tests", "iryna.s")).ok).toBe(true);
    });
    it("refuses an entry that names someone else", () => {
      expect(save("maksym.d", entry("epic", "olena.k")).findings[0]?.reason).toMatch(/must name the merge request author/);
    });
    it("refuses a gate of another role", () => {
      expect(save("maksym.d", entry("clarify", "maksym.d")).findings[0]?.reason).toMatch(/clarify is signed by PO/);
    });
    it("lets a lead of the feature sign an Engineering gate, and nobody else", () => {
      expect(save("taras.m", entry("tasks", "taras.m")).ok).toBe(true);
      expect(save("sofiia.h", entry("tasks", "sofiia.h")).ok).toBe(false); // a lead, but not of a team of this feature
    });
    it("accepts a return with a reason from the gate owner", () => {
      expect(save("maksym.d", entry("epic", "maksym.d", "  decision: return\n  reason: too small\n  cycle: 1\n")).ok).toBe(true);
    });
    it("keeps the QA decision to QA", () => {
      expect(save("iryna.s", entry("qa-final", "iryna.s", "  decision: return\n  reason: BUG-0012\n  cycle: 1\n")).ok).toBe(true);
      expect(save("olena.k", entry("qa-final", "olena.k")).ok).toBe(false);
    });
    it("lets an owner confirm that their own step needs no change", () => {
      const confirm = (u: string, step: string) => entry(step, u, `  decision: confirm\n  file: ${F}/screens.md\n  hash: sha256:00\n`);
      expect(save("daria.l", confirm("daria.l", "screens")).ok).toBe(true);
      expect(save("daria.l", confirm("daria.l", "tasks")).ok).toBe(false);
    });
    it("refuses an edit to an existing entry and an invalid entry", () => {
      const r = guard({ author: "olena.k", pushers: [], changes: [{ path: `${F}/hub/signoffs.yaml`, base, next: base.replace("10:00", "11:00") }] }, ctx);
      expect(r.findings[0]?.reason).toMatch(/append-only/);
      expect(save("maksym.d", "- step: epic\n  user: maksym.d\n").findings[0]?.reason).toMatch(/not a valid entry/);
    });
  });

  describe("release.yaml, field by field", () => {
    const rel = "staging: { smoke: passed }\nchecklist:\n  - { item: Backend deployed, done: false }\n";
    const change = (author: string, next: string) => guard({ author, pushers: [author], changes: [{ path: `${F}/hub/release.yaml`, base: rel, next }] }, ctx);
    it("lets the PM write the go or no-go and nothing else", () => {
      expect(change("maksym.d", rel + "go: { value: go, user: maksym.d, at: 2026-10-09T09:00:00Z }\n").ok).toBe(true);
      expect(change("maksym.d", rel.replace("done: false", "done: true")).findings[0]?.reason).toMatch(/checklist/);
    });
    it("lets Ops write everything but the go or no-go", () => {
      expect(change("bohdan.r", rel.replace("done: false", "done: true")).ok).toBe(true);
      expect(change("bohdan.r", rel + "go: { value: go, user: bohdan.r, at: 2026-10-09T09:00:00Z }\n").findings[0]?.reason).toMatch(/go/);
    });
  });
});
