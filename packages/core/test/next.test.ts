import { describe, expect, it } from "vitest";
import { fixtures, type Files } from "@sdlc-hub/fixtures";
import { detectFeature, loadProject, memorySource, nextFor, type FileSource } from "../src/index.ts";

const f = fixtures["demo"]!;
const clones = new Map<string, FileSource>(Object.entries(f.teams ?? {}).map(([id, files]: [string, Files]) => [id, memorySource(files)]));
const view = { specs: memorySource(f.main), hubState: f.hubState ? memorySource(f.hubState) : null, teamClone: (id: string) => clones.get(id) ?? null, now: f.now };
const project = loadProject(view.specs).value!;
const plan = (user: string, slug: string, step?: string) => nextFor(project, detectFeature(project, view, slug), user, step);

describe("what a person does next on a feature", () => {
  it("the PO runs clarify, then signs it", () => {
    expect(plan("olena.k", "returns-portal")).toMatchObject({ kind: "run", step: "clarify", stages: ["clarify"], where: "specs", thenSignoff: true });
  });
  it("someone else is told whose step it is", () => {
    expect(plan("maksym.d", "returns-portal")).toMatchObject({ kind: "not-yours", step: "clarify", role: "po", waitingOn: ["olena.k"] });
  });
  it("the gate owner signs a step whose evidence is there", () => {
    expect(plan("taras.m", "order-webhooks")).toMatchObject({ kind: "signoff", step: "tech-design" });
  });
  it("a later step waits for the earlier ones", () => {
    expect(plan("taras.m", "order-webhooks", "data-model")).toMatchObject({ kind: "waiting", step: "data-model", on: [{ step: "tech-design", status: "signoff" }] });
  });
  it("a step that runs in the team repositories says so", () => {
    expect(plan("petro.v", "order-notes-fix")).toMatchObject({ kind: "run", step: "review", where: "teams", running: true });
  });
  it("a step in the contract team's repository is that team's, not every team's of the feature", () => {
    // order-webhooks with the web team added: the backend publishes the contract.
    const yaml = "docs/features/order-webhooks/hub/feature.yaml";
    const main = { ...f.main, [yaml]: f.main[yaml]!.replace(/teams:\n/, "teams:\n  web: { lead: petro.v }\n") };
    const v = { ...view, specs: memorySource(main) };
    const p = loadProject(v.specs).value!;
    const state = detectFeature(p, v, "order-webhooks");
    const withDesignDone = { ...state, steps: state.steps.map((s) => (s.id === "tech-design" ? { ...s, status: "done" as const } : s.id === "data-model" ? { ...s, status: "ready" as const, waitingOn: [] } : s)) };
    expect(nextFor(p, withDesignDone, "petro.v", "data-model")).toMatchObject({ kind: "not-yours", step: "data-model" });
    expect(nextFor(p, withDesignDone, "taras.m", "data-model")).toMatchObject({ kind: "run", step: "data-model", where: "contract" });
    // Once tech-design is signed, data-model waits for the backend lead alone.
    expect(state.steps.find((s) => s.id === "tech-design")!.waitingOn).toEqual(["petro.v"]);
  });
  it("a hub step has no engine stage", () => {
    expect(plan("iryna.s", "tasks-issues")).toMatchObject({ kind: "hub-step", step: "verify" });
  });
  it("a released feature has nothing next", () => {
    expect(plan("olena.k", "staff-permissions")).toEqual({ kind: "released" });
  });
  it("an unknown step is reported", () => {
    expect(plan("olena.k", "returns-portal", "nope")).toMatchObject({ kind: "unknown-step", step: "nope" });
  });
});
