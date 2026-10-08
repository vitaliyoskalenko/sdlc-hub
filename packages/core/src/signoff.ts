// A sign-off or a return recorded from the site: the new entry of signoffs.yaml, as a change the guard checks
// before anything is pushed. The entry records the content hash of the file it approves (see "Guard rules").

import { contentHash } from "./content/hash.ts";
import type { Change } from "./access.ts";
import type { FeatureState, Project } from "./detect.ts";
import { parseBugFile, parseSignoffs } from "./files.ts";
import type { FileSource } from "./source.ts";

export type SignoffAction = { decision: "pass"; step: string } | { decision: "return"; step: string; reason: string };

/** The file names a step's evidence asks for in product-specs, in order; globs are skipped. */
function ownFiles(project: Project, stepId: string): string[] | null {
  const es = project.engine.steps[stepId];
  const step = project.flow.steps.find((s) => s.id === stepId);
  if (es && es.in !== "specs") return null;
  const reqs = es ? es.done_when : (step?.evidence ?? []);
  const out: string[] = [];
  for (const r of reqs)
    for (const a of r.anyOf) {
      if (a.kind === "file" && !/[*?[{]/.test(a.glob)) out.push(a.glob);
      if (a.kind === "section") out.push(a.file);
    }
  return out;
}

/**
 * The file a sign-off of this step approves: the step's own file in product-specs, or, when the gate is the step's
 * only evidence, the previous step's file (clarify approves spec.md). None for steps whose files are elsewhere.
 */
export function approvedFile(project: Project, specs: FileSource, slug: string, stepId: string): string | undefined {
  const dir = `docs/features/${slug}`;
  const exists = (f: string) => specs.read(`${dir}/${f}`) !== undefined;
  const own = ownFiles(project, stepId);
  if (own === null) return undefined;
  const found = own.find(exists);
  if (found) return `${dir}/${found}`;
  if (own.length) return undefined;
  const i = project.flow.steps.findIndex((s) => s.id === stepId);
  const prev = i > 0 ? ownFiles(project, project.flow.steps[i - 1]!.id) : null;
  const p = prev?.find(exists);
  return p ? `${dir}/${p}` : undefined;
}

const q = (s: string) => JSON.stringify(s);

/** The change to signoffs.yaml that records the action: the file on main with one entry appended. */
export function signoffChange(project: Project, specs: FileSource, slug: string, user: string, action: SignoffAction, at: string): Change {
  const path = `docs/features/${slug}/hub/signoffs.yaml`;
  const base = specs.read(path);
  if (action.decision === "return" && !action.reason.trim()) throw new Error("A return needs a reason");
  const file = approvedFile(project, specs, slug, action.step);
  const lines = [`- step: ${action.step}`, `  user: ${q(user)}`, `  at: ${at}`];
  if (file) lines.push(`  file: ${file}`, `  hash: ${contentHash(specs.read(file)!)}`);
  lines.push(`  decision: ${action.decision}`);
  if (action.decision === "return") {
    const before = (base ? (parseSignoffs(base, path).value ?? []) : []).filter((e) => e.step === action.step && e.decision === "return").length;
    lines.push(`  reason: ${q(action.reason.trim())}`, `  cycle: ${before + 1}`);
  }
  const head = base === undefined || base.trim() === "" || base.trim() === "[]" ? "" : base.endsWith("\n") ? base : `${base}\n`;
  return { path, ...(base !== undefined ? { base } : {}), next: `${head}${lines.join("\n")}\n` };
}

/**
 * Whether a step's gate waits for a sign-off now: its evidence is there (status signoff), it came back after a
 * return, or the sign-off is the step's only evidence (clarify) and the step is open.
 */
export function awaitsSignoff(project: Project, state: FeatureState, stepId: string): boolean {
  const step = project.flow.steps.find((s) => s.id === stepId);
  const st = state.steps.find((s) => s.id === stepId);
  if (!step?.gate || step.gate.role === "auto" || !st) return false;
  if (st.status === "signoff" || st.status === "returned") return true;
  if (st.status !== "ready" && st.status !== "running") return false;
  const reqs = project.engine.steps[stepId]?.done_when ?? step.evidence ?? [];
  return reqs.length > 0 && reqs.every((r) => r.anyOf.every((a) => a.kind === "signoff" && a.step === stepId));
}

export interface BugInput {
  title: string;
  ac?: string;
  platforms?: string[];
  team: string;
  severity: string;
  body?: string;
}

/**
 * A new bug file, `hub/bugs/BUG-NNNN.md`, numbered after the highest bug of every feature. Two bugs filed at the
 * same moment get the same number; the second merge request then fails to merge and is filed again.
 */
export function bugChange(specs: FileSource, slug: string, b: BugInput, user: string, foundIn?: string, teams?: string[]): Change {
  if (!b.title.trim()) throw new Error("A bug needs a title");
  if (teams && !teams.includes(b.team)) throw new Error(`There is no team ${b.team}; the teams are ${teams.join(", ")}`);
  const highest = specs
    .list("docs/features")
    .map((p) => /\/hub\/bugs\/BUG-(\d+)\.md$/.exec(p)?.[1])
    .filter((x): x is string => !!x)
    .reduce((n, x) => Math.max(n, Number(x)), 0);
  const id = `BUG-${String(highest + 1).padStart(4, "0")}`;
  const lines = ["---", `id: ${id}`, `title: ${q(b.title.trim())}`];
  if (b.ac) lines.push(`ac: ${b.ac}`);
  if (b.platforms?.length) lines.push(`platforms: [${b.platforms.join(", ")}]`);
  lines.push(`team: ${b.team}`, `severity: ${b.severity}`, "status: open", `found_by: ${q(user)}`);
  if (foundIn) lines.push(`found_in: ${foundIn}`);
  lines.push("---", (b.body ?? "").trim(), "");
  const path = `docs/features/${slug}/hub/bugs/${id}.md`;
  const next = lines.join("\n");
  const parsed = parseBugFile(next, path);
  if (!parsed.value) throw new Error(parsed.issues.map((i) => i.message).join("; "));
  return { path, next };
}
