import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fixtures, materialize } from "@sdlc-hub/fixtures";
import { decryptWith, keyStore, newKeyPair, type TotalRow, type UsageRecord } from "@sdlc-hub/usage";
import { print } from "../src/person.ts";
import { sync } from "../src/sync.ts";

const temp: string[] = [];
afterAll(() => {
  temp.forEach((d) => rmSync(d, { recursive: true, force: true }));
  delete process.env["HUB_KEYS_DIR"];
});
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const record = (slug: string, step: string, role: string, output: number): UsageRecord => ({
  at: "2026-10-08T10:00:00Z", session: "s", assistant: "claude", model: "claude-opus-5-5", role, slug, step, messages: 2,
  tokens: { input: 10, cache_write_5m: 0, cache_write_1h: 0, cache_read: 0, output },
});

describe("hub sync", () => {
  it("publishes each person's usage encrypted, and the PM's machine the open totals", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-sync-"));
    temp.push(dir);
    const { root } = materialize(fixtures["demo"]!, join(dir, "seed"));
    const people = ["olena.k", "petro.v", "iryna.s", "maksym.d"];
    const keys = Object.fromEntries(await Promise.all(people.map(async (u) => [u, await newKeyPair()] as const)));
    for (const u of people) {
      mkdirSync(join(root, ".hub/keys", u), { recursive: true });
      writeFileSync(join(root, ".hub/keys", u, "laptop.pub"), `${keys[u]!.recipient}\n`);
    }
    git(root, "add", "-A");
    git(root, "-c", "user.name=t", "-c", "user.email=t@x", "commit", "-q", "-m", "keys");
    const remote = join(dir, "remote.git");
    git(dir, "clone", "-q", "--bare", root, remote);

    const machine = (u: string) => {
      const clone = join(dir, u);
      git(dir, "clone", "-q", remote, clone);
      git(clone, "config", "hub.user", u);
      git(clone, "config", "user.name", u);
      git(clone, "config", "user.email", `${u}@example.com`);
      const keyDir = join(dir, `keys-${u}`);
      process.env["HUB_KEYS_DIR"] = keyDir;
      keyStore(remote).save(keys[u]!.identity);
      return { clone, keyDir };
    };
    const withUsage = (clone: string, rs: UsageRecord[]) => {
      mkdirSync(join(clone, ".git/sdlc-hub/usage"), { recursive: true });
      writeFileSync(join(clone, ".git/sdlc-hub/usage/2026-10.jsonl"), rs.map((r) => JSON.stringify(r)).join("\n") + "\n");
    };
    const syncAs = async (m: { clone: string; keyDir: string }) => {
      process.env["HUB_KEYS_DIR"] = m.keyDir;
      return sync({ root: m.clone });
    };

    for (const [u, role] of [["olena.k", "po"], ["petro.v", "dev"], ["iryna.s", "qa"]] as const) {
      const m = machine(u);
      withUsage(m.clone, [record("tasks-issues", "verify", role, 1e6)]);
      const r = await syncAs(m);
      expect(r.ok, print(r.lines)).toBe(true);
      expect(print(r.lines)).toContain("Published your usage for 2026-10, encrypted to you, the admins and the PMs");
      // Nothing changed: nothing is sent again.
      expect(print((await syncAs(m)).lines)).toContain("Your usage is published");
    }
    const files = git(remote, "ls-tree", "-r", "--name-only", "hub-state", "metrics/2026-10").split("\n");
    const olenaFile = files.find((f) => f.startsWith("metrics/2026-10/olena.k/"))!;
    const encrypted = git(remote, "show", `hub-state:${olenaFile}`);
    expect(encrypted).toMatch(/^-----BEGIN AGE ENCRYPTED FILE-----/);
    expect(await decryptWith(encrypted, [keys["iryna.s"]!.identity])).toBeUndefined(); // QA reads totals only
    expect(await decryptWith(encrypted, [keys["maksym.d"]!.identity])).toContain('"role":"po"');

    // The PM's machine publishes the open totals: three people on tasks-issues, so the feature shows; no names.
    const pm = machine("maksym.d");
    const r = await syncAs(pm);
    expect(print(r.lines)).toContain("Published the open totals for 2026-10");
    const totals = git(remote, "show", "hub-state:metrics/2026-10/usage.jsonl").split("\n").filter(Boolean).map((l) => JSON.parse(l) as TotalRow);
    expect(totals.find((t) => t.dimension === "feature" && t.key === "tasks-issues")).toMatchObject({ people: 3, messages: 6, cost: expect.closeTo(60.00012, 8) }); // 3M output and 30 input tokens on Opus 5.5
    // One person per role: no role is shown; together they make an "other" of three people.
    expect(totals.filter((t) => t.dimension === "role").map((t) => [t.key, t.people])).toEqual([["other", 3]]);
    expect(JSON.stringify(totals)).not.toMatch(/olena|petro|iryna/);
  }, 120_000);
});
