import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { agentSkillFiles, claudeSetupCommands, codexFiles, cursorFiles, marketplaceFile, pluginFiles, tool, withClaudeSettings } from "../src/index.ts";

const files = pluginFiles();
const front = (p: string) => parse(files[p]!.split("---")[1]!) as Record<string, unknown>;

describe("the Claude Code plugin files", () => {
  it("are a plugin named hub whose MCP server runs the vendored hub through CLAUDE_PROJECT_DIR", () => {
    expect(JSON.parse(files["hub/plugin/.claude-plugin/plugin.json"]!)).toMatchObject({ name: "hub", version: expect.stringMatching(/^0\.2\.0-[0-9a-f]{8}$/) });
    expect(JSON.parse(files["hub/plugin/.mcp.json"]!).mcpServers.hub).toEqual({ command: "node", args: ["${CLAUDE_PROJECT_DIR}/hub/cli.js", "mcp", "--assistant", "claude"] });
    expect(Object.values(files).join("\n")).not.toContain(".."); // nothing outside the plugin: an installed plugin is a cached copy
  });
  it("give the phase 2 commands, and only the person starts the ones that save", () => {
    const skills = Object.keys(files).filter((p) => p.endsWith("SKILL.md")).map((p) => p.split("/")[3]).sort();
    // Every command of the specification's table.
    expect(skills).toEqual(["bug", "decide", "doctor", "new", "next", "release", "return", "run", "signoff", "stage", "start", "status", "sync", "test", "validate", "verify"]);
    expect(front("hub/plugin/skills/new/SKILL.md")["allowed-tools"]).toContain(tool("hub_new"));
    expect(files["hub/plugin/skills/run/SKILL.md"]).toContain("Call `hub_next` with the slug and the step");
    expect(front("hub/plugin/skills/sync/SKILL.md")["allowed-tools"]).toBe("Bash(node hub/cli.js sync)");
    expect(front("hub/plugin/skills/doctor/SKILL.md")["allowed-tools"]).toBe("Bash(node hub/cli.js doctor)");
    for (const s of ["signoff", "return", "bug", "verify", "decide", "release"]) {
      expect(front(`hub/plugin/skills/${s}/SKILL.md`)["disable-model-invocation"]).toBe(true);
      // Their save is not pre-allowed, and the person confirms in the chat first: in auto mode no prompt appears.
      expect(String(front(`hub/plugin/skills/${s}/SKILL.md`)["allowed-tools"] ?? "")).not.toMatch(/hub_(signoff|return|bug|verdicts|decide|release_edit)/);
      expect(files[`hub/plugin/skills/${s}/SKILL.md`]).toContain("ask the person to confirm it in this chat");
    }
    expect(front("hub/plugin/skills/status/SKILL.md")["allowed-tools"]).toBe(tool("hub_status"));
  });
  it("tell a new session who the person is", () => {
    const hooks = JSON.parse(files["hub/plugin/hooks/hooks.json"]!).hooks;
    expect(hooks.SessionStart[0].hooks[0].command).toBe('node "${CLAUDE_PROJECT_DIR}/hub/cli.js" hook session-start');
    // Usage: the session's feature and step from a typed command or a hub tool, then its tokens at every stop.
    expect(hooks.UserPromptSubmit[0].hooks[0].command).toMatch(/hook prompt$/);
    expect(hooks.PostToolUse[0]).toMatchObject({ matcher: "mcp__plugin_hub_hub__.*" });
    expect(hooks.Stop[0].hooks[0].command).toMatch(/hook stop$/);
  });
});

describe("the marketplace and the shared settings", () => {
  it("list the plugin from ./hub/plugin", () => {
    expect(JSON.parse(marketplaceFile("Marketplace"))).toEqual({ name: "product-specs", description: expect.any(String), owner: { name: "Marketplace" }, plugins: [{ name: "hub", source: "./hub/plugin", description: expect.any(String) }] });
  });
  it("enable the hub and the engine, keeping the team's own settings", () => {
    const s = JSON.parse(withClaudeSettings('{ "permissions": { "deny": ["Read(.env)"] }, "enabledPlugins": { "x@y": true } }', { id: "sdd", source: "genkovich/sdd" }));
    expect(s.permissions).toEqual({ deny: ["Read(.env)"] });
    expect(s.enabledPlugins).toEqual({ "x@y": true, "hub@product-specs": true, "sdd@sdd": true });
    expect(s.extraKnownMarketplaces).toEqual({ sdd: { source: { source: "github", repo: "genkovich/sdd" } } });
    expect(withClaudeSettings(withClaudeSettings(null, null), null)).toBe(withClaudeSettings(null, null));
    expect(() => withClaudeSettings("[1]", null)).toThrow(/not a JSON object/);
  });
  it("leave each person's setup to register the marketplace on their machine", () => {
    expect(claudeSetupCommands("/work/shop/product-specs")).toEqual([
      ["claude", "plugin", "marketplace", "add", "/work/shop/product-specs", "--scope", "local"],
      ["claude", "plugin", "install", "hub@product-specs", "--scope", "local"],
    ]);
  });
});

describe("the files for Codex and Cursor (from their docs; not yet run)", () => {
  const skills = agentSkillFiles();
  it("are one set of skills in .agents/skills that both read, named like their folders", () => {
    const front = (p: string) => parse(skills[p]!.split("---")[1]!) as Record<string, unknown>;
    expect(front(".agents/skills/hub-status/SKILL.md")).toMatchObject({ name: "hub-status" });
    expect(Object.keys(skills).filter((p) => p.endsWith("SKILL.md"))).toHaveLength(Object.keys(pluginFiles()).filter((p) => p.endsWith("SKILL.md")).length);
  });
  it("speak each assistant's syntax and have no Claude Code placeholder", () => {
    const signoff = skills[".agents/skills/hub-signoff/SKILL.md"]!;
    expect(signoff).not.toContain("$ARGUMENTS");
    expect(skills[".agents/skills/hub-next/SKILL.md"]).toContain("`$hub-signoff` in Codex or `/hub-signoff` in Cursor");
  });
  it("keep the saving skills for the person: Cursor's flag and Codex's policy", () => {
    expect(skills[".agents/skills/hub-signoff/SKILL.md"]).toContain("disable-model-invocation: true");
    expect(skills[".agents/skills/hub-signoff/agents/openai.yaml"]).toBe("policy:\n  allow_implicit_invocation: false\n");
    expect(skills[".agents/skills/hub-status/agents/openai.yaml"]).toBeUndefined();
  });
  it("start the hub's MCP server and hooks from the repository root", () => {
    const codex = codexFiles();
    expect(codex[".codex/config.toml"]).toContain("[mcp_servers.hub]");
    expect(codex[".codex/config.toml"]).toContain("git rev-parse --show-toplevel");
    expect(JSON.parse(codex[".codex/hooks.json"]!).hooks.PostToolUse[0].matcher).toBe("mcp__hub__.*");
    const cursor = cursorFiles();
    expect(JSON.parse(cursor[".cursor/mcp.json"]!).mcpServers.hub.args[0]).toBe("${workspaceFolder}/hub/cli.js");
    expect(JSON.parse(cursor[".cursor/hooks.json"]!)).toMatchObject({ version: 1, hooks: { sessionStart: [{ command: "node hub/cli.js hook session-start --assistant cursor" }] } });
  });
});
