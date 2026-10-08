import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { collectUsage, contextOfCommand, localMonth, noteContext, readClaudeTranscript } from "../src/index.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "hub-usage-"));
  temp.push(d);
  return d;
};

/** A line as Claude Code 2.1.292 writes it for an assistant message (fields seen in a real transcript). */
const line = (id: string, model: string, u: Record<string, unknown>) =>
  JSON.stringify({ type: "assistant", sessionId: "s1", message: { id, model, role: "assistant", usage: u } }) + "\n";
const usage = (input: number, w1h: number, read: number, output: number, w5m = 0) => ({
  input_tokens: input,
  cache_creation_input_tokens: w1h + w5m,
  cache_read_input_tokens: read,
  output_tokens: output,
  cache_creation: { ephemeral_1h_input_tokens: w1h, ephemeral_5m_input_tokens: w5m },
});

describe("the feature and step of a session", () => {
  it("come from a typed hub command", () => {
    expect(contextOfCommand("/hub:next returns-portal")).toEqual({ slug: "returns-portal" });
    expect(contextOfCommand("/hub:next returns-portal clarify")).toEqual({ slug: "returns-portal", step: "clarify" });
    expect(contextOfCommand("/hub:run tech-design order-webhooks")).toEqual({ slug: "order-webhooks", step: "tech-design" });
    expect(contextOfCommand("/hub:verify tasks-issues")).toEqual({ slug: "tasks-issues", step: "verify" });
    expect(contextOfCommand("$hub-decide tasks-issues")).toEqual({ slug: "tasks-issues", step: "qa-final" });
    expect(contextOfCommand("please fix the bug")).toBeUndefined();
  });
  it("or from a hub tool: its input, or the step hub_next hands over", () => {
    const store = { dir: tmp() };
    noteContext(store, { session_id: "s1", tool_name: "mcp__plugin_hub_hub__hub_next", tool_input: { slug: "returns-portal" }, tool_response: [{ type: "text", text: "Next for you in returns-portal: clarify. Run it here." }] }, "2026-10-08T10:00:00Z");
    expect(JSON.parse(readFileSync(join(store.dir, "sessions.json"), "utf8")).s1).toMatchObject({ slug: "returns-portal", step: "clarify" });
  });
});

describe("usage from a Claude Code transcript", () => {
  it("counts each message once, though it spans several lines, and splits the cache writes", async () => {
    const dir = tmp();
    const t = join(dir, "t.jsonl");
    writeFileSync(t, line("m1", "claude-opus-5-5", usage(2, 11908, 23578, 214)) + line("m1", "claude-opus-5-5", usage(2, 11908, 23578, 214)) + '{"type":"user"}\n' + line("m2", "claude-haiku-4-5-20251001", usage(10, 0, 0, 20, 100)));
    const r = await readClaudeTranscript(t, 0);
    expect(r.lines).toBe(4);
    expect(r.messages).toEqual([
      { id: "m1", model: "claude-opus-5-5", tokens: { input: 2, cache_write_5m: 0, cache_write_1h: 11908, cache_read: 23578, output: 214 } },
      { id: "m2", model: "claude-haiku-4-5-20251001", tokens: { input: 10, cache_write_5m: 100, cache_write_1h: 0, cache_read: 0, output: 20 } },
    ]);
  });
  it("adds one record per model at each stop, only what is new, tagged with the session's feature and step", async () => {
    const dir = tmp();
    const store = { dir: join(dir, "usage") };
    const t = join(dir, "t.jsonl");
    writeFileSync(t, line("m1", "claude-opus-5-5", usage(2, 100, 1000, 50)));
    noteContext(store, { session_id: "s1", prompt: "/hub:next returns-portal clarify" }, "2026-10-08T10:00:00Z");
    const first = await collectUsage({ store, payload: { session_id: "s1", transcript_path: t }, person: { role: "po" }, assistant: "claude", now: "2026-10-08T10:05:00Z" });
    expect(first).toEqual([{ at: "2026-10-08T10:05:00Z", session: "s1", assistant: "claude", model: "claude-opus-5-5", role: "po", slug: "returns-portal", step: "clarify", messages: 1, tokens: { input: 2, cache_write_5m: 0, cache_write_1h: 100, cache_read: 1000, output: 50 } }]);
    appendFileSync(t, line("m2", "claude-opus-5-5", usage(1, 0, 1100, 30)) + line("m3", "claude-opus-5-5", usage(1, 0, 1200, 40)));
    const second = await collectUsage({ store, payload: { session_id: "s1", transcript_path: t }, person: { role: "po" }, assistant: "claude", now: "2026-10-08T10:09:00Z" });
    expect(second.map((r) => [r.messages, r.tokens.output])).toEqual([[2, 70]]);
    expect(localMonth(store, "2026-10")).toHaveLength(2);
    // Nothing new: no record.
    expect(await collectUsage({ store, payload: { session_id: "s1", transcript_path: t }, person: { role: "po" }, assistant: "claude", now: "2026-10-08T10:10:00Z" })).toEqual([]);
  });

  it("counts the session's subagents too: their transcripts sit beside it, each with its own mark", async () => {
    const dir = tmp();
    const store = { dir: join(dir, "usage") };
    const t = join(dir, "s1.jsonl");
    writeFileSync(t, line("m1", "claude-opus-5-5", usage(1, 0, 0, 100)));
    mkdirSync(join(dir, "s1", "subagents"), { recursive: true });
    writeFileSync(join(dir, "s1", "subagents", "agent-a.jsonl"), line("x1", "claude-haiku-4-5-20251001", usage(5, 0, 0, 7)));
    const r = await collectUsage({ store, payload: { session_id: "s1", transcript_path: t }, person: { role: "dev" }, assistant: "claude", now: "2026-10-08T10:00:00Z" });
    expect(Object.fromEntries(r.map((x) => [x.model, x.tokens.output]))).toEqual({ "claude-opus-5-5": 100, "claude-haiku-4-5-20251001": 7 });
    appendFileSync(join(dir, "s1", "subagents", "agent-a.jsonl"), line("x2", "claude-haiku-4-5-20251001", usage(5, 0, 0, 3)));
    const again = await collectUsage({ store, payload: { session_id: "s1", transcript_path: t }, person: { role: "dev" }, assistant: "claude", now: "2026-10-08T10:01:00Z" });
    expect(again.map((x) => [x.model, x.tokens.output])).toEqual([["claude-haiku-4-5-20251001", 3]]);
  });
});
