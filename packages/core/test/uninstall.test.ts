import { describe, expect, it } from "vitest";
import { base } from "@sdlc-hub/fixtures";
import { DEFAULT_FLOW_YAML, guard, loadProject, memorySource, parseFlow, uninstallChanges } from "../src/index.ts";

const main = {
  ...base(),
  "hub/cli.js": "// hub\n",
  "hub/package.json": "{}\n",
  "hub/plugin/.claude-plugin/plugin.json": "{}\n",
  ".claude-plugin/marketplace.json": "{}\n",
  ".agents/skills/hub-status/SKILL.md": "# status\n",
  ".agents/skills/team-tool/SKILL.md": "# the team's own\n",
  ".codex/config.toml": '[mcp_servers.hub]\nargs = ["-c", "node hub/cli.js mcp"]\n',
  ".github/workflows/hub-guard.yml": "name: hub-guard\n",
  ".github/workflows/ci.yml": "name: CI\n",
  "CLAUDE.md": "# Our rules\n\n<!-- sdlc-hub:start -->\n## SDLC Hub\nUse the hub.\n<!-- sdlc-hub:end -->\n",
  "AGENTS.md": "<!-- sdlc-hub:start -->\n## SDLC Hub\n<!-- sdlc-hub:end -->\n",
  ".claude/settings.json": JSON.stringify({ enabledPlugins: { "hub@product-specs": true, "sdd@sdd": true }, permissions: { allow: [] } }),
  "docs/features/tasks-issues/spec.md": "# Tasks\n",
};

describe("uninstall", () => {
  const changes = uninstallChanges(memorySource(main));
  const by = Object.fromEntries(changes.map((c) => [c.path, c]));

  it("removes what the hub alone wrote, and keeps the documents and the team's own files", () => {
    for (const p of ["hub/cli.js", ".hub/config.yaml", ".hub/roles.yaml", ".claude-plugin/marketplace.json", ".agents/skills/hub-status/SKILL.md", ".codex/config.toml", ".github/workflows/hub-guard.yml", "AGENTS.md"]) expect(by[p]?.next, p).toBeUndefined();
    for (const p of [".agents/skills/team-tool/SKILL.md", ".github/workflows/ci.yml", "docs/features/tasks-issues/spec.md"]) expect(by[p], p).toBeUndefined();
  });

  it("keeps the rest of CLAUDE.md and of .claude/settings.json", () => {
    expect(by["CLAUDE.md"]?.next).toBe("# Our rules\n");
    expect(JSON.parse(by[".claude/settings.json"]!.next!)).toEqual({ enabledPlugins: { "sdd@sdd": true }, permissions: { allow: [] } });
  });

  it("passes hub-guard as the admin's change, though .hub/ no longer loads after it", () => {
    const p = loadProject(memorySource(main)).value!;
    const r = guard({ author: "nazar.t", pushers: [], changes }, { config: p.config, roles: p.roles, flow: parseFlow(DEFAULT_FLOW_YAML, "f").value!, feature: () => undefined, main: memorySource(main) });
    expect(r).toEqual({ ok: true, findings: [] });
    expect(guard({ author: "olena.k", pushers: [], changes }, { config: p.config, roles: p.roles, flow: p.flow, feature: () => undefined }).ok).toBe(false);
  });
});
