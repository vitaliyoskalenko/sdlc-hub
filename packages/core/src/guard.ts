// hub-guard: refuses a merge request that changes something outside the roles of its author or of anyone who
// pushed to it, and checks every new sign-off entry. See the specification, "Guard rules".

import picomatch from "picomatch";
import { checkChange, type AccessContext, type Change } from "./access.ts";
import type { FileSource } from "./source.ts";
import { invalidFiles } from "./validate.ts";
import { parseFeature, parseSignoffs } from "./files.ts";
import type { FeatureState } from "./detect.ts";
import { platformsOf, verificationMatrix } from "./verification.ts";
import { contractTeam, guardSettings, type Flow, type Person } from "./schema/project.ts";

export interface GuardContext extends AccessContext {
  flow: Flow;
  /** feature.yaml of a feature on the target branch, by slug. */
  feature: (slug: string) => string | undefined;
  /** The target branch, to check that .hub/ still loads as a whole after the change. */
  main?: FileSource;
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

/**
 * The hub's own files, the assistants' files and CI files: they run on every machine, so whatever the switches and
 * the mode say, only the admin changes them (and each person their own key).
 */
export const ADMIN_ONLY = [".hub/**", "hub/**", ".claude/**", ".claude-plugin/**", ".agents/**", ".codex/**", ".cursor/**", "CLAUDE.md", "AGENTS.md", ".github/**", ".gitlab-ci.yml", "ci/**"];
const HUBS_OWN = picomatch(ADMIN_ONLY, { dot: true });

/** Whether a guard result stops the merge: in advisory mode only a finding on an admin-only file does. */
export function blocks(r: { ok: boolean; findings: Finding[]; hard?: boolean }, mode: "enforce" | "advisory"): boolean {
  if (r.ok) return false;
  return mode === "enforce" || !!r.hard || r.findings.some((f) => HUBS_OWN(f.path));
}

export function guard(input: GuardInput, ctx: GuardContext): { ok: boolean; findings: Finding[]; hard?: boolean } {
  const { checks } = guardSettings(ctx.config);
  const findings: Finding[] = [];
  // A file the site could not read is refused in any mode.
  const invalid = invalidFiles(input.changes, ctx.main).map((x) => ({ user: input.author, ...x }));
  const users = [...new Set([input.author, ...(checks.pushers ? input.pushers : [])])];
  for (const change of input.changes) {
    for (const user of users) {
      const r = judge(user, change, ctx, checks);
      if (r) findings.push({ user, path: change.path, ...r });
    }
    const m = SIGNOFFS.exec(change.path);
    if (m && change.next !== undefined && !findings.some((f) => f.path === change.path)) findings.push(...entries(m[1]!, change, input.author, ctx, checks.signoffs));
  }
  findings.push(...invalid);
  return { ok: findings.length === 0, findings, ...(invalid.length ? { hard: true } : {}) };
}

/** What is wrong with one person's change, if anything, under the project's guard switches. */
function judge(user: string, change: Change, ctx: GuardContext, checks: ReturnType<typeof guardSettings>["checks"]): { reason: string; line?: number } | undefined {
  const member = ctx.roles.people.some((p) => p.user === user);
  if (member && checks.files) {
    const r = checkChange(user, change, ctx);
    return r.ok ? undefined : { reason: r.reason, ...(r.line !== undefined ? { line: r.line } : {}) };
  }
  if (!member && checks.members) return { reason: `${user} is not in roles.yaml` };
  // Files by role is off, or an outsider is let in: the hub's own files and the sign-off history still hold.
  const paths = [change.path, ...(change.from && change.from !== change.path ? [change.from] : [])];
  if (paths.some((p) => HUBS_OWN(p))) {
    const r = member ? checkChange(user, change, ctx) : undefined;
    return r?.ok ? undefined : { reason: `Only the admin changes ${paths.find((p) => HUBS_OWN(p))}: it runs on every machine, whatever the guard settings say` };
  }
  const admin = ctx.roles.people.find((p) => p.user === user)?.roles.includes("admin");
  if (SIGNOFFS.test(change.path) && !admin && change.base !== undefined && (change.next === undefined || !change.next.startsWith(change.base)))
    return { reason: "signoffs.yaml is append-only: existing entries cannot be edited or removed" };
  return undefined;
}

/** Every new entry names the author and is at a gate (or, for confirm, a step) the author owns. */
function entries(slug: string, change: Change, author: string, ctx: GuardContext, byRole = true): Finding[] {
  const out: Finding[] = [];
  const at = (reason: string) => out.push({ user: author, path: change.path, reason });
  const next = parseSignoffs(change.next ?? "", change.path);
  if (!next.value) {
    at(`The new sign-off is not a valid entry: ${next.issues.map((i) => i.message).join("; ")}`);
    return out;
  }
  const before = change.base ? (parseSignoffs(change.base, change.path).value?.length ?? 0) : 0;
  // Someone not in roles.yaml was refused for the file already, unless the guard lets outsiders in.
  const person = ctx.roles.people.find((p) => p.user === author);
  const feature = parseFeature(ctx.feature(slug) ?? "", "feature.yaml").value;
  for (const e of next.value.slice(before)) {
    if (e.user !== author) {
      at(`A new entry must name the merge request author (${author}), not ${e.user}`);
      continue;
    }
    if (!person || person.roles.includes("admin") || !byRole) continue;
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
    // The verify gate is the verdicts themselves: every criterion passes or does not apply on every platform.
    else if (step.id === "verify" && e.decision === "pass" && ctx.main) {
      const teams = Object.keys(feature?.teams ?? {}).map((id) => ({ id }));
      const m = verificationMatrix(ctx.main, slug, platformsOf(ctx.config, { teams } as unknown as FeatureState));
      if (!m.complete) at(`verify is signed while not every criterion passes or does not apply: ${m.open.slice(0, 4).join("; ")}${m.open.length > 4 ? "; …" : ""}`);
    }
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
