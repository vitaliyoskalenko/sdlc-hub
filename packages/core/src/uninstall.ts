// Uninstall: one change that removes the hub from product-specs and keeps the documents. Everything the hub alone
// wrote goes: hub/, .hub/, its plugin marketplace, its skills and Codex and Cursor files, its workflows. Files it
// shares keep the rest: the hub's section of CLAUDE.md and AGENTS.md, and its plugin in .claude/settings.json.

import picomatch from "picomatch";
import type { Change } from "./access.ts";
import type { FileSource } from "./source.ts";

const START = "<!-- sdlc-hub:start -->";
const END = "<!-- sdlc-hub:end -->";
const HUBS = picomatch(["hub/**", ".hub/**", ".claude-plugin/marketplace.json", ".agents/skills/hub-*/**", ".github/workflows/hub-guard.yml", ".github/workflows/hub-recheck.yml"], { dot: true });
/** Files the hub wrote whole, for Codex and Cursor; removed only when they still run the hub. */
const ASSISTANT_FILES = [".codex/config.toml", ".codex/hooks.json", ".cursor/mcp.json", ".cursor/hooks.json"];

export function uninstallChanges(main: FileSource): Change[] {
  const out: Change[] = [];
  const all = [...new Set([...main.list("hub"), ...main.list(".hub"), ...main.list(".claude-plugin"), ...main.list(".agents/skills"), ...main.list(".github/workflows")])];
  for (const p of all.filter((x) => HUBS(x)).sort()) out.push({ path: p, base: main.read(p) ?? "" });
  for (const p of ASSISTANT_FILES) {
    const text = main.read(p);
    if (text !== undefined && text.includes("hub/cli.js")) out.push({ path: p, base: text });
  }
  for (const p of ["CLAUDE.md", "AGENTS.md"]) {
    const text = main.read(p);
    if (text === undefined) continue;
    const s = text.indexOf(START);
    const e = text.indexOf(END);
    if (s < 0 || e < s) continue;
    const rest = (text.slice(0, s) + text.slice(e + END.length)).replace(/\n{3,}/g, "\n\n").trim();
    out.push(rest ? { path: p, base: text, next: `${rest}\n` } : { path: p, base: text });
  }
  const settings = main.read(".claude/settings.json");
  if (settings !== undefined) {
    try {
      const s = JSON.parse(settings) as Record<string, unknown>;
      const enabled = { ...((s["enabledPlugins"] as Record<string, boolean> | undefined) ?? {}) };
      if ("hub@product-specs" in enabled) {
        delete enabled["hub@product-specs"];
        const next = { ...s, enabledPlugins: enabled };
        if (!Object.keys(enabled).length) delete (next as Record<string, unknown>)["enabledPlugins"];
        out.push({ path: ".claude/settings.json", base: settings, next: `${JSON.stringify(next, null, 2)}\n` });
      }
    } catch {
      /* not JSON: left for the admin */
    }
  }
  return out;
}

/** Whether a set of changes removes the hub's configuration: .hub/ then no longer has to load as a whole. */
export const removesHub = (changes: Change[]) => changes.some((c) => c.path === ".hub/config.yaml" && c.next === undefined);
