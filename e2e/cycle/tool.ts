// Calls one tool of the hub's MCP server as a person of the cycle, in their clone of product-specs: what the assistant
// does once the person confirmed in the chat (a sign-off, a verdict, a release record). The server is the real one,
// `node hub/cli.js mcp`, over stdio.
//   node --experimental-transform-types --no-warnings e2e/cycle/tool.ts <user> <tool> '<json arguments>'

import { spawn } from "node:child_process";
import { clone, envOf } from "./lib.ts";

const [user, tool, json] = process.argv.slice(2);
if (!user || !tool) throw new Error("tool.ts <user> <tool> '<json arguments>'");
const dir = clone(user, "product-specs");
const server = spawn("node", ["hub/cli.js", "mcp", "--assistant", "claude"], { cwd: dir, env: envOf(user), stdio: ["pipe", "pipe", "inherit"] });

let buffer = "";
const waiting = new Map<number, (r: { result?: { content: { text: string }[]; isError?: boolean }; error?: { message: string } }) => void>();
server.stdout.on("data", (b: Buffer) => {
  buffer += b.toString();
  for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
    const line = buffer.slice(0, i);
    buffer = buffer.slice(i + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line) as { id?: number };
    if (m.id !== undefined) waiting.get(m.id)?.(m as never);
  }
});
let id = 0;
const call = (method: string, params: unknown) =>
  new Promise<Parameters<NonNullable<ReturnType<typeof waiting.get>>>[0]>((ok) => {
    waiting.set(++id, ok);
    server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });

await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "cycle", version: "1" } });
server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
const r = await call("tools/call", { name: tool, arguments: JSON.parse(json ?? "{}") });
server.kill();
const text = r.error?.message ?? r.result?.content.map((c) => c.text).join("\n") ?? "";
console.log(`${user} · ${tool}: ${text}`);
process.exit(r.error || r.result?.isError ? 1 : 0);
