import { describe, expect, it } from "vitest";
import { CONFIG, ROLES } from "@sdlc-hub/fixtures";
import { guard, memorySource, parseConfig, parseFlow, parseRoles, DEFAULT_FLOW_YAML, peopleChange } from "../src/index.ts";

const config = parseConfig(CONFIG, "c").value!;
const main = memorySource({ ".hub/roles.yaml": `# Who is who. Edit on People and roles.\n${ROLES}` });
const people = (text: string) => parseRoles(text, "r").value!.people;

describe("people in roles.yaml", () => {
  it("adds a person in the file's own style, keeping its comments", () => {
    const c = peopleChange(main, config, { kind: "set", person: { user: "anna.b", name: "Anna B.", roles: ["dev"], team: "web", os: "windows", assistant: "codex" } });
    expect(c.path).toBe(".hub/roles.yaml");
    expect(c.next).toContain("# Who is who.");
    expect(c.next).toContain("  - { user: anna.b, name: Anna B., role: dev, team: web, os: windows, assistant: codex }");
    expect(people(c.next!).at(-1)).toMatchObject({ user: "anna.b", roles: ["dev"], team: "web" });
  });
  it("changes a person in place, with two roles as a list", () => {
    const c = peopleChange(main, config, { kind: "set", person: { user: "iryna.s", name: "Iryna S.", roles: ["qa", "ops"] } });
    const p = people(c.next!);
    expect(p.findIndex((x) => x.user === "iryna.s")).toBe(8);
    expect(p.find((x) => x.user === "iryna.s")!.roles).toEqual(["qa", "ops"]);
    expect(c.next).toContain("roles: [ qa, ops ]");
  });
  it("removes a person; their sign-offs stay", () => {
    const c = peopleChange(main, config, { kind: "remove", user: "bohdan.r" });
    expect(people(c.next!).map((x) => x.user)).not.toContain("bohdan.r");
  });
  it("refuses what would break the file or the hub", () => {
    const set = (person: Record<string, unknown>) => () => peopleChange(main, config, { kind: "set", person: { user: "x.y", name: "X", roles: ["dev"], ...person } as never });
    expect(set({ user: "bad user" })).toThrow(/username/);
    expect(set({ roles: ["boss"] })).toThrow(/no role boss/);
    expect(set({ team: "nope" })).toThrow(/no team nope/);
    expect(set({ lead: true })).toThrow(/A lead needs a team/);
    expect(() => peopleChange(main, config, { kind: "remove", user: "nazar.t" })).toThrow(/last admin/);
    expect(() => peopleChange(main, config, { kind: "remove", user: "ghost" })).toThrow(/not in roles.yaml/);
  });
  it("is a change only the admin passes at merge", () => {
    const c = peopleChange(main, config, { kind: "remove", user: "bohdan.r" });
    const ctx = { config, roles: parseRoles(ROLES, "r").value!, flow: parseFlow(DEFAULT_FLOW_YAML, "f").value!, feature: () => undefined };
    expect(guard({ author: "nazar.t", pushers: [], changes: [c] }, ctx).ok).toBe(true);
    expect(guard({ author: "maksym.d", pushers: [], changes: [c] }, ctx).ok).toBe(false);
  });
});
