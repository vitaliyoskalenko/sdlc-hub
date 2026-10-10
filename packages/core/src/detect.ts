// Step detection: where each feature is, derived from evidence and never typed.
// See the specification, "How the current step is detected".

import picomatch from "picomatch";
import { contentHash } from "./content/hash.ts";
import { parseStructure } from "./content/structure.ts";
import type { Atom, Requirement } from "./evidence.ts";
import { parseBugFile, parseConfig, parseEngine, parseEventsJsonl, parseFeature, parseFlow, parseRelease, parseRoles, parseSignoffs, parseTeamSnapshot, parseTestRun } from "./files.ts";
import { featureTime, stepTimes, type StepTime } from "./times.ts";
import { waitedFor } from "./waits.ts";
import { hasErrors, type Issue, type Result } from "./issues.ts";
import { checkEngineAgainstFlow } from "./project-check.ts";
import { buildTeamSnapshot, readRoute, readSize, readTargetSurfaces, UI_SURFACES } from "./sdd.ts";
import type { Route, Size } from "./schema/common.ts";
import type { BugFile, HubEventLine } from "./files.ts";
import type { BugFront, Feature, Release, Signoff, TeamSnapshot, TestRun } from "./schema/feature.ts";
import { contractTeam, type Config, type Engine, type Flow, type FlowStep, type Roles } from "./schema/project.ts";
import type { FileSource } from "./source.ts";

export interface Project {
  config: Config;
  roles: Roles;
  flow: Flow;
  engine: Engine;
}

export interface ProjectView {
  /** `main` of product-specs. */
  specs: FileSource;
  /** The hub-state branch, if it exists. `author("<path>#L<n>")` names the author of one line. */
  hubState: FileSource | null;
  /** The local clone of a team repository, if the person has it. */
  teamClone(team: string): FileSource | null;
  /** The current time, ISO 8601. */
  now: string;
}

export type StepStatus = "done" | "running" | "signoff" | "returned" | "blocked" | "ready" | "todo" | "skipped" | "missed";

export interface StepState {
  id: string;
  role: string;
  status: StepStatus;
  /** The person on a running or finished step, from git or from the sign-off. */
  by?: string;
  /** Where the evidence came from. */
  source?: "specs" | "hub-state" | "local-clone";
  /** Users the step waits for. */
  waitingOn?: string[];
  /** A return reason, the reason for blocked, or the warning for missed. */
  reason?: string;
  /** A sign-off exists but the file changed since. */
  stale?: boolean;
}

export interface TeamState {
  id: string;
  source: "hub-state" | "local-clone" | "none";
  snapshot?: TeamSnapshot;
}

export interface CrossTeamWait {
  team: string;
  task: string;
  on: string;
  /** False when the referenced team or task does not exist: shown as a warning, never dropped. */
  known: boolean;
  done: boolean;
}

export interface FeatureState {
  slug: string;
  title?: string;
  size?: Size;
  route: Route;
  routeDefaulted: boolean;
  steps: StepState[];
  /** The current step id, or `released`. */
  current: string;
  cycle: number;
  contractTeam: string | null;
  teams: TeamState[];
  waits: CrossTeamWait[];
  testRuns: TestRun[];
  /** Every bug of the feature, by id. */
  bugs: BugFront[];
  blockingBugs: string[];
  warnings: string[];
  issues: Issue[];
  /** From the stage events: each step's first start and last finish. */
  times: StepTime[];
  /** From the first event to the release (the start of the watch), or to now. */
  leadTime?: { started: string; finished?: string; days: number };
  /** Days each client team waited for the contract team, from the waits hub-report keeps. */
  waited: { team: string; days: number; waiting: boolean }[];
}

// --- the project

export function loadProject(specs: FileSource): Result<Project> {
  const issues: Issue[] = [];
  const read = <T>(path: string, parse: (t: string, f: string) => Result<T>): T | undefined => {
    const text = specs.read(path);
    if (text === undefined) {
      issues.push({ level: "error", file: path, message: "The file is missing" });
      return undefined;
    }
    const r = parse(text, path);
    issues.push(...r.issues);
    return r.value;
  };
  const config = read(".hub/config.yaml", parseConfig);
  const roles = read(".hub/roles.yaml", parseRoles);
  const flow = read(".hub/flow.yaml", parseFlow);
  const engine = config ? read(`.hub/engines/${config.engine}.yaml`, parseEngine) : undefined;
  if (engine && flow) issues.push(...checkEngineAgainstFlow(engine, flow, `.hub/engines/${config!.engine}.yaml`));
  if (config && roles)
    for (const p of roles.people)
      if (p.team && !config.teams.some((t) => t.id === p.team))
        issues.push({ level: "warning", file: ".hub/roles.yaml", message: `${p.user} is in team ${p.team}, which config.yaml does not list` });
  if (!config || !roles || !flow || !engine || hasErrors(issues)) return { issues };
  return { value: { config, roles, flow, engine }, issues };
}

export function listFeatures(specs: FileSource): string[] {
  const slugs = new Set<string>();
  for (const p of specs.list("docs/features")) {
    const m = /^docs\/features\/([^/]+)\/(spec\.md|hub\/feature\.yaml)$/.exec(p);
    if (m) slugs.add(m[1]!);
  }
  return [...slugs].sort();
}

// --- one feature

type Level = "full" | "partial" | "none";

interface Eval {
  level: Level;
  source?: StepState["source"];
  by?: string;
  /** Roles whose record is missing, when only a person's record is missing. */
  humanMissing?: string[];
  blocked?: string;
  stale?: boolean;
  /** Users still expected to sign. */
  missingSigners?: string[];
}

interface ActiveReturn {
  gate: string;
  to: string;
  at: string;
  reason: string;
  user: string;
}

export function detectFeature(project: Project, view: ProjectView, slug: string): FeatureState {
  const { config, roles, flow, engine } = project;
  const dir = `docs/features/${slug}`;
  const issues: Issue[] = [];
  const warnings: string[] = [];
  const parse = <T>(source: FileSource | null, path: string, parser: (t: string, f: string) => Result<T>): T | undefined => {
    const text = source?.read(path);
    if (text === undefined) return undefined;
    const r = parser(text, path);
    issues.push(...r.issues);
    return r.value;
  };

  const feature: Feature | undefined = parse(view.specs, `${dir}/hub/feature.yaml`, parseFeature);
  const sizeText = view.specs.read(`${dir}/.size`);
  const routeText = view.specs.read(`${dir}/.route`);
  const size = sizeText === undefined ? undefined : readSize(sizeText).value;
  const routeRead = routeText === undefined ? undefined : readRoute(routeText).value;
  if (sizeText !== undefined && !size) issues.push({ level: "error", file: `${dir}/.size`, line: 1, message: "Write one of XS, S, M, L, XL" });
  if (routeText !== undefined && !routeRead) issues.push({ level: "error", file: `${dir}/.route`, line: 1, message: "Write one of quick, standard, full" });
  const route: Route = routeRead ?? "standard";
  const signoffs: Signoff[] = parse(view.specs, `${dir}/hub/signoffs.yaml`, parseSignoffs) ?? [];
  const release: Release | undefined = parse(view.specs, `${dir}/hub/release.yaml`, parseRelease);
  const bugs: BugFile[] = view.specs
    .list(`${dir}/hub/bugs`)
    .filter((p) => p.endsWith(".md"))
    .flatMap((p) => parse(view.specs, p, parseBugFile) ?? []);
  const blockingBugs = bugs
    .filter((b) => (b.front.severity === "critical" || b.front.severity === "high") && b.front.status !== "closed" && b.front.status !== "rejected")
    .map((b) => b.front.id);

  // Teams of the feature, and where their data comes from: hub-state first, the local clone as fallback.
  const teamIds = feature?.teams ? Object.keys(feature.teams) : config.teams.map((t) => t.id);
  for (const id of teamIds)
    if (!config.teams.some((t) => t.id === id)) warnings.push(`feature.yaml names the team ${id}, which is not in config.yaml`);
  const teams: TeamState[] = teamIds.map((id) => loadTeam(id));
  function loadTeam(id: string): TeamState {
    const path = `features/${slug}/teams/${id}.json`;
    const text = view.hubState?.read(path);
    if (text !== undefined) {
      const r = parseTeamSnapshot(text, path);
      if (r.value) return { id, source: "hub-state", snapshot: r.value };
      issues.push(...r.issues.map((i) => ({ ...i, level: "warning" as const })));
      warnings.push(`The hub-state snapshot of ${id} is malformed and was ignored`);
    }
    const clone = view.teamClone(id);
    if (clone) {
      const r = buildTeamSnapshot({ team: id, slug, source: clone, commit: null, now: view.now });
      if (r.value) return { id, source: "local-clone", snapshot: r.value };
    }
    return { id, source: "none" };
  }
  const contract = contractTeam(config);
  const contractId = contract && teamIds.includes(contract.id) ? contract.id : null;
  for (const t of teams) for (const w of t.snapshot?.warnings ?? []) warnings.push(`${t.id}: ${w}`);

  // Lead checks: a lead named in feature.yaml must be a developer of that team with lead: true.
  for (const [team, { lead }] of Object.entries(feature?.teams ?? {})) {
    const p = roles.people.find((x) => x.user === lead);
    if (!p || !p.lead || p.team !== team || !p.roles.includes("dev"))
      warnings.push(`feature.yaml names ${lead} as the lead of ${team}, but roles.yaml does not list them as a lead of that team`);
  }

  // Cross-team waits from the tracker's Blocked by column.
  const waits: CrossTeamWait[] = [];
  for (const t of teams)
    for (const row of t.snapshot?.tracker ?? [])
      for (const ref of row.blocked_by.filter((r) => r.includes(":"))) {
        const [otherTeam, taskId] = ref.split(":") as [string, string];
        const other = teams.find((x) => x.id === otherTeam);
        const exists = !!other?.snapshot && (other.snapshot.tasks?.some((x) => x.id === taskId) || other.snapshot.tracker?.some((x) => x.id === taskId));
        const done = other?.snapshot?.tracker?.find((x) => x.id === taskId)?.status === "done";
        waits.push({ team: t.id, task: row.id, on: ref, known: !!exists, done: !!done });
        if (!exists) warnings.push(`${t.id} ${row.id} waits for ${ref}, which is not a known task`);
      }

  const testRuns: TestRun[] = (view.hubState?.list(`features/${slug}/tests`) ?? [])
    .filter((p) => p.endsWith(".json"))
    .flatMap((p) => parse(view.hubState, p, parseTestRun) ?? []);
  // A team's newest CI result must be for its newest change: a result for an older commit says nothing about it.
  for (const t of teams) {
    const run = testRuns.filter((r) => r.team === t.id && r.source === "ci").sort((a, b) => a.at.localeCompare(b.at)).at(-1);
    const sha = run?.ref?.split("@")[1];
    const commit = t.snapshot?.source_commit;
    if (run && sha && commit && !commit.startsWith(sha) && !sha.startsWith(commit) && t.snapshot!.generated_at > run.at)
      warnings.push(`The CI result of ${t.id} (${run.result ?? "no result"}, ${run.ref}) is older than its newest change (${commit.slice(0, 7)}): wait for the pipeline of that change before deciding`);
  }

  const eventsPath = `features/${slug}/events.jsonl`;
  const events: HubEventLine[] = [];
  const eventsText = view.hubState?.read(eventsPath);
  if (eventsText !== undefined) {
    const r = parseEventsJsonl(eventsText, eventsPath);
    issues.push(...r.issues.map((i) => ({ ...i, level: "warning" as const })));
    events.push(...(r.value ?? []));
  }

  // Returns: the latest decision of a gate, if it is a return, reopens the steps from its target to the gate.
  const index = new Map(flow.steps.map((s, i) => [s.id, i]));
  const activeReturns: ActiveReturn[] = [];
  for (const s of flow.steps) {
    const decisions = signoffs.filter((e) => e.step === s.id && (e.decision === "pass" || e.decision === "return")).sort(byTime);
    const last = decisions.at(-1);
    if (last?.decision === "return")
      activeReturns.push({ gate: s.id, to: last.returns_to ?? s.gate?.returns_to ?? s.id, at: last.at, reason: last.reason ?? "", user: last.user });
  }
  const reopenedAt = (stepId: string): string | undefined => {
    const i = index.get(stepId)!;
    return activeReturns
      .filter((r) => index.get(r.to)! <= i && i <= index.get(r.gate)!)
      .map((r) => r.at)
      .sort()
      .at(-1);
  };
  const cycle = 1 + signoffs.filter((e) => e.step === "qa-final" && e.decision === "return").length;

  // --- people

  const peopleWithRole = (role: string) => roles.people.filter((p) => p.roles.includes(role)).map((p) => p.user);
  const leadOf = (team: string): string | undefined =>
    feature?.teams?.[team]?.lead ?? roles.people.find((p) => p.team === team && p.lead && p.roles.includes("dev"))?.user;
  const leads = (ids: string[]) => ids.map(leadOf).filter((u): u is string => !!u);
  function requiredSigners(step: FlowStep): { anyOf?: string[]; allOf?: string[] } {
    const gate = step.gate!;
    const orAllLeads = (users: string[]) => ({ allOf: users.length ? users : leads(teamIds) });
    switch (gate.by) {
      case "role":
        return { anyOf: peopleWithRole(gate.role) };
      case "team-leads":
        return { allOf: leads(teamIds) };
      case "other-team-leads":
        // With no contract team, or no team besides it, each team's own lead signs.
        return orAllLeads(leads(contractId ? teamIds.filter((t) => t !== contractId) : teamIds));
      case "contract-lead":
        return orAllLeads(leads(contractId ? [contractId] : teamIds));
    }
  }
  const stepPeople = (step: FlowStep): string[] => (step.role === "dev" ? leads(teamIds) : peopleWithRole(step.role));

  // --- evidence

  const specsFiles = view.specs.list(dir).map((p) => p.slice(dir.length + 1));
  const sourcesFor = (where: string): TeamState[] => {
    if (where === "contract") return contractId ? teams.filter((t) => t.id === contractId) : teams;
    return teams;
  };

  function signoffEval(stepId: string): Eval {
    const step = flow.steps[index.get(stepId)!]!;
    if (!step.gate) return { level: "none" };
    const since = reopenedAt(stepId);
    let stale = false;
    const valid = signoffs.filter((e) => {
      if (e.step !== stepId || e.decision !== "pass") return false;
      if (since && e.at <= since) return false;
      if (e.file && e.hash) {
        const text = view.specs.read(e.file);
        if (text === undefined || contentHash(text) !== e.hash) {
          stale = true;
          return false;
        }
      }
      return true;
    });
    const signers = [...new Set(valid.map((e) => e.user))];
    const req = requiredSigners(step);
    const last = valid.sort(byTime).at(-1)?.user;
    if (req.anyOf) {
      const ok = signers.some((u) => req.anyOf!.includes(u));
      return ok ? { level: "full", by: last, source: "specs" } : { level: "none", stale, missingSigners: req.anyOf, humanMissing: [step.gate.role] };
    }
    const missing = req.allOf!.filter((u) => !signers.includes(u));
    if (req.allOf!.length > 0 && missing.length === 0) return { level: "full", by: last, source: "specs" };
    return { level: signers.length > 0 ? "partial" : "none", stale, missingSigners: missing, humanMissing: [step.gate.role] };
  }

  function atomEval(atom: Atom, where: string): Eval {
    switch (atom.kind) {
      case "file": {
        const match = picomatch(atom.glob, { dot: true });
        if (where === "specs") {
          const f = specsFiles.find((p) => match(p));
          return f ? { level: "full", source: "specs", by: view.specs.author?.(`${dir}/${f}`) } : { level: "none" };
        }
        const ts = sourcesFor(where);
        const have = ts.filter((t) => t.snapshot?.files.some((p) => match(p)));
        // The contract team's files also reach product-specs by the contract merge request.
        if (where === "contract") {
          const f = specsFiles.find((p) => match(p));
          if (f && contractId) return { level: "full", source: "specs", by: view.specs.author?.(`${dir}/${f}`) };
        }
        if (have.length === 0) return { level: "none" };
        const source = have.every((t) => t.source === "hub-state") ? "hub-state" : "local-clone";
        return { level: have.length === ts.length ? "full" : "partial", source, by: have[0]?.snapshot?.mr?.author };
      }
      case "section": {
        const text = view.specs.read(`${dir}/${atom.file}`);
        const found = text !== undefined && parseStructure(text).sections.some((s) => s.heading === `## ${atom.heading}`);
        return found ? { level: "full", source: "specs", by: view.specs.author?.(`${dir}/${atom.file}`) } : { level: "none" };
      }
      case "signoff":
        return signoffEval(atom.step);
      case "tracker-all-done": {
        const ts = sourcesFor(where);
        const rows = ts.map((t) => t.snapshot?.tracker);
        const allDone = rows.every((r) => r && r.length > 0 && r.every((x) => x.status === "done"));
        const anyDone = rows.some((r) => r?.some((x) => x.status !== "todo"));
        return { level: allDone ? "full" : anyDone ? "partial" : "none", source: teamSource(ts) };
      }
      case "review-pass": {
        const ts = sourcesFor(where);
        const pass = ts.every((t) => t.snapshot?.review?.verdict === "PASS");
        const any = ts.some((t) => t.snapshot?.review);
        return { level: pass ? "full" : any ? "partial" : "none", source: teamSource(ts) };
      }
      case "mr-open": {
        const ts = sourcesFor(where);
        const open = ts.filter((t) => t.snapshot?.mr && t.snapshot.mr.state !== "closed");
        return { level: open.length === ts.length ? "full" : open.length ? "partial" : "none", source: teamSource(ts), by: open[0]?.snapshot?.mr?.author };
      }
      case "mr-contract": {
        // Phase 1a has no host API: the merged contract merge request is seen as the contract files on main.
        const f = specsFiles.find((p) => p.startsWith("contracts/"));
        return f ? { level: "full", source: "specs", by: view.specs.author?.(`${dir}/${f}`) } : { level: "none", humanMissing: ["dev"] };
      }
      case "release":
        return releaseEval(atom.what);
      case "route":
        return route === atom.route ? { level: "full", source: "specs" } : { level: "none" };
      case "tests-ci-green": {
        const latest = teamIds.map((id) => testRuns.filter((r) => r.team === id && r.source === "ci").sort(byTime).at(-1));
        const red = latest.flatMap((r, i) => (r?.result === "failed" ? [teamIds[i]!] : []));
        if (red.length) return { level: "partial", blocked: `The latest CI run is red in ${red.join(", ")}` };
        const green = latest.filter((r) => r?.result === "passed").length;
        return { level: green === teamIds.length ? "full" : green ? "partial" : "none" };
      }
    }
  }

  function releaseEval(what: string): Eval {
    switch (what) {
      case "staging-passed":
        return release?.staging?.smoke === "passed" ? { level: "full", source: "specs" } : { level: "none", humanMissing: ["ops"] };
      case "go":
        return release?.go?.value === "go" ? { level: "full", source: "specs", by: release.go.user } : { level: "none", humanMissing: ["pm"] };
      case "rolled-out": {
        const stage = release?.rollout?.stage ?? 0;
        return { level: stage >= 100 ? "full" : stage > 0 ? "partial" : "none", source: "specs" };
      }
      case "watch-over": {
        const w = release?.watch;
        if (!w) return { level: "none" };
        const end = new Date(w.started);
        end.setUTCDate(end.getUTCDate() + w.days);
        return { level: new Date(view.now) >= end ? "full" : "partial", source: "specs" };
      }
    }
    return { level: "none" };
  }

  function requirementEval(req: Requirement, where: string): Eval {
    const evals = req.anyOf.map((a) => atomEval(a, where));
    const order: Level[] = ["full", "partial", "none"];
    return evals.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level))[0]!;
  }

  // --- statuses

  const states: StepState[] = [];
  const evidenceOf: Level[] = [];
  for (const step of flow.steps) {
    const es = engine.steps[step.id];
    const reqs = es ? es.done_when : step.evidence ?? [];
    const where = es ? es.in : "specs";
    const evals = reqs.map((r) => requirementEval(r, where));
    const level: Level = evals.every((e) => e.level === "full") ? "full" : evals.some((e) => e.level !== "none") ? "partial" : "none";
    evidenceOf.push(level);
    // The status is set in every branch below; "todo" is only the starting value.
    const state: StepState = { id: step.id, role: step.role, status: "todo" };
    const src = evals.find((e) => e.source)?.source;
    if (src) state.source = src;

    const ret = activeReturns.find((r) => r.to === step.id);
    const needsSignoff = !!step.gate && step.gate.role !== "auto" && step.kind === "engine" && !reqs.some((r) => r.anyOf.some((a) => a.kind === "signoff" && a.step === step.id));
    const gateEval = step.gate && step.gate.role !== "auto" ? signoffEval(step.id) : undefined;

    if (ret && gateEval?.level !== "full") {
      Object.assign(state, { status: "returned", by: ret.user, reason: ret.reason, waitingOn: stepPeople(step) });
    } else if (feature?.ui === false && (step.id === "ux-flows" || step.id === "screens")) {
      Object.assign(state, { status: "skipped", reason: "No user interface: ui: false in feature.yaml" });
    } else if (step.id === "api" && !contractId) {
      Object.assign(state, { status: "skipped", reason: "No team of this feature publishes a contract" });
    } else if (level === "full") {
      if (needsSignoff && gateEval!.level !== "full") {
        Object.assign(state, { status: "signoff", waitingOn: gateEval!.missingSigners ?? [], ...(gateEval!.stale ? { stale: true, reason: "Changed since sign-off" } : {}) });
        const by = evals.find((e) => e.by)?.by;
        if (by) state.by = by;
      } else {
        state.status = "done";
        const by = (needsSignoff ? gateEval?.by : undefined) ?? [...evals].reverse().find((e) => e.by)?.by;
        if (by) state.by = by;
      }
    } else {
      const blocked = evals.find((e) => e.blocked)?.blocked ?? (step.id === "implement" ? implementBlocked() : undefined);
      const running = runningEvent(step.id);
      const humanOnly = level === "partial" && evals.every((e) => e.level === "full" || (e.humanMissing && !e.blocked));
      if (blocked) Object.assign(state, { status: "blocked", reason: blocked });
      else if (humanOnly) {
        const missing = evals.filter((e) => e.level !== "full");
        const stale = missing.some((e) => e.stale);
        Object.assign(state, { status: "signoff", waitingOn: [...new Set(missing.flatMap((e) => e.missingSigners ?? e.humanMissing!.flatMap(peopleWithRole)))], ...(stale ? { stale: true, reason: "Changed since sign-off" } : {}) });
      } else if (running || level === "partial") {
        state.status = "running";
        const by = running ? view.hubState?.author?.(`${eventsPath}#L${running.line}`) : evals.find((e) => e.by)?.by;
        if (by) state.by = by;
      } else {
        state.status = "todo";
        if (evals.some((e) => e.stale)) Object.assign(state, { stale: true, reason: "Changed since sign-off" });
      }
    }
    states.push(state);
  }

  // Skipped or missed: no evidence while a later step has evidence. CI results alone do not count as
  // later evidence, because a green pipeline does not mean the human steps before it happened.
  const impliesProgress = (i: number) =>
    !(flow.steps[i]!.evidence ?? []).every((r) => r.anyOf.every((a) => a.kind === "tests-ci-green")) || !!engine.steps[flow.steps[i]!.id];
  states.forEach((s, i) => {
    if (s.status !== "todo") return;
    const later = states.some((o, j) => j > i && impliesProgress(j) && (evidenceOf[j] !== "none" || ["done", "running", "signoff", "returned", "blocked"].includes(o.status)));
    if (!later) return;
    const skippable = engine.steps[s.id]?.skippable_on ?? [];
    if (skippable.includes(route)) {
      s.status = "skipped";
      s.reason = `Skipped on the ${route} route`;
    } else {
      s.status = "missed";
      s.reason = `${s.id} has no evidence, but later steps do, and the ${route} route requires it`;
      warnings.push(`Missed step: ${s.reason}`);
    }
  });

  // Ready: the first step still to do whose earlier steps are all done or skipped.
  const firstOpen = states.findIndex((s) => !["done", "skipped"].includes(s.status));
  if (firstOpen >= 0 && states[firstOpen]!.status === "todo") {
    const s = states[firstOpen]!;
    s.status = "ready";
    s.waitingOn = stepPeople(flow.steps[firstOpen]!);
  }

  const active = ["running", "signoff", "returned", "blocked", "missed"];
  const lastActive = [...states].reverse().find((s) => active.includes(s.status));
  const released = states.at(-1)?.status === "done";
  const current = released ? "released" : lastActive?.id ?? states.find((s) => s.status === "ready")?.id ?? states.find((s) => s.status === "todo")?.id ?? "released";

  if (routeText === undefined && feature) warnings.push("No .route: the route counts as standard");

  // SDD's own no-UI signal for screens is target_surfaces in sad.md; check it against feature.yaml.
  const specsSad = view.specs.read(`${dir}/sad.md`);
  const surfaces =
    (specsSad === undefined ? undefined : readTargetSurfaces(specsSad)) ??
    (contractId ? teams.find((t) => t.id === contractId) : teams.find((t) => t.snapshot?.target_surfaces))?.snapshot?.target_surfaces ??
    undefined;
  if (surfaces) {
    const hasUi = surfaces.some((s) => (UI_SURFACES as readonly string[]).includes(s));
    if (feature?.ui === false && hasUi)
      warnings.push(`feature.yaml says ui: false, but sad.md declares a user interface (${surfaces.join(", ")})`);
    if (feature && feature.ui !== false && !hasUi)
      warnings.push(`sad.md declares no user interface (${surfaces.join(", ")}): set ui: false in feature.yaml so ux-flows and screens show as skipped`);
  }

  const lead = featureTime(events, view.now, released ? release?.watch?.started : undefined);
  return {
    slug,
    ...(feature?.title ? { title: feature.title } : {}),
    ...(size ? { size } : {}),
    route,
    routeDefaulted: routeRead === undefined,
    steps: states,
    current,
    cycle,
    contractTeam: contractId,
    teams,
    waits,
    testRuns,
    bugs: bugs.map((b) => b.front).sort((a, b) => a.id.localeCompare(b.id)),
    blockingBugs,
    warnings,
    issues,
    times: stepTimes(events, view.now),
    waited: contractId ? waitedFor(teams, contractId, view.now) : [],
    ...(lead ? { leadTime: lead } : {}),
  };

  // --- helpers that read the state above

  function runningEvent(stepId: string): HubEventLine | undefined {
    const mine = events.filter((e) => e.step === stepId).sort(byTime);
    const last = mine.at(-1);
    return last?.event === "started" ? last : undefined;
  }

  function implementBlocked(): string | undefined {
    for (const t of teams) {
      const open = (t.snapshot?.tracker ?? []).filter((r) => r.status !== "done");
      if (open.length === 0) continue;
      const waiting = open.filter((r) => waits.some((w) => w.team === t.id && w.task === r.id && !w.done));
      if (waiting.length === open.length) {
        const on = [...new Set(waits.filter((w) => w.team === t.id && !w.done).map((w) => w.on))];
        return `${t.id} waits for ${on.join(", ")}`;
      }
    }
    return undefined;
  }
}

function teamSource(ts: TeamState[]): StepState["source"] | undefined {
  const s = ts.filter((t) => t.snapshot);
  if (s.length === 0) return undefined;
  return s.every((t) => t.source === "hub-state") ? "hub-state" : "local-clone";
}

const byTime = (a: { at: string }, b: { at: string }) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
