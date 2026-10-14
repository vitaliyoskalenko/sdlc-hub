// Runs Claude Code headless as a person of the cycle, in their clone of a repository, with the hub's plugin (in
// product-specs) and the SDD engine loaded by --plugin-dir: this machine's plugin registry is not touched.
//   node --experimental-transform-types --no-warnings e2e/cycle/claude.ts <user> <repo> <label> "<prompt>"
// The answer, the cost and the time go to <workspace>/<user>/runs/<label>.json, and a summary to stdout.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { clone, envOf, home, WORK } from "./lib.ts";

const [user, repo, label, prompt] = process.argv.slice(2);
if (!user || !repo || !label || !prompt) throw new Error('claude.ts <user> <repo> <label> "<prompt>"');
const dir = clone(user, repo);
const sdd = process.env["CYCLE_SDD"] ?? join(WORK, "..", "sdd");
if (!existsSync(join(sdd, ".claude-plugin/plugin.json"))) throw new Error(`No SDD plugin at ${sdd}: set CYCLE_SDD`);

// There is no person at the keyboard: the stage decides what it would ask, and says so.
const HEADLESS = [
  "",
  "---",
  "This is an unattended run in a test of the whole flow: nobody can answer questions.",
  "- Where a stage would ask the person, take the recommended option (interview depth: easy) and record the choice in the stage's assumptions ledger.",
  "- Do not run git push, and do not open merge requests yourself: the hub saves the result.",
].join("\n");

const plugins = [...(existsSync(join(dir, "hub/plugin/.claude-plugin/plugin.json")) ? ["--plugin-dir", join(dir, "hub/plugin")] : []), "--plugin-dir", sdd];
const started = Date.now();
const r = spawnSync(
  "claude",
  ["-p", prompt + HEADLESS, ...plugins, "--output-format", "json", "--permission-mode", "acceptEdits", "--model", process.env["CYCLE_MODEL"] ?? "sonnet", "--disallowedTools", "AskUserQuestion", "Bash(git push:*)", "--allowedTools", "Bash(npm test:*)", "Bash(node --test:*)", "Bash(npm install:*)", "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git add:*)", "Bash(git commit:*)", "Bash(git checkout:*)", "Bash(git switch:*)", "Bash(git branch:*)", "Bash(ls:*)", "Bash(mkdir:*)", "Bash(node hub/cli.js:*)", "mcp__plugin_hub_hub__*"],
  { cwd: dir, encoding: "utf8", env: envOf(user), maxBuffer: 256 * 1024 * 1024, timeout: 60 * 60_000 },
);
mkdirSync(join(home(user), "runs"), { recursive: true });
writeFileSync(join(home(user), "runs", `${label}.json`), r.stdout || r.stderr);
let out: { result?: string; total_cost_usd?: number; num_turns?: number; is_error?: boolean } = {};
try {
  out = JSON.parse(r.stdout) as typeof out;
} catch {
  console.log(r.stdout.slice(-3000), r.stderr.slice(-3000));
}
console.log(`${user} · ${repo} · ${label}: ${Math.round((Date.now() - started) / 60_000)} min, ${out.num_turns ?? "?"} turns, $${(out.total_cost_usd ?? 0).toFixed(2)}${out.is_error ? " · ERROR" : ""}`);
console.log(out.result ?? "");
process.exit(r.status ?? 1);
