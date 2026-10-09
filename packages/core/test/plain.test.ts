import { describe, expect, it } from "vitest";
import { fixtures, type Files } from "@sdlc-hub/fixtures";
import { DEFAULT_PLAIN_ENGINE_YAML, detectFeature, listFeatures, loadProject, memorySource, nextFor, parseEngine, PLAIN_PROMPTS, type FileSource } from "../src/index.ts";

const f = fixtures["demo"]!;
const clones = new Map<string, FileSource>(Object.entries(f.teams ?? {}).map(([id, files]: [string, Files]) => [id, memorySource(files)]));
const view = (main: Files) => ({ specs: memorySource(main), hubState: f.hubState ? memorySource(f.hubState) : null, teamClone: (id: string) => clones.get(id) ?? null, now: f.now });
const withPlain: Files = { ...f.main, ".hub/config.yaml": f.main[".hub/config.yaml"]!.replace("engine: sdd", "engine: plain"), ".hub/engines/plain.yaml": DEFAULT_PLAIN_ENGINE_YAML };

describe("the plain engine", () => {
  it("is a valid adapter for the default flow, with a prompt for every stage it names", () => {
    const e = parseEngine(DEFAULT_PLAIN_ENGINE_YAML, "plain.yaml");
    expect(e.issues).toEqual([]);
    const stages = [...Object.values(e.value!.steps).flatMap((s) => s.stages), ...Object.values(e.value!.returns ?? {}).map((r) => (r as { stage: string }).stage)];
    for (const s of stages) expect(PLAIN_PROMPTS[s], s).toBeTruthy();
    const project = loadProject(memorySource(withPlain));
    expect(project.issues).toEqual([]);
    expect(project.value!.engine.id).toBe("plain");
  });

  it("gives every feature of the demo the same state as SDD does: the engine is replaceable", () => {
    const sdd = loadProject(memorySource(f.main)).value!;
    const plain = loadProject(memorySource(withPlain)).value!;
    for (const slug of listFeatures(memorySource(f.main))) {
      const a = detectFeature(sdd, view(f.main), slug);
      const b = detectFeature(plain, view(withPlain), slug);
      expect(b.steps.map((s) => [s.id, s.status]), slug).toEqual(a.steps.map((s) => [s.id, s.status]));
      expect(b.current, slug).toBe(a.current);
    }
  });

  it("hands each assistant the hub's own stage command", () => {
    const plain = loadProject(memorySource(withPlain)).value!;
    const plan = nextFor(plain, detectFeature(plain, view(withPlain), "returns-portal"), "olena.k");
    expect(plan).toMatchObject({ kind: "run", stages: ["clarify"] });
    expect(plain.engine.invoke.codex.replace("{stage}", "clarify").replace("{slug}", "returns-portal")).toBe("$hub-stage clarify returns-portal");
  });
});
