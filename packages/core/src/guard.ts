// hub-guard: refuses a merge request that changes something outside the roles of its author or of anyone who
// pushed to it, and checks every new sign-off entry. See the specification, "Guard rules".

import { checkChange, type AccessContext, type Change } from "./access.ts";
import { parseFeature, parseSignoffs } from "./files.ts";
import { contractTeam, type Flow, type Person } from "./schema/project.ts";

export interface GuardContext extends AccessContext {
  flow: Flow;
  /** feature.yaml of a feature on the target branch, by slug. */
  feature: (slug: string) => string | undefined;
}

export interface GuardInput {
  /** The merge request author, from the host's API. */
  author: string;
  /** Everyone who pushed to the branch (the pipeline's user, at least). */
  pushers: string[];
  changes: Change[];
}

export interface Finding {
  user: string;
  path: string;
  reason: string;
  line?: number;
}

const ROLE_NAME: Record<string, string> = { po: "PO", pm: "PM", designer: "the designer", dev: "Engineering", qa: "QA", ops: "Ops", admin: "the admin" };
const SIGNOFFS = /^docs\/features\/([^/]+)\/hub\/signoffs\.yaml$/;

export function guard(input: GuardInput, ctx: GuardContext): { ok: boolean; findings: Finding[] } {
  const findings: Finding[] = [];
  const users = [...new Set([input.author, ...input.pushers])];
  for (const change of input.changes) {
    for (const user of users) {
      const r = checkChange(user, change, ctx);
      if (!r.ok) findings.push({ user, path: change.path, reason: r.reason, ...(r.line !== undefined ? { line: r.line } : {}) });
    }
    const m = SIGNOFFS.exec(change.path);
    if (m && change.next !== undefined && !findings.some((f) => f.path === change.path)) findings.push(...entries(m[1]!, change, input.author, ctx));
  }
  return { ok: findings.length === 0, findings };
}

/** Every new entry names the author and is at a gate (or, for confirm, a step) the author owns. */
function entries(slug: string, change: Change, author: string, ctx: GuardContext): Finding[] {
  const out: Finding[] = [];
  const at = (reason: string) => out.push({ user: author, path: change.path, reason });
  const next = parseSignoffs(change.next ?? "", change.path);
  if (!next.value) {
    at(`The new sign-off is not a valid entry: ${next.issues.map((i) => i.message).join("; ")}`);
    return out;
  }
  const before = change.base ? (parseSignoffs(change.base, change.path).value?.length ?? 0) : 0;
  const person = ctx.roles.people.find((p) => p.user === author);
  if (!person) return out; // checkChange already refused the file
  const feature = parseFeature(ctx.feature(slug) ?? "", "feature.yaml").value;
  for (const e of next.value.slice(before)) {
    if (e.user !== author) {
      at(`A new entry must name the merge request author (${author}), not ${e.user}`);
      continue;
    }
    if (person.roles.includes("admin")) continue;
    const step = ctx.flow.steps.find((s) => s.id === e.step);
    if (!step) {
      at(`There is no step ${e.step}`);
      continue;
    }
    if (e.decision === "confirm") {
      if (!ownsStep(person, step.role, feature, ctx)) at(`Only ${ROLE_NAME[step.role] ?? step.role} confirms ${step.id}; ${author} does not`);
      continue;
    }
    if (step.id === "qa-final" && !person.roles.includes("qa")) {
      at(`The QA decision at qa-final is QA's; ${author} is not QA`);
      continue;
    }
    if (!step.gate || step.gate.role === "auto") {
      at(`${step.id} has no gate to sign`);
      continue;
    }
    if (!signs(person, step.gate, feature, ctx)) at(`${step.id} is signed by ${ROLE_NAME[step.gate.role] ?? step.gate.role}${byText(step.gate.by)}; ${author} is not`);
  }
  return out;
}

const byText = (by: string) => ({ role: "", "team-leads": " (a lead of the feature's teams)", "other-team-leads": " (a lead of a team other than the contract team)", "contract-lead": " (the contract team's lead)" })[by] ?? "";

type Gate = NonNullable<Flow["steps"][number]["gate"]>;
type FeatureFile = ReturnType<typeof parseFeature>["value"];

function leadOf(person: Person, feature: FeatureFile, ctx: GuardContext): string[] {
  if (!person.roles.includes("dev") || !person.lead || !person.team) return [];
  const teams = feature?.teams ? Object.entries(feature.teams).filter(([, t]) => t.lead === person.user).map(([id]) => id) : [];
  if (teams.length) return teams;
  // Without leads in feature.yaml, roles.yaml decides; the feature must include the person's team.
  const inFeature = !feature?.teams || Object.keys(feature.teams).includes(person.team);
  return inFeature && ctx.config.teams.some((t) => t.id === person.team) ? [person.team] : [];
}

function signs(person: Person, gate: Gate, feature: FeatureFile, ctx: GuardContext): boolean {
  if (gate.by === "role") return person.roles.includes(gate.role);
  const teams = leadOf(person, feature, ctx);
  const contract = contractTeam(ctx.config)?.id;
  const contractInFeature = contract && (!feature?.teams || Object.keys(feature.teams).includes(contract)) ? contract : undefined;
  if (gate.by === "team-leads") return teams.length > 0;
  if (gate.by === "other-team-leads") return contractInFeature ? teams.some((t) => t !== contractInFeature) || (Object.keys(feature?.teams ?? {}).length === 1 && teams.length > 0) : teams.length > 0;
  return contractInFeature ? teams.includes(contractInFeature) : teams.length > 0; // contract-lead
}

function ownsStep(person: Person, role: string, feature: FeatureFile, ctx: GuardContext): boolean {
  if (!person.roles.includes(role)) return false;
  return role !== "dev" || !feature?.teams || (person.team !== undefined && Object.keys(feature.teams).includes(person.team)) || leadOf(person, feature, ctx).length > 0;
}
