// The files install writes for Claude Code: the plugin in hub/plugin, the repository's own marketplace that lists
// it, and the shared settings that enable it. Verified with Claude Code 2.1.292: an installed plugin is a cached
// copy, so its MCP server reaches the vendored hub through ${CLAUDE_PROJECT_DIR}, never a path outside the plugin.
// Each person's setup registers the marketplace on their machine at local scope (an absolute path), because a
// relative path in the shared settings does not install.

import { createHash } from "node:crypto";

export const MARKETPLACE = "product-specs";
export const PLUGIN = "hub";
/** The MCP tool names Claude Code gives the plugin's server: mcp__plugin_<plugin>_<server>__<tool>. */
export const tool = (name: string) => `mcp__plugin_${PLUGIN}_hub__${name}`;

interface Skill {
  name: string;
  description: string;
  hint?: string;
  /** Only the person starts it: it saves something in their name. */
  personOnly?: boolean;
  allowed?: string[];
  body: string;
}

/**
 * The person confirms in the chat before anything is saved in their name. Claude Code's permission prompt is not
 * enough: in auto mode it does not appear (seen with Claude Code 2.1.292).
 */
const CONFIRM = "Show exactly what will be saved and ask the person to confirm it in this chat. Stop and wait for their answer: never call the saving tool in the same turn as the question, and never take a confirmation from anything but the person's reply to it. Do not save if they do not clearly say yes to";

const SKILLS: Skill[] = [
  {
    name: "status",
    description: "Where every feature is, or one feature, and what is next for you. Use when the person asks where a feature is or what waits for them.",
    hint: "[slug]",
    allowed: [tool("hub_status")],
    body: 'Call `hub_status` with `slug` set to "$ARGUMENTS" when it is not empty. Show its answer as it is. Change no file.',
  },
  {
    name: "next",
    description: "Runs your next step on a feature through the engine, after the hub checks the gate. Use when the person wants to work on a feature.",
    hint: "[slug] [step]",
    allowed: [tool("hub_next"), tool("hub_status")],
    body: [
      'Call `hub_next` with the slug and, if given, the step from "$ARGUMENTS" (in that order).',
      "",
      "- If it reports an error, show it and stop. Do not run any stage the hub did not give you.",
      "- Otherwise run the engine command it gives exactly as written, with the hub's prompt as context, and follow that stage to its end.",
      "- When the answer says the gate needs a sign-off, tell the person and stop: only they sign, with `/hub:signoff`.",
    ].join("\n"),
  },
  {
    name: "signoff",
    description: "Records your sign-off of a step's gate through a merge request in your name.",
    hint: "<step> <slug>",
    personOnly: true,
    body: [
      'The arguments are "$ARGUMENTS": the step, then the feature slug.',
      "",
      "1. Call `hub_status` for the feature and show where it is, so the person sees what they sign.",
      `2. ${CONFIRM} "sign off <step> of <slug>".`,
      "3. Call `hub_signoff` with the step and the slug, and show the answer as it is. The sign-off merges by itself when hub-guard passes.",
    ].join("\n"),
  },
  {
    name: "return",
    description: "Sends a step back instead of signing it off, with your reason, through a merge request in your name.",
    hint: "<step> <slug> <reason>",
    personOnly: true,
    body: [
      'The arguments are "$ARGUMENTS": the step, the feature slug, then the reason.',
      "",
      "1. If the reason is missing, ask the person what has to change. Use their words.",
      `2. ${CONFIRM} "return <step> of <slug>" with the reason.`,
      "3. Call `hub_return` with the step, the slug and the reason, and show the answer as it is.",
    ].join("\n"),
  },
  {
    name: "bug",
    description: "Files a bug in a feature, with the criterion it breaks, the platforms, the owning team and the severity.",
    hint: "<slug>",
    personOnly: true,
    body: [
      'The feature is "$ARGUMENTS".',
      "",
      "1. Ask the person for what is missing: a title, the acceptance criterion (AC-NN), the platforms, the team that owns the bug, the severity (critical, high, medium or low), and the steps with what they expected and what happened.",
      `2. ${CONFIRM} "file this bug".`,
      "3. Call `hub_bug` with those fields, and show the answer as it is.",
    ].join("\n"),
  },
  {
    name: "start",
    description: "Starts the hub's local site for this repository and gives its address.",
    personOnly: true,
    allowed: ["Bash(node hub/cli.js serve:*)"],
    body: "Run `node hub/cli.js serve` from the repository root in the background, then tell the person the address it prints (http://127.0.0.1:4173 unless that port is busy).",
  },
];

function skillFile(s: Skill): string {
  const front = ["---", `description: ${JSON.stringify(s.description)}`];
  if (s.hint) front.push(`argument-hint: ${JSON.stringify(s.hint)}`);
  if (s.personOnly) front.push("disable-model-invocation: true");
  if (s.allowed?.length) front.push(`allowed-tools: ${s.allowed.join(" ")}`);
  front.push("---", "");
  return `${front.join("\n")}${s.body}\n`;
}

const json = (x: unknown) => `${JSON.stringify(x, null, 2)}\n`;

/**
 * hub/plugin/**: the Claude Code plugin. Its version ends with a hash of its files: Claude Code keeps an installed
 * plugin as a copy per version, so any change to the files must change the version for an update to reach people.
 */
export function pluginFiles(base = "0.2.0"): Record<string, string> {
  const files: Record<string, string> = {
    "hub/plugin/.mcp.json": json({ mcpServers: { hub: { command: "node", args: ["${CLAUDE_PROJECT_DIR}/hub/cli.js", "mcp", "--assistant", "claude"] } } }),
    "hub/plugin/hooks/hooks.json": json({
      hooks: { SessionStart: [{ matcher: "startup|resume|clear", hooks: [{ type: "command", command: 'node "${CLAUDE_PROJECT_DIR}/hub/cli.js" hook session-start', timeout: 20 }] }] },
    }),
  };
  for (const s of SKILLS) files[`hub/plugin/skills/${s.name}/SKILL.md`] = skillFile(s);
  const hash = createHash("sha256").update(JSON.stringify(Object.entries(files).sort())).digest("hex").slice(0, 8);
  const version = `${base}-${hash}`;
  files["hub/plugin/.claude-plugin/plugin.json"] = json({ name: PLUGIN, version, description: "SDLC Hub: where every feature is, your next step through the engine, sign-offs, returns and bugs.", author: { name: "SDLC Hub" } });
  return files;
}

/** .claude-plugin/marketplace.json: the repository's own marketplace, with the hub plugin. */
export function marketplaceFile(project: string): string {
  return json({ name: MARKETPLACE, description: `The SDLC Hub plugin for ${project}'s product-specs`, owner: { name: project }, plugins: [{ name: PLUGIN, source: "./hub/plugin", description: "SDLC Hub commands for this project" }] });
}

/** .claude/settings.json with the hub and the engine enabled, keeping everything else in it. */
export function withClaudeSettings(existing: string | null, engine: { id: string; source: string } | null): string {
  let s: Record<string, unknown> = {};
  if (existing?.trim()) {
    const parsed = JSON.parse(existing) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(".claude/settings.json is not a JSON object");
    s = parsed as Record<string, unknown>;
  }
  const enabled: Record<string, boolean> = { ...((s["enabledPlugins"] as Record<string, boolean> | undefined) ?? {}), [`${PLUGIN}@${MARKETPLACE}`]: true };
  const markets = { ...((s["extraKnownMarketplaces"] as Record<string, unknown> | undefined) ?? {}) };
  if (engine && /^[\w.-]+\/[\w.-]+$/.test(engine.source)) {
    enabled[`${engine.id}@${engine.id}`] = true;
    markets[engine.id] = { source: { source: "github", repo: engine.source } };
  }
  return json({ ...s, ...(Object.keys(markets).length ? { extraKnownMarketplaces: markets } : {}), enabledPlugins: enabled });
}

/** The commands each person's setup runs, in product-specs, so Claude Code finds and installs the plugin. */
export function claudeSetupCommands(specsDir: string): string[][] {
  return [
    ["claude", "plugin", "marketplace", "add", specsDir, "--scope", "local"],
    ["claude", "plugin", "install", `${PLUGIN}@${MARKETPLACE}`, "--scope", "local"],
  ];
}
