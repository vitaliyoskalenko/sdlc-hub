import { describe, expect, it } from "vitest";
import { DEFAULT_FLOW_YAML, blocks, guard, guardSettings, parseConfig, parseFlow, parseRoles, type GuardContext } from "../src/index.ts";
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

describe("hub-guard settings (guard: in config.yaml)", () => {
  const withGuard = (yaml: string): GuardContext => ({ ...ctx, config: parseConfig(`${CONFIG}${yaml}`, "c").value! });
  const off = (...names: string[]) => withGuard(`guard:\n  checks:\n${names.map((n) => `    ${n}: false\n`).join("")}`);
  const spec = { path: `${F}/spec.md`, base: "a\n", next: "b\n" };

  it("reads the defaults when config.yaml has no guard section: enforce, every check on", () => {
    expect(guardSettings(ctx.config)).toEqual({ mode: "enforce", checks: { files: true, signoffs: true, pushers: true, members: true } });
    expect(guardSettings(withGuard("guard:\n  mode: advisory\n").config)).toMatchObject({ mode: "advisory", checks: { files: true } });
  });

  it("with files by role off, lets anyone in roles.yaml change any file but .hub/ and hub/", () => {
    const c = off("files");
    expect(guard({ author: "daria.l", pushers: ["daria.l"], changes: [spec] }, c).ok).toBe(true);
    expect(guard({ author: "daria.l", pushers: [], changes: [{ path: ".hub/config.yaml", base: "a", next: "b" }] }, c).findings[0]?.reason).toMatch(/only the admin/i);
    expect(guard({ author: "daria.l", pushers: [], changes: [{ path: "hub/cli.js", base: "a", next: "b" }] }, c).ok).toBe(false);
    // The history of sign-offs stays append-only.
    expect(guard({ author: "daria.l", pushers: [], changes: [{ path: `${F}/hub/signoffs.yaml`, base, next: "" }] }, c).findings[0]?.reason).toMatch(/append-only/);
  });

  it("with who signs a gate off, takes a sign-off from anyone in roles.yaml, still in their own name", () => {
    const c = off("signoffs");
    const save = (author: string, add: string) => guard({ author, pushers: [author], changes: [{ path: `${F}/hub/signoffs.yaml`, base, next: base + add }] }, c);
    expect(save("maksym.d", entry("clarify", "maksym.d")).ok).toBe(true);
    expect(save("olena.k", entry("qa-final", "olena.k")).ok).toBe(true);
    expect(save("maksym.d", entry("clarify", "olena.k")).findings[0]?.reason).toMatch(/must name the merge request author/);
  });

  it("with everyone who pushed off, judges the author only", () => {
    expect(guard({ author: "olena.k", pushers: ["olena.k", "daria.l"], changes: [spec] }, off("pushers")).ok).toBe(true);
  });

  it("with people not in roles.yaml off, lets an outsider change files but not .hub/ or hub/", () => {
    const c = off("members");
    expect(guard({ author: "stranger", pushers: [], changes: [spec] }, ctx).findings[0]?.reason).toMatch(/not in roles.yaml/);
    expect(guard({ author: "stranger", pushers: [], changes: [spec] }, c).ok).toBe(true);
    expect(guard({ author: "stranger", pushers: [], changes: [{ path: ".hub/roles.yaml", base: "a", next: "b" }] }, c).ok).toBe(false);
  });

  it("refuses an unknown mode, and ignores an unknown check with a warning", () => {
    expect(parseConfig(`${CONFIG}guard:\n  mode: loose\n`, "c").value).toBeUndefined();
    const r = parseConfig(`${CONFIG}guard:\n  checks:\n    reviews: false\n`, "c");
    expect(r.issues).toMatchObject([{ level: "warning", message: 'Unknown key "reviews" is ignored' }]);
  });

  it("in advisory mode stops only a change to .hub/ or hub/", () => {
    const outside = guard({ author: "daria.l", pushers: [], changes: [spec] }, ctx);
    const hubs = guard({ author: "daria.l", pushers: [], changes: [{ path: ".hub/roles.yaml", base: "a", next: "b" }] }, ctx);
    expect([blocks(outside, "enforce"), blocks(outside, "advisory")]).toEqual([true, false]);
    expect(blocks(hubs, "advisory")).toBe(true);
    expect(blocks({ ok: true, findings: [] }, "enforce")).toBe(false);
  });
});
