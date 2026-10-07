// Checks that span two files of .hub/.

import type { Issue } from "./issues.ts";
import type { Engine, Flow } from "./schema/project.ts";

/** Every engine step of the flow has an adapter entry, and the adapter maps nothing else. */
export function checkEngineAgainstFlow(engine: Engine, flow: Flow, file: string): Issue[] {
  const issues: Issue[] = [];
  const kind = new Map(flow.steps.map((s) => [s.id, s.kind]));
  for (const s of flow.steps)
    if (s.kind === "engine" && !engine.steps[s.id])
      issues.push({ level: "error", file, path: `steps.${s.id}`, message: `Engine step ${s.id} has no entry in the adapter` });
  for (const id of Object.keys(engine.steps)) {
    if (!kind.has(id)) issues.push({ level: "error", file, path: `steps.${id}`, message: `The adapter maps ${id}, which is not a step of the flow` });
    else if (kind.get(id) === "hub") issues.push({ level: "error", file, path: `steps.${id}`, message: `The adapter maps ${id}, which is a hub step` });
  }
  for (const [id, r] of Object.entries(engine.returns ?? {}))
    if (!kind.has(r.from)) issues.push({ level: "error", file, path: `returns.${id}.from`, message: `Return ${id} starts at ${r.from}, which is not a step` });
  return issues;
}
