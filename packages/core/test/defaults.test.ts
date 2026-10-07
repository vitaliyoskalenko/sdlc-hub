import { describe, expect, it } from "vitest";
import {
  checkEngineAgainstFlow,
  DEFAULT_FLOW_YAML,
  DEFAULT_SDD_ENGINE_YAML,
  parseEngine,
  parseFlow,
} from "../src/index.ts";

const flow = parseFlow(DEFAULT_FLOW_YAML, ".hub/flow.yaml");
const engine = parseEngine(DEFAULT_SDD_ENGINE_YAML, ".hub/engines/sdd.yaml");

const STEP_IDS = [
  "specify", "clarify", "epic", "ux-flows", "tech-design", "data-model", "api", "screens", "tasks", "sprint",
  "plan-tests", "implement", "review", "ship", "staging", "verify", "autotests", "qa-final", "accept", "release",
];

describe("default flow.yaml", () => {
  it("parses cleanly", () => expect(flow.issues).toEqual([]));

  it("has the twenty steps in order, in six lanes", () => {
    expect(flow.value?.steps.map((s) => s.id)).toEqual(STEP_IDS);
    expect(flow.value?.lanes).toEqual(["po", "pm", "designer", "dev", "qa", "ops"]);
  });

  it("does not list fix as a step", () => {
    expect(flow.value?.steps.some((s) => s.id === "fix")).toBe(false);
  });

  it("makes epic a hub step with no LLM that returns to the PO at clarify", () => {
    const epic = flow.value?.steps.find((s) => s.id === "epic");
    expect(epic).toMatchObject({ role: "pm", kind: "hub", llm: false, gate: { role: "pm", returns_to: "clarify" } });
  });

  it("sends a QA return back to verify", () => {
    expect(flow.value?.steps.find((s) => s.id === "qa-final")?.gate?.returns_to).toBe("verify");
  });

  it("marks the steps that cost no tokens", () => {
    const noLlm = flow.value?.steps.filter((s) => s.llm === false).map((s) => s.id);
    expect(noLlm).toEqual(["epic", "autotests", "qa-final", "accept"]);
  });

  it("keeps the go or no-go in release.yaml", () => {
    const accept = flow.value?.steps.find((s) => s.id === "accept");
    expect(accept?.evidence?.map((r) => r.source)).toEqual(["signoff:accept", "release:go"]);
  });

  it("sets the watch period to 7 days", () => expect(flow.value?.release.watch_days).toBe(7));

  it("says whose sign-off each Engineering gate needs", () => {
    const by = Object.fromEntries(flow.value!.steps.filter((s) => s.gate?.role === "dev").map((s) => [s.id, s.gate!.by]));
    expect(by).toEqual({
      "tech-design": "other-team-leads",
      "data-model": "contract-lead",
      api: "other-team-leads",
      tasks: "team-leads",
      review: "team-leads",
      ship: "team-leads",
    });
  });
});

describe("default engines/sdd.yaml", () => {
  it("parses cleanly", () => expect(engine.issues).toEqual([]));

  it("maps every engine step of the flow and nothing else", () => {
    expect(checkEngineAgainstFlow(engine.value!, flow.value!, "e")).toEqual([]);
  });

  it("keeps step id and engine stage apart", () => {
    expect(engine.value?.steps["tech-design"]?.stages).toEqual(["design", "sequences"]);
    expect(engine.value?.steps["ux-flows"]?.stages).toEqual(["ux-flows"]);
  });

  it("lists fix as a return from verify, apart from the steps", () => {
    expect(engine.value?.steps["fix"]).toBeUndefined();
    expect(engine.value?.returns?.["fix"]).toMatchObject({ stage: "fix", from: ["verify", "qa-final"] });
  });

  it("lets the quick and standard routes skip only SDD's optional stages", () => {
    const skippable = Object.entries(engine.value!.steps)
      .filter(([, s]) => s.skippable_on?.length)
      .map(([id]) => id);
    expect(skippable).toEqual(["clarify", "ux-flows", "data-model", "api", "screens", "plan-tests"]);
    for (const id of skippable) expect(engine.value!.steps[id]?.skippable_on).toEqual(["quick", "standard"]);
  });

  it("reads steps 5 to 7 from the contract team", () => {
    for (const id of ["tech-design", "data-model", "api"]) expect(engine.value!.steps[id]?.in).toBe("contract");
  });
});

describe("checkEngineAgainstFlow", () => {
  it("reports an engine step with no adapter entry, an unknown entry and a hub step in the adapter", () => {
    const e = structuredClone(engine.value!);
    delete e.steps["screens"];
    e.steps["deploy"] = structuredClone(e.steps["ship"]!);
    e.steps["sprint"] = structuredClone(e.steps["ship"]!);
    const msgs = checkEngineAgainstFlow(e, flow.value!, "e").map((i) => i.message);
    expect(msgs).toEqual([
      "Engine step screens has no entry in the adapter",
      "The adapter maps deploy, which is not a step of the flow",
      "The adapter maps sprint, which is a hub step",
    ]);
  });
});
