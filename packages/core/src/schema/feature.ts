// Files in docs/features/<slug>/hub/ on main, and the records on the hub-state branch.

import { z } from "zod";
import { isoTime, kebab, schemaVersion } from "./common.ts";

// --- main: feature.yaml, signoffs.yaml, bugs, release.yaml

export const featureSchema = z.strictObject({
  title: z.string().min(1),
  owner: z.string().min(1),
  /** Set at the epic step: the teams of the feature and the lead of each. */
  teams: z.record(kebab, z.strictObject({ lead: z.string().min(1) })).optional(),
  links: z
    .strictObject({
      jira: z.string().optional(),
      confluence: z.string().optional(),
      figma: z.string().optional(),
      staging: z.string().optional(),
    })
    .optional(),
  estimate: z
    .strictObject({ days: z.number().positive().optional(), tokens_m: z.tuple([z.number(), z.number()]).optional() })
    .optional(),
  /**
   * Set at the epic step. False for a feature with no user interface: ux-flows and screens are then skipped on
   * every route. SDD records no such signal before ux-flows, so the hub keeps it here.
   */
  ui: z.boolean().optional(),
});
export type Feature = z.output<typeof featureSchema>;

const signoffEntry = z
  .strictObject({
    step: kebab,
    user: z.string().min(1),
    at: isoTime,
    /** The approved file and its content hash. A sign-off records a hash, not a commit. */
    file: z.string().optional(),
    hash: z.string().regex(/^sha256:[0-9a-f]+$/, "Write the hash as sha256:<hex>").optional(),
    /** pass and return answer a gate; confirm is an owner's "no change needed" after a validation. */
    decision: z.enum(["pass", "return", "confirm"]).default("pass"),
    reason: z.string().min(1).optional(),
    bugs: z.array(z.string()).optional(),
    /** Where a return goes, the same field as in flow.yaml. */
    returns_to: kebab.optional(),
    cycle: z.number().int().min(1).optional(),
  })
  .superRefine((e, ctx) => {
    if ((e.file === undefined) !== (e.hash === undefined))
      ctx.addIssue({ code: "custom", message: "A sign-off names the approved file and its hash together" });
    if (e.decision === "confirm" && e.file === undefined)
      ctx.addIssue({ code: "custom", message: "A confirmation of no change names the file and its hash" });
    if (e.decision === "return" && !e.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "A return needs a reason" });
    if (e.decision === "return" && e.cycle === undefined) ctx.addIssue({ code: "custom", path: ["cycle"], message: "A return needs a cycle number" });
  });
export const signoffsSchema = z.array(signoffEntry);
export type Signoff = z.output<typeof signoffEntry>;

export const BUG_STATUSES = ["open", "fixing", "retest", "closed", "rejected"] as const;
export const SEVERITIES = ["critical", "high", "medium", "low"] as const;

export const bugFrontSchema = z.strictObject({
  id: z.string().regex(/^BUG-\d{4,}$/, "Write the id as BUG-NNNN"),
  title: z.string().min(1),
  ac: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  team: kebab,
  severity: z.enum(SEVERITIES),
  status: z.enum(BUG_STATUSES),
  found_by: z.string().optional(),
  found_in: kebab.optional(),
});
export type BugFront = z.output<typeof bugFrontSchema>;

export const releaseSchema = z.strictObject({
  staging: z.strictObject({ smoke: z.enum(["pending", "passed", "failed"]), at: isoTime.optional() }).optional(),
  checklist: z
    .array(z.strictObject({ item: z.string(), done: z.boolean(), user: z.string().optional(), at: isoTime.optional() }))
    .optional(),
  /** The only place of the go or no-go. */
  go: z.strictObject({ value: z.enum(["go", "no-go"]), user: z.string(), at: isoTime }).optional(),
  versions: z.record(z.string(), z.string()).optional(),
  rollout: z.strictObject({ stage: z.number().min(0).max(100), at: isoTime.optional() }).optional(),
  watch: z.strictObject({ started: isoTime, days: z.number().int().min(0) }).optional(),
});
export type Release = z.output<typeof releaseSchema>;

// --- hub-state: events, test runs, team snapshots

export const eventSchema = z.strictObject({
  step: kebab,
  event: z.enum(["started", "finished", "returned"]),
  role: z.string(),
  assistant: z.enum(["claude", "codex", "cursor"]).optional(),
  at: isoTime,
  // The event log carries no username and no token counts; the site names the person from the git author.
  user: z.never({ error: "Events carry no username; the person comes from the git author" }).optional(),
  tokens: z.never({ error: "Events carry no token counts" }).optional(),
});
export type HubEvent = z.output<typeof eventSchema>;

/** One test run: a CI pipeline of a team repository, or a local run. A pipeline reports its result only; a run with counts may leave the result out. */
export const testRunSchema = z
  .strictObject({
    source: z.enum(["ci", "local"]),
    team: kebab,
    platform: z.string().optional(),
    result: z.enum(["passed", "failed"]).optional(),
    passed: z.number().int().min(0).optional(),
    failed: z.number().int().min(0).optional(),
    at: isoTime,
    url: z.string().optional(),
    ref: z.string().optional(),
    /** Who ran a local run. */
    user: z.string().optional(),
  })
  .superRefine((r, ctx) => {
    if (r.result === undefined && (r.passed === undefined || r.failed === undefined)) ctx.addIssue({ code: "custom", message: "Give the result, or the passed and failed counts" });
  })
  .transform((r) => ({ ...r, result: r.result ?? ((r.failed ?? 0) > 0 ? ("failed" as const) : ("passed" as const)) }));
export type TestRun = z.output<typeof testRunSchema>;

export const TRACKER_STATUSES = ["todo", "in_progress", "blocked", "review", "done"] as const;

export const sddTaskSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string(),
  layer: z.string(),
  deps: z.array(z.string()),
  acs: z.array(z.string()),
  dod: z.string().optional(),
  files_hint: z.array(z.string()).optional(),
  file: z.string().optional(),
});
export type SddTask = z.output<typeof sddTaskSchema>;

export const trackerRowSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().optional(),
  status: z.enum(TRACKER_STATUSES),
  /** Ids from the free-text Blocked by column. `<team-id>:<task-id>` is a wait on another team. */
  blocked_by: z.array(z.string()),
});
export type TrackerRow = z.output<typeof trackerRowSchema>;

export const teamSnapshotSchema = z.strictObject({
  schema_version: schemaVersion,
  team: kebab,
  slug: kebab,
  /** The commit of the team repository the snapshot was built from. */
  source_commit: z.string().nullable(),
  generated_at: isoTime,
  /** SDD artifacts present in docs/features/<slug>/, relative to it. */
  files: z.array(z.string()),
  /** `target_surfaces` from the front matter of the team's sad.md, when it has one. */
  target_surfaces: z.array(z.string()).nullable().optional(),
  tasks: z.array(sddTaskSchema).nullable(),
  tracker: z.array(trackerRowSchema).nullable(),
  review: z.strictObject({ file: z.string(), verdict: z.enum(["PASS", "CHANGES REQUESTED"]) }).nullable(),
  mr: z
    .strictObject({
      iid: z.number().int(),
      state: z.enum(["opened", "merged", "closed"]),
      url: z.string().optional(),
      author: z.string().optional(),
      source_branch: z.string().optional(),
    })
    .nullable(),
  pipeline: z.strictObject({ status: z.enum(["success", "failed", "running", "pending", "canceled"]), url: z.string().optional(), at: isoTime.optional() }).nullable(),
  warnings: z.array(z.string()),
});
export type TeamSnapshot = z.output<typeof teamSnapshotSchema>;
