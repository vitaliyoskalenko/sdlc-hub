import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { claudeHeadless, claudeReadOnlyArgs } from "../src/headless.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A stand-in claude that answers like `claude -p --output-format json`, with its arguments in the result. */
function fakeClaude(answer: string) {
  const dir = mkdtempSync(join(tmpdir(), "hub-headless-"));
  temp.push(dir);
  const bin = join(dir, "claude");
  // `answer` is a JavaScript expression of the arguments `a`.
  writeFileSync(bin, `#!/usr/bin/env node\nconst a = process.argv.slice(2).join(" ");\nprocess.stdout.write(JSON.stringify(${answer}));\n`);
  chmodSync(bin, 0o755);
  return { bin, dir };
}

describe("a headless validation run", () => {
  it("is read only: plan mode, a turn limit, and no editing or shell tools", () => {
    const a = claudeReadOnlyArgs("/hub:validate tasks-issues");
    expect(a.slice(0, 2)).toEqual(["-p", "/hub:validate tasks-issues"]);
    expect(a.join(" ")).toContain("--permission-mode plan");
    expect(a.join(" ")).toContain("--max-turns 30");
    expect(a.slice(a.indexOf("--disallowedTools") + 1)).toEqual(["Edit", "Write", "NotebookEdit", "Bash"]);
  });
  it("returns the assistant's answer and its cost", async () => {
    const { bin, dir } = fakeClaude('{ type: "result", subtype: "success", is_error: false, result: "## spec.md\\nConsistent. (" + (a.includes("--permission-mode plan") ? "plan" : "?") + ")", total_cost_usd: 0.12 }');
    const r = await claudeHeadless(bin)(dir, "/hub:validate x");
    expect(r, JSON.stringify(r)).toEqual({ ok: true, text: "## spec.md\nConsistent. (plan)", costUsd: 0.12 });
  });
  it("says why a run failed", async () => {
    const { bin, dir } = fakeClaude('{ type: "result", subtype: "error_max_turns", is_error: true }');
    expect(await claudeHeadless(bin)(dir, "x")).toMatchObject({ ok: false, error: "The run ended with error_max_turns" });
    expect(await claudeHeadless(join(dir, "nope"))(dir, "x")).toMatchObject({ ok: false, error: expect.stringMatching(/Could not start/) });
  });
});
