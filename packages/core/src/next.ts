// What a person does next on a feature: run the step's engine stage, sign its gate, or learn what it waits for.
// The plugin's hub_next answers with this before it hands a stage to the engine ("How proxying works").

import type { FeatureState, Project, StepStatus } from "./detect.ts";
import type { EvidenceSource } from "./schema/project.ts";
import { awaitsSignoff } from "./signoff.ts";

export type StepPlan =
  | { kind: "released" }
  | { kind: "unknown-step"; step: string }
  | { kind: "done" | "skipped"; step: string }
  | { kind: "not-yours"; step: string; role: string; waitingOn: string[] }
  | { kind: "waiting"; step: string; on: { step: string; status: StepStatus }[] }
  | { kind: "signoff"; step: string }
  | { kind: "hub-step"; step: string; status: StepStatus }
  | { kind: "run"; step: string; stages: string[]; where: EvidenceSource; running: boolean; returned: boolean; thenSignoff: boolean };

const OPEN: StepStatus[] = ["done", "skipped"];

export function nextFor(project: Project, state: FeatureState, user: string, stepId?: string): StepPlan {
  if (!stepId && state.current === "released") return { kind: "released" };
  const id = stepId ?? state.current;
  const i = project.flow.steps.findIndex((s) => s.id === id);
  if (i < 0) return { kind: "unknown-step", step: id };
  const step = project.flow.steps[i]!;
  const st = state.steps.find((s) => s.id === id)!;
  if (st.status === "done" || st.status === "skipped") return { kind: st.status, step: id };

  const person = project.roles.people.find((p) => p.user === user);
  const gateOwner = (st.waitingOn ?? []).includes(user);
  if (st.status === "signoff" && gateOwner) return { kind: "signoff", step: id };
  // A step in the contract team's repository is that team's alone.
  const teams = project.engine.steps[id]?.in === "contract" && state.contractTeam ? [state.contractTeam] : state.teams.map((t) => t.id);
  const owns = !!person && person.roles.includes(step.role) && (step.role !== "dev" || !teams.length || (!!person.team && teams.includes(person.team)));
  if (!owns && !gateOwner) return { kind: "not-yours", step: id, role: st.status === "signoff" && step.gate ? step.gate.role : step.role, waitingOn: st.waitingOn ?? [] };

  const before = state.steps.slice(0, i).filter((s) => !OPEN.includes(s.status));
  if (before.length) return { kind: "waiting", step: id, on: before.map((s) => ({ step: s.id, status: s.status })) };
  if (st.status === "signoff") return { kind: "not-yours", step: id, role: step.gate?.role ?? step.role, waitingOn: st.waitingOn ?? [] };

  const es = project.engine.steps[id];
  if (!es) return { kind: "hub-step", step: id, status: st.status };
  return { kind: "run", step: id, stages: es.stages, where: es.in, running: st.status === "running", returned: st.status === "returned", thenSignoff: awaitsSignoff(project, state, id) };
}
