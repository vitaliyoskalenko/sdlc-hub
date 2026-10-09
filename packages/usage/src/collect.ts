// Collecting usage on a person's machine. The assistant's hooks call these: UserPromptSubmit and PostToolUse note
// which feature and step the session works on (from a typed /hub:x or a hub tool's input), and Stop reads the
// session's transcript, and its subagents', since their last marks and adds one record per model to this month's local file. The local files
// live in the git directory, never in the repository; hub sync encrypts and publishes them.

import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import { addTokens, ZERO, type Tokens } from "./prices.ts";

export const usageRecordSchema = z.strictObject({
  at: z.string(),
  session: z.string(),
  assistant: z.enum(["claude", "codex", "cursor"]),
  model: z.string(),
  role: z.string(),
  team: z.string().optional(),
  slug: z.string().optional(),
  step: z.string().optional(),
  messages: z.number().int().min(0),
  tokens: z.strictObject({ input: z.number(), cache_write_5m: z.number(), cache_write_1h: z.number(), cache_read: z.number(), output: z.number() }),
});
export type UsageRecord = z.output<typeof usageRecordSchema>;

export interface Store {
  /** <git dir>/sdlc-hub/usage */
  dir: string;
}

const readJson = <T>(file: string, empty: T): T => {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return empty;
  }
};
const writeJson = (file: string, value: unknown) => {
  writeFileSync(`${file}.tmp`, JSON.stringify(value));
  renameSync(`${file}.tmp`, file);
};

type Context = { slug: string; step?: string; at: string };

/** The step a command works on when it names none. */
const STEP_OF: Record<string, string> = { verify: "verify", test: "autotests", decide: "qa-final", release: "release" };
const WITH_STEP_FIRST = ["run", "signoff", "return"];
const SLUG_FIRST = ["next", "verify", "test", "decide", "release", "bug", "status", "validate", "new"];

/** /hub:<command> <args>: the feature, and the step when the command names one. */
export function contextOfCommand(prompt: string): { slug: string; step?: string } | undefined {
  const m = /^\s*(?:\/hub:|\$hub-|\/hub-)([a-z]+)\s+(.+?)\s*$/.exec(prompt);
  if (!m) return undefined;
  const [, command, rest] = m as unknown as [string, string, string];
  const words = rest.split(/\s+/).filter((w) => /^[a-z0-9][a-z0-9-]*$/.test(w));
  if (WITH_STEP_FIRST.includes(command)) return words.length >= 2 ? { step: words[0]!, slug: words[1]! } : undefined;
  if (!SLUG_FIRST.includes(command) || !words[0]) return undefined;
  const step = command === "next" ? words[1] : STEP_OF[command];
  return { slug: words[0], ...(step ? { step } : {}) };
}

/** What the session works on, from a hook payload: a typed hub command, or a hub tool's input and answer. */
/** The session of a hook payload: Claude Code and Codex send session_id, Cursor conversation_id. */
export const sessionOf = (payload: Record<string, unknown>) => String(payload["session_id"] ?? payload["conversation_id"] ?? "");

/** A call of one of the hub's tools: Claude Code's mcp__plugin_hub_hub__x, Codex's mcp__hub__x, Cursor's x on server hub. */
function hubTool(payload: Record<string, unknown>): { input: { slug?: unknown; step?: unknown }; answer: string } | undefined {
  const name = String(payload["tool_name"] ?? "");
  const ours = /^(?:mcp__plugin_hub_hub__|mcp__hub__)hub_/.test(name) || (payload["mcp_server_name"] === "hub" && /^hub_/.test(name));
  if (!ours) return undefined;
  let input = payload["tool_input"] ?? {};
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      input = {};
    }
  }
  return { input: input as { slug?: unknown; step?: unknown }, answer: JSON.stringify(payload["tool_response"] ?? payload["result_json"] ?? "") };
}

export function noteContext(store: Store, payload: Record<string, unknown>, now: string): void {
  const session = sessionOf(payload);
  if (!session) return;
  let ctx: { slug: string; step?: string } | undefined;
  if (typeof payload["prompt"] === "string") ctx = contextOfCommand(payload["prompt"]);
  const call = hubTool(payload);
  if (call) {
    const { input, answer } = call;
    // hub_next names the step it hands over: "Next for you in <slug>: <step>."
    const next = /Next for you in ([a-z0-9-]+): ([a-z0-9-]+)\./.exec(answer);
    if (typeof input.slug === "string") ctx = { slug: input.slug, ...(typeof input.step === "string" ? { step: input.step } : next && next[1] === input.slug ? { step: next[2]! } : {}) };
    else if (next) ctx = { slug: next[1]!, step: next[2]! };
  }
  if (!ctx) return;
  mkdirSync(store.dir, { recursive: true });
  const file = join(store.dir, "sessions.json");
  const all = readJson<Record<string, Context>>(file, {});
  all[session] = { ...ctx, at: now };
  // Keep the file small: sessions older than a month are of no use.
  for (const [k, v] of Object.entries(all)) if (Date.parse(now) - Date.parse(v.at) > 31 * 86_400_000) delete all[k];
  writeJson(file, all);
}

interface Message {
  id: string;
  model: string;
  tokens: Tokens;
}

/** The assistant messages of a Claude Code transcript after line `from`, each once (a message spans several lines). */
export async function readClaudeTranscript(path: string, from: number): Promise<{ messages: Message[]; lines: number }> {
  const byId = new Map<string, Message>();
  let n = 0;
  const lines = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  for await (const line of lines) {
    n++;
    if (n <= from || !line.includes('"usage"')) continue;
    let d: { type?: string; message?: { id?: string; model?: string; usage?: Record<string, unknown> } };
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    const m = d.message;
    if (d.type !== "assistant" || !m?.usage || !m.id || !m.model || m.model === "<synthetic>") continue;
    const u = m.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } };
    const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const w5m = u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0);
    byId.set(m.id, { id: m.id, model: m.model, tokens: { input: u.input_tokens ?? 0, cache_write_5m: w5m, cache_write_1h: w1h, cache_read: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 } });
  }
  return { messages: [...byId.values()], lines: n };
}

/**
 * @unverified-codex-format: from the Codex source (codex-rs/protocol), not yet a real rollout file with token counts.
 * The rollout's latest running total (event_msg token_count, info.total_token_usage) and the latest model
 * (turn_context). OpenAI counts cached input inside input_tokens; the hub keeps them apart.
 */
export async function readCodexRollout(path: string): Promise<{ total: Tokens; model: string; turns: number } | undefined> {
  let total: Tokens | undefined;
  let model = "unknown";
  let turns = 0;
  const lines = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes("token_count") && !line.includes("turn_context")) continue;
    let d: { type?: string; payload?: { type?: string; model?: string; info?: { total_token_usage?: Record<string, number> } | null } };
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    if (d.type === "turn_context" && d.payload?.model) {
      model = d.payload.model;
      turns++;
    }
    const u = d.type === "event_msg" && d.payload?.type === "token_count" ? d.payload.info?.total_token_usage : undefined;
    if (u) {
      const cached = u["cached_input_tokens"] ?? 0;
      const written = u["cache_write_input_tokens"] ?? 0;
      total = { input: Math.max(0, (u["input_tokens"] ?? 0) - cached - written), cache_write_5m: written, cache_write_1h: 0, cache_read: cached, output: u["output_tokens"] ?? 0 };
    }
  }
  return total ? { total, model, turns } : undefined;
}

export interface CollectInput {
  store: Store;
  payload: Record<string, unknown>;
  person: { role: string; team?: string };
  assistant: "claude" | "codex" | "cursor";
  now: string;
}

/** On Stop: the session's usage since its last mark, one record per model, added to this month's local file. */
export async function collectUsage(i: CollectInput): Promise<UsageRecord[]> {
  const session = sessionOf(i.payload);
  const transcript = String(i.payload["transcript_path"] ?? "");
  if (!session || !transcript || !existsSync(transcript)) return [];
  mkdirSync(i.store.dir, { recursive: true });
  const marksFile = join(i.store.dir, "marks.json");
  const marks = readJson<Record<string, number>>(marksFile, {});
  // The session's own transcript, and its subagents' beside it (<session>/subagents/agent-*.jsonl), each with its mark.
  const subDir = join(dirname(transcript), basename(transcript, ".jsonl"), "subagents");
  const files = i.assistant === "claude" ? [transcript, ...(existsSync(subDir) ? readdirSync(subDir).filter((f) => f.endsWith(".jsonl")).sort().map((f) => join(subDir, f)) : [])] : [transcript];
  const messages: Message[] = [];
  if (i.assistant === "codex") {
    // Codex keeps a running total per session: the usage since the last stop is the difference.
    const totals = readJson<Record<string, Tokens>>(join(i.store.dir, "codex-totals.json"), {});
    const r = await readCodexRollout(transcript);
    if (r) {
      const before = totals[session] ?? ZERO;
      const d = { input: r.total.input - before.input, cache_write_5m: r.total.cache_write_5m - before.cache_write_5m, cache_write_1h: 0, cache_read: r.total.cache_read - before.cache_read, output: r.total.output - before.output };
      if (d.input + d.cache_write_5m + d.cache_read + d.output > 0) messages.push({ id: `${session}:${r.turns}`, model: r.model, tokens: d });
      totals[session] = r.total;
      writeJson(join(i.store.dir, "codex-totals.json"), totals);
    }
  } else
    for (const file of files) {
      const key = file === transcript ? session : `${session}:${basename(file)}`;
      const r = await readClaudeTranscript(file, marks[key] ?? 0);
      marks[key] = r.lines;
      messages.push(...r.messages);
    }
  writeJson(marksFile, marks);
  const ctx = readJson<Record<string, Context>>(join(i.store.dir, "sessions.json"), {})[session];
  const byModel = new Map<string, { tokens: Tokens; messages: number }>();
  for (const m of messages) {
    const cur = byModel.get(m.model) ?? { tokens: ZERO, messages: 0 };
    byModel.set(m.model, { tokens: addTokens(cur.tokens, m.tokens), messages: cur.messages + 1 });
  }
  const records: UsageRecord[] = [...byModel].map(([model, v]) => ({
    at: i.now,
    session,
    assistant: i.assistant,
    model,
    role: i.person.role,
    ...(i.person.team ? { team: i.person.team } : {}),
    ...(ctx ? { slug: ctx.slug, ...(ctx.step ? { step: ctx.step } : {}) } : {}),
    messages: v.messages,
    tokens: v.tokens,
  }));
  if (records.length) {
    const file = join(i.store.dir, `${i.now.slice(0, 7)}.jsonl`);
    const before = existsSync(file) ? readFileSync(file, "utf8") : "";
    writeFileSync(file, before + records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  }
  return records;
}

/** This person's records of one month, from the local file. */
export function localMonth(store: Store, month: string): UsageRecord[] {
  const file = join(store.dir, `${month}.jsonl`);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => {
      const r = usageRecordSchema.safeParse(JSON.parse(l));
      return r.success ? [r.data] : [];
    });
}
