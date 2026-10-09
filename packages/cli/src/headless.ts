// Headless runs: the site starts the person's own assistant without a terminal. In version 1 the only one is
// validation, read-only: plan permission mode, editing tools denied, a turn limit. The assistant's own hooks still
// run, so the usage of the run is recorded like any session. Off unless the admin sets headless.enabled.

import { spawn } from "node:child_process";

export interface HeadlessResult {
  ok: boolean;
  /** The assistant's final answer: for validation, the report. */
  text: string;
  costUsd?: number;
  error?: string;
}

export type HeadlessRun = (cwd: string, prompt: string) => Promise<HeadlessResult>;

/** The arguments for one read-only run of Claude Code. */
export const claudeReadOnlyArgs = (prompt: string, maxTurns = 30) => [
  "-p",
  prompt,
  "--output-format",
  "json",
  "--permission-mode",
  "plan",
  "--max-turns",
  String(maxTurns),
  "--disallowedTools",
  "Edit",
  "Write",
  "NotebookEdit",
  "Bash",
];

export function claudeHeadless(bin = "claude", timeoutMs = 10 * 60_000): HeadlessRun {
  return (cwd, prompt) =>
    new Promise((resolve) => {
      const child = spawn(bin, claudeReadOnlyArgs(prompt), { cwd, stdio: ["ignore", "pipe", "pipe"], env: process.env });
      let out = "";
      let err = "";
      const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
      child.stdout.on("data", (d: Buffer) => (out += d.toString()));
      child.stderr.on("data", (d: Buffer) => (err += d.toString()));
      child.on("error", (e) => {
        clearTimeout(timer);
        resolve({ ok: false, text: "", error: `Could not start ${bin}: ${e.message}` });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        try {
          const r = JSON.parse(out) as { is_error?: boolean; result?: string; total_cost_usd?: number; subtype?: string };
          const ok = code === 0 && !r.is_error && typeof r.result === "string";
          resolve({ ok, text: r.result ?? "", ...(typeof r.total_cost_usd === "number" ? { costUsd: r.total_cost_usd } : {}), ...(ok ? {} : { error: `The run ended with ${r.subtype ?? `exit code ${code}`}` }) });
        } catch {
          resolve({ ok: false, text: "", error: (err || out || `exit code ${code}`).trim().split("\n").slice(-3).join(" ") });
        }
      });
    });
}
