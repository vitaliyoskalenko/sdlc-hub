// The MCP server the hub skills call: `node hub/cli.js mcp`, over stdio, started by the assistant.
// The tools are thin: each one calls the function in tools.ts and returns its text.

import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { hubBug, hubNext, hubSignoff, hubStatus, type ToolContext, type ToolResult } from "./tools.ts";

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

  return server;
}
