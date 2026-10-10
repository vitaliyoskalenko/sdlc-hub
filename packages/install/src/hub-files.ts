// The hub's own files in product-specs: the bundled hub, its package.json with the version, the assistants' files and,
// on GitHub, the hub-guard workflow. Install writes them, and `hub upgrade` writes them again from a newer hub. The
// configuration under .hub/ is the admin's and is not part of them.

import { hubPackageJson } from "@sdlc-hub/core";
import { agentSkillFiles, codexFiles, cursorFiles, marketplaceFile, pluginFiles, withClaudeSettings } from "@sdlc-hub/plugin/files";
import { AGENTS_BLOCK, CLAUDE_BLOCK, withBlock, withIgnore } from "./answers.ts";
import { GUARD_WORKFLOW, hubGuardWorkflow, hubRecheckWorkflow, RECHECK_WORKFLOW } from "./github-ci.ts";

export interface HubOwnedInput {
  host: "gitlab" | "github";
  assistants: { codex: boolean; cursor: boolean };
  engine: string;
  /** The name the repository's own plugin marketplace shows. */
  marketplace: string;
  /** hub/cli.js: the bundle that writes the files. */
  bundle: string;
  version?: string;
  /** A file on main now, to keep what is not the hub's in CLAUDE.md, AGENTS.md, .gitignore and .claude/settings.json. */
  read: (path: string) => Promise<string | null | undefined>;
}

export async function hubOwnedFiles(o: HubOwnedInput): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  files["hub/cli.js"] = o.bundle;
  // product-specs has no package.json: this one makes Node load hub/cli.js as the ES module it is.
  files["hub/package.json"] = hubPackageJson(o.version);
  files["CLAUDE.md"] = withBlock((await o.read("CLAUDE.md")) ?? null, CLAUDE_BLOCK);
  if (o.assistants.codex || o.assistants.cursor) files["AGENTS.md"] = withBlock((await o.read("AGENTS.md")) ?? null, AGENTS_BLOCK);
  files[".gitignore"] = withIgnore(withIgnore((await o.read(".gitignore")) ?? null, ".claude/*.local.md"), ".claude/settings.local.json");
  // The hub plugin for Claude Code, the repository's own marketplace, and the shared settings that enable both.
  Object.assign(files, pluginFiles());
  // Codex and Cursor: one set of skills in .agents/skills, and each one's MCP server and hooks.
  if (o.assistants.codex || o.assistants.cursor) Object.assign(files, agentSkillFiles());
  if (o.assistants.codex) Object.assign(files, codexFiles());
  if (o.assistants.cursor) Object.assign(files, cursorFiles());
  files[".claude-plugin/marketplace.json"] = marketplaceFile(o.marketplace);
  files[".claude/settings.json"] = withClaudeSettings((await o.read(".claude/settings.json")) ?? null, o.engine === "sdd" ? { id: "sdd", source: "genkovich/sdd" } : null);
  if (o.host === "github") {
    files[GUARD_WORKFLOW] = hubGuardWorkflow();
    files[RECHECK_WORKFLOW] = hubRecheckWorkflow();
  }
  return files;
}
