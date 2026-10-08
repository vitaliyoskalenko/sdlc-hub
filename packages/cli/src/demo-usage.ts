// The demo's usage: the made-up month from the fixtures, encrypted at start with a key made then, published to the
// demo's hub-state with its open totals, so the Costs screen has data. The key lives only in this process.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEMO_USAGE, DEMO_USAGE_MONTH } from "@sdlc-hub/fixtures";
import { writeHubState } from "@sdlc-hub/save";
import { encryptTo, newKeyPair, openTotals, type UsageRecord } from "@sdlc-hub/usage";

/** Returns the demo's private key: the admin's and the PM's view decrypts with it. */
export async function seedDemoUsage(root: string, remote: string, now: string): Promise<string> {
  const key = await newKeyPair();
  const byUser = new Map<string, UsageRecord[]>();
  for (const u of DEMO_USAGE) {
    const [input, w1h, read, output] = u.m.map((x) => Math.round(x * 1e6)) as [number, number, number, number];
    const record: UsageRecord = { at: now, session: `demo-${u.user}`, assistant: "claude", model: u.model, role: u.role, ...(u.team ? { team: u.team } : {}), slug: u.slug, step: u.step, messages: Math.max(1, Math.round(output / 2000)), tokens: { input, cache_write_5m: 0, cache_write_1h: w1h, cache_read: read, output } };
    byUser.set(u.user, [...(byUser.get(u.user) ?? []), record]);
  }
  const files: Record<string, string> = {};
  for (const [user, rs] of byUser) files[`metrics/${DEMO_USAGE_MONTH}/${user}/demo.jsonl.age`] = await encryptTo(rs.map((r) => JSON.stringify(r)).join("\n") + "\n", [key.recipient]);
  const totals = openTotals(DEMO_USAGE_MONTH, [...byUser].flatMap(([user, rs]) => rs.map((record) => ({ user, record }))));
  files[`metrics/${DEMO_USAGE_MONTH}/usage.jsonl`] = totals.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeHubState({
    url: remote,
    message: "demo: a month of usage",
    edit(d) {
      for (const [p, t] of Object.entries(files)) {
        mkdirSync(dirname(join(d, p)), { recursive: true });
        writeFileSync(join(d, p), t);
      }
      return true;
    },
  });
  execFileSync("git", ["fetch", "-q", "origin", "+refs/heads/hub-state:refs/remotes/origin/hub-state"], { cwd: root, stdio: "ignore" });
  return key.identity;
}
