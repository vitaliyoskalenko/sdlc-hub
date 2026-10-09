// The MCP server the hub skills call: `node hub/cli.js mcp`, over stdio, started by the assistant.
// The tools are thin: each one calls the function in tools.ts and returns its text.

import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { hubBug, hubDecide, hubValidation, hubNext, hubQa, hubRelease, hubReleaseEdit, hubSignoff, hubStatus, hubTest, hubVerdicts, type ToolContext, type ToolResult } from "./tools.ts";

const text = (r: ToolResult) => ({ content: [{ type: "text" as const, text: r.text }], ...(r.isError ? { isError: true } : {}) });
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/).describe("The feature's folder name under docs/features, for example tasks-issues");
const step = z.string().regex(/^[a-z0-9][a-z0-9-]*$/).describe("A step id from .hub/flow.yaml, for example clarify or tech-design");

export function createHubMcp(ctx: ToolContext, version = "0.0.0"): McpServer {
  const server = new McpServer({ name: "hub", version });

  server.registerTool(
    "hub_status",
    {
      title: "Where features are",
      description: "Where every feature is, or one feature: its current step, who it waits on, waits between teams, and what is next for you. Reads files and changes nothing.",
      inputSchema: z.object({ slug: slug.optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug: s }) => text(hubStatus(ctx, s)),
  );

  server.registerTool(
    "hub_next",
    {
      title: "Your next step",
      description:
        "Checks the gate for your next step on a feature (or a named step): that the steps before it are done and that your role owns it. Returns the engine command to run unchanged, with the hub's prompt, or what is missing. Changes nothing.",
      inputSchema: z.object({ slug: slug.optional(), step: step.optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug: s, step: st }) => text(hubNext(ctx, s, st)),
  );

  server.registerTool(
    "hub_signoff",
    {
      title: "Sign off a gate",
      description: "Records your sign-off of a step's gate in signoffs.yaml, through a merge request in your name that merges itself when hub-guard passes. Call it only after the person confirmed the sign-off.",
      inputSchema: z.object({ step, slug }),
      annotations: { destructiveHint: false },
    },
    async ({ step: st, slug: s }) => text(hubSignoff(ctx, st, s, "pass")),
  );

  server.registerTool(
    "hub_return",
    {
      title: "Return a step",
      description: "Sends a step back instead of signing it off, with the person's reason, through a merge request in their name. flow.yaml says where it goes back to. Call it only after the person confirmed the reason.",
      inputSchema: z.object({ step, slug, reason: z.string().min(1).describe("What has to change, in the person's words") }),
      annotations: { destructiveHint: false },
    },
    async ({ step: st, slug: s, reason }) => text(hubSignoff(ctx, st, s, "return", reason)),
  );

  server.registerTool(
    "hub_bug",
    {
      title: "File a bug",
      description: "Files a bug in the feature as hub/bugs/BUG-NNNN.md, through a merge request. QA files bugs; the owning team fixes them.",
      inputSchema: z.object({
        slug,
        title: z.string().min(1),
        team: z.string().describe("The id of the team that owns the bug, from .hub/config.yaml"),
        severity: z.enum(["critical", "high", "medium", "low"]),
        ac: z.string().optional().describe("The acceptance criterion it breaks, for example AC-04"),
        platforms: z.array(z.string()).optional(),
        body: z.string().optional().describe("Steps, expected and actual"),
      }),
      annotations: { destructiveHint: false },
    },
    async (a) => text(hubBug(ctx, a)),
  );

  server.registerTool(
    "hub_qa",
    {
      title: "QA state of a feature",
      description: "The verdict of every criterion on every platform, the bugs, the latest CI run of each team and the final decisions so far. Reads files and changes nothing.",
      inputSchema: z.object({ slug }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug: s }) => text(hubQa(ctx, s)),
  );

  const verdict = z.object({
    ac: z.string().regex(/^AC-\d+$/).describe("The criterion, for example AC-04"),
    platform: z.string().describe("A platform of the feature, as hub_qa lists them"),
    verdict: z.enum(["pass", "fail", "na"]),
    bugs: z.array(z.string().regex(/^BUG-\d{4,}$/)).optional().describe("For a fail: the bug or bugs it found"),
  });
  server.registerTool(
    "hub_verdicts",
    {
      title: "Record verdicts",
      description: "Records QA's verdicts at verify in hub/verification.yaml, through a merge request in the person's name. A fail names its bug: file it with hub_bug first. Call it only after the person confirmed the verdicts.",
      inputSchema: z.object({ slug, verdicts: z.array(verdict).min(1) }),
      annotations: { destructiveHint: false },
    },
    async ({ slug: s, verdicts }) => text(hubVerdicts(ctx, s, verdicts)),
  );

  server.registerTool(
    "hub_decide",
    {
      title: "The QA decision",
      description: "QA's final check (qa-final): pass to release, or return to verify with the reason and the bugs. Saved through a merge request in the person's name. Call it only after the person confirmed the decision.",
      inputSchema: z.object({ slug, decision: z.enum(["pass", "return"]), reason: z.string().optional(), bugs: z.array(z.string().regex(/^BUG-\d{4,}$/)).optional() }),
      annotations: { destructiveHint: false },
    },
    async ({ slug: s, decision, reason, bugs }) => text(hubDecide(ctx, s, decision, reason, bugs)),
  );

  server.registerTool(
    "hub_release",
    {
      title: "Release state of a feature",
      description: "The staging smoke check, the acceptance and the go or no-go, the checklist, the rollout and the watch period. Reads files and changes nothing.",
      inputSchema: z.object({ slug }),
      annotations: { readOnlyHint: true },
    },
    async ({ slug: s }) => text(hubRelease(ctx, s)),
  );

  server.registerTool(
    "hub_release_edit",
    {
      title: "Record a release change",
      description:
        "Records one release change in release.yaml through a merge request: the smoke check, a checklist item done or not, a new item, or the rollout stage (Ops); the go or no-go (PM). It records what people did; it never starts a production job. Call it only after the person confirmed the change.",
      inputSchema: z.object({
        slug,
        edit: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("smoke"), value: z.enum(["pending", "passed", "failed"]) }),
          z.object({ kind: z.literal("go"), value: z.enum(["go", "no-go"]) }),
          z.object({ kind: z.literal("check"), item: z.string(), done: z.boolean() }),
          z.object({ kind: z.literal("add-item"), item: z.string() }),
          z.object({ kind: z.literal("rollout"), stage: z.number().min(0).max(100) }),
        ]),
      }),
      annotations: { destructiveHint: false },
    },
    async ({ slug: s, edit }) => text(hubReleaseEdit(ctx, s, edit)),
  );

  server.registerTool(
    "hub_test",
    {
      title: "Run the autotests locally",
      description: "Runs the team's test command from .hub/config.yaml in the person's clone of the team repository and records the run in hub-state with the label local. A local run never counts for the autotests gate.",
      inputSchema: z.object({ slug, team: z.string().optional().describe("One team; by default the person's own team") }),
      annotations: { destructiveHint: false },
    },
    async ({ slug: s, team }) => text(hubTest(ctx, s, team)),
  );

  server.registerTool(
    "hub_validation",
    {
      title: "Save a validation report",
      description: "Saves a validation report as hub/validation/<time>.md in the feature, through a merge request. Call it only after the person asked to save the report; never in a headless run.",
      inputSchema: z.object({ slug, report: z.string().min(1).describe("The report in Markdown: a heading per document, then Consistent or the conflicts with a proposed fix") }),
      annotations: { destructiveHint: false },
    },
    async ({ slug: s, report }) => text(hubValidation(ctx, s, report)),
  );

  return server;
}
