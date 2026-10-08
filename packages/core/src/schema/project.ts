// .hub/config.yaml, .hub/roles.yaml, .hub/flow.yaml and .hub/engines/<id>.yaml

import { z } from "zod";
import { BUILTIN_ROLES, kebab, KEBAB, requirement, ROUTES, schemaVersion } from "./common.ts";

// --- config.yaml

export const TEAM_KINDS = ["backend", "web", "android", "ios", "desktop", "other"] as const;

const team = z.strictObject({
  id: kebab,
  name: z.string().min(1),
  repo: z.string().regex(/^[^/\s]+(\/[^/\s]+)+$/, "Write the repository as group/name"),
  kind: z.enum(TEAM_KINDS),
  api_contract: z.boolean().optional(),
  /** The command that runs the team's autotests in its repository, for a local run (hub test). */
  test: z.string().min(1).optional(),
});

export const configSchema = z
  .strictObject({
    schema_version: schemaVersion,
    git: z.strictObject({
      provider: z.enum(["gitlab", "github"]),
      host: z.string().min(1),
      namespace: z.string().min(1),
      repo: z.string().min(1),
    }),
    project: z.strictObject({ name: z.string().min(1) }),
    teams: z.array(team).min(1, "List at least one team repository"),
    tracker: z.strictObject({
      type: z.enum(["none", "jira"]),
      url: z.string().optional(),
      project_key: z.string().optional(),
      mirror_bugs: z.boolean().optional(),
    }),
    links: z.strictObject({ confluence: z.string().optional(), figma: z.string().optional() }).optional(),
    assistants: z.array(z.enum(["claude", "codex", "cursor"])).min(1),
    engine: kebab,
    headless: z.strictObject({ enabled: z.boolean() }),
    prices: z.record(z.string(), z.number().nonnegative()).optional(),
  })
  .superRefine((c, ctx) => {
    const specRepo = `${c.git.namespace}/${c.git.repo}`;
    const seenRepo = new Map<string, number>();
    const seenId = new Map<string, number>();
    c.teams.forEach((t, i) => {
      if (t.repo === specRepo)
        ctx.addIssue({ code: "custom", path: ["teams", i, "repo"], message: "A team repository cannot be the specifications repository" });
      if (seenRepo.has(t.repo))
        ctx.addIssue({ code: "custom", path: ["teams", i, "repo"], message: `Two rows use the same repository (${t.repo})` });
      if (seenId.has(t.id)) ctx.addIssue({ code: "custom", path: ["teams", i, "id"], message: `Two teams use the id ${t.id}` });
      seenRepo.set(t.repo, i);
      seenId.set(t.id, i);
    });
    const contract = c.teams.flatMap((t, i) => (t.api_contract ? [i] : []));
    for (const i of contract.slice(1))
      ctx.addIssue({ code: "custom", path: ["teams", i, "api_contract"], message: "Only one team can publish the API contract" });
    if (c.tracker.type === "jira" && (!c.tracker.url || !c.tracker.project_key))
      ctx.addIssue({ code: "custom", path: ["tracker"], message: "Jira needs an address and a project key" });
    if (!c.assistants.includes("claude"))
      ctx.addIssue({ code: "custom", path: ["assistants"], message: "Claude Code is always on" });
  });
export type Config = z.output<typeof configSchema>;
export type Team = Config["teams"][number];

export const contractTeam = (c: Config): Team | undefined => c.teams.find((t) => t.api_contract);

// --- roles.yaml

const person = z
  .strictObject({
    user: z.string().min(1),
    name: z.string().min(1),
    role: z.string().optional(),
    roles: z.array(z.string()).min(1).optional(),
    team: z.string().optional(),
    lead: z.boolean().optional(),
    os: z.enum(["macos", "linux", "windows"]).optional(),
    assistant: z.enum(["claude", "codex", "cursor"]).optional(),
  })
  .superRefine((p, ctx) => {
    if ((p.role === undefined) === (p.roles === undefined))
      ctx.addIssue({ code: "custom", message: "Give either role (one) or roles (a list)" });
    if (p.lead && !p.team) ctx.addIssue({ code: "custom", path: ["lead"], message: "A lead needs a team" });
  })
  .transform(({ role, roles, ...rest }) => ({ ...rest, roles: roles ?? (role ? [role] : []) }));

export const rolesSchema = z
  .strictObject({
    schema_version: schemaVersion,
    people: z.array(person),
    roles: z.record(kebab, z.strictObject({ write: z.array(z.string()) })).optional(),
  })
  .superRefine((r, ctx) => {
    const known = new Set<string>([...BUILTIN_ROLES, ...Object.keys(r.roles ?? {})]);
    const users = new Set<string>();
    r.people.forEach((p, i) => {
      // Zod runs this check even when a person failed its own check, before the transform: guard the shape.
      for (const role of Array.isArray(p.roles) ? p.roles : [])
        if (!known.has(role)) ctx.addIssue({ code: "custom", path: ["people", i], message: `Unknown role "${role}"` });
      if (users.has(p.user)) ctx.addIssue({ code: "custom", path: ["people", i, "user"], message: `${p.user} is listed twice` });
      users.add(p.user);
    });
  });
export type Roles = z.output<typeof rolesSchema>;
export type Person = Roles["people"][number];

// --- flow.yaml

export const GATE_BY = ["role", "team-leads", "other-team-leads", "contract-lead"] as const;

const gate = z.strictObject({
  /** A role id, or `auto` for a gate that checks itself (tests, CI). */
  role: z.string(),
  /**
   * Whose entries the gate needs: anyone with the role, every lead of the feature's teams, the lead of every
   * team except the contract team, or the contract team's lead. Leads are named in feature.yaml.
   */
  by: z.enum(GATE_BY).default("role"),
  text: z.string(),
  /** Where a return sends the work. Defaults to the step itself. */
  returns_to: kebab.optional(),
});

const step = z.strictObject({
  id: kebab,
  role: z.string(),
  kind: z.enum(["engine", "hub"]),
  /** False for steps that cost no tokens ("hub, no LLM"). */
  llm: z.boolean().optional(),
  /** Evidence for hub steps. Engine steps take theirs from the engine adapter. */
  evidence: z.array(requirement).optional(),
  gate: gate.optional(),
  /** Token estimate in millions: low and high. */
  estimate_tokens_m: z.tuple([z.number(), z.number()]).optional(),
});

export const flowSchema = z
  .strictObject({
    schema_version: schemaVersion,
    lanes: z.array(z.string()).min(1),
    release: z.strictObject({ watch_days: z.number().int().min(0) }),
    steps: z.array(step).min(1),
  })
  .superRefine((f, ctx) => {
    const index = new Map<string, number>();
    f.steps.forEach((s, i) => {
      if (index.has(s.id)) ctx.addIssue({ code: "custom", path: ["steps", i, "id"], message: `Step ${s.id} is listed twice` });
      index.set(s.id, i);
      if (!f.lanes.includes(s.role))
        ctx.addIssue({ code: "custom", path: ["steps", i, "role"], message: `Role ${s.role} has no lane` });
      if (s.gate && s.gate.role !== "auto" && !f.lanes.includes(s.gate.role))
        ctx.addIssue({ code: "custom", path: ["steps", i, "gate", "role"], message: `Gate role ${s.gate.role} has no lane` });
      if (s.kind === "hub" && !s.evidence?.length)
        ctx.addIssue({ code: "custom", path: ["steps", i], message: "A hub step needs evidence" });
      if (s.kind === "engine" && s.evidence)
        ctx.addIssue({ code: "custom", path: ["steps", i, "evidence"], message: "An engine step takes its evidence from the engine adapter" });
    });
    f.steps.forEach((s, i) => {
      const target = s.gate?.returns_to;
      if (!target) return;
      const t = index.get(target);
      if (t === undefined || t > i)
        ctx.addIssue({ code: "custom", path: ["steps", i, "gate", "returns_to"], message: `A return can only go to this step or an earlier one (${target})` });
      else if (!f.steps[t]?.gate || f.steps[t]?.gate?.role === "auto")
        ctx.addIssue({ code: "custom", path: ["steps", i, "gate", "returns_to"], message: `${target} has no human gate, so a return there could never be answered` });
    });
  });
export type Flow = z.output<typeof flowSchema>;
export type FlowStep = Flow["steps"][number];

// --- engines/<id>.yaml

const where = z.enum(["specs", "contract", "teams", "owning-team"]);
export type EvidenceSource = z.output<typeof where>;

const engineStep = z
  .strictObject({
    stage: z.string().optional(),
    stages: z.array(z.string()).min(1).optional(),
    in: where,
    skippable_on: z.array(z.enum(ROUTES)).optional(),
    done_when: z.array(requirement).min(1),
  })
  .superRefine((s, ctx) => {
    if ((s.stage === undefined) === (s.stages === undefined))
      ctx.addIssue({ code: "custom", message: "Give either stage or stages" });
  })
  .transform(({ stage, stages, ...rest }) => ({ ...rest, stages: stages ?? (stage ? [stage] : []) }));

export const engineSchema = z.strictObject({
  id: kebab,
  source: z.string(),
  version: z.string(),
  artifacts: z.string(),
  invoke: z.strictObject({ claude: z.string(), codex: z.string(), cursor: z.string() }),
  steps: z.record(z.string().regex(KEBAB), engineStep),
  returns: z
    .record(
      z.string().regex(KEBAB),
      z
        .strictObject({ stage: z.string(), from: z.union([kebab, z.array(kebab).min(1)]), in: where, done_when: z.array(requirement).min(1) })
        .transform(({ from, ...rest }) => ({ ...rest, from: Array.isArray(from) ? from : [from] })),
    )
    .optional(),
});
export type Engine = z.output<typeof engineSchema>;
export type EngineStep = Engine["steps"][string];
