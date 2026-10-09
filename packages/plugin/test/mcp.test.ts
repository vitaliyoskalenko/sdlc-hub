import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { createHubMcp, type ToolContext } from "../src/index.ts";

const ctx = { open: () => ({ root: "", view: null as never, issues: [{ level: "error", file: ".hub/config.yaml", message: "The file is missing" }] }), user: () => "olena.k", assistant: "claude", saver: () => null as never, now: () => new Date() } as ToolContext;

async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createHubMcp(ctx).connect(a);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(b);
  return client;
}

describe("the hub MCP server", () => {
  it("lists the tools with their inputs", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["hub_bug", "hub_decide", "hub_next", "hub_qa", "hub_record", "hub_release", "hub_release_edit", "hub_return", "hub_signoff", "hub_status", "hub_test", "hub_validation", "hub_verdicts"]);
    expect(tools.find((t) => t.name === "hub_return")!.inputSchema.required).toEqual(["step", "slug", "reason"]);
    expect(tools.find((t) => t.name === "hub_status")!.annotations?.readOnlyHint).toBe(true);
  });
  it("answers a call with the tool's text, marked as an error when it is one", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "hub_status", arguments: {} });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0]!.text).toContain(".hub/config.yaml: The file is missing");
  });
});
