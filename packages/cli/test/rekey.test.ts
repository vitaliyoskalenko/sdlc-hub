import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fixtures, materialize } from "@sdlc-hub/fixtures";
import { decryptWith, keyStore, newKeyPair } from "@sdlc-hub/usage";
import { print } from "../src/person.ts";
import { rekey } from "../src/rekey.ts";
import { sync } from "../src/sync.ts";

const temp: string[] = [];
afterAll(() => {
  temp.forEach((d) => rmSync(d, { recursive: true, force: true }));
  delete process.env["HUB_KEYS_DIR"];
});
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const commit = (cwd: string, m: string) => git(cwd, "-c", "user.name=t", "-c", "user.email=t@x", "commit", "-q", "-am", m);

describe("hub usage rekey", () => {
  it("encrypts every record again when the PM changes, so the new PM reads them and the old one does not", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-rekey-"));
    temp.push(dir);
    const { root } = materialize(fixtures["demo"]!, join(dir, "seed"));
    const people = ["olena.k", "maksym.d", "nazar.t", "zoe.p"];
    const keys = Object.fromEntries(await Promise.all(people.map(async (u) => [u, await newKeyPair()] as const)));
    for (const u of people) {
      mkdirSync(join(root, ".hub/keys", u), { recursive: true });
      writeFileSync(join(root, ".hub/keys", u, "laptop.pub"), `${keys[u]!.recipient}\n`);
    }
    git(root, "add", "-A");
    commit(root, "keys");
    const remote = join(dir, "remote.git");
    git(dir, "clone", "-q", "--bare", root, remote);
    const machine = (u: string) => {
      const clone = join(dir, u);
      git(dir, "clone", "-q", remote, clone);
      for (const [k, v] of [["hub.user", u], ["user.name", u], ["user.email", `${u}@example.com`]]) git(clone, "config", k!, v!);
      const keyDir = join(dir, `keys-${u}`);
      process.env["HUB_KEYS_DIR"] = keyDir;
      keyStore(remote).save(keys[u]!.identity);
      return { clone, keyDir };
    };

    // Olena's usage, encrypted to her, the admin and the PM of the time (Maksym).
    const olena = machine("olena.k");
    mkdirSync(join(olena.clone, ".git/sdlc-hub/usage"), { recursive: true });
    writeFileSync(join(olena.clone, ".git/sdlc-hub/usage/2026-10.jsonl"), `${JSON.stringify({ at: "2026-10-08T10:00:00Z", session: "s", assistant: "claude", model: "claude-opus-5-5", role: "po", slug: "tasks-issues", step: "specify", messages: 1, tokens: { input: 1, cache_write_5m: 0, cache_write_1h: 0, cache_read: 0, output: 1 } })}\n`);
    expect((await sync({ root: olena.clone })).ok).toBe(true);
    const file = git(remote, "ls-tree", "-r", "--name-only", "hub-state", "metrics/2026-10/olena.k");
    expect(await decryptWith(git(remote, "show", `hub-state:${file}`), [keys["zoe.p"]!.identity])).toBeUndefined();

    // Zoe becomes the PM; Maksym moves to the PO role.
    const admin = machine("nazar.t");
    const roles = join(admin.clone, ".hub/roles.yaml");
    writeFileSync(roles, readFileSync(roles, "utf8").replace("{ user: maksym.d, name: Maksym D., role: pm }", "{ user: maksym.d, name: Maksym D., role: po }\n  - { user: zoe.p, name: Zoe P., role: pm }"));
    commit(admin.clone, "Zoe is the PM");
    git(admin.clone, "push", "-q", "origin", "main");

    // Only the admin or a PM may rekey.
    process.env["HUB_KEYS_DIR"] = olena.keyDir;
    expect(print((await rekey({ root: olena.clone })).lines)).toContain("Only the admin or a PM");
    process.env["HUB_KEYS_DIR"] = admin.keyDir;
    const r = await rekey({ root: admin.clone });
    expect(r.ok, print(r.lines)).toBe(true);
    expect(print(r.lines)).toContain("Encrypted 1 usage record again");
    const now = git(remote, "show", `hub-state:${file}`);
    expect(await decryptWith(now, [keys["zoe.p"]!.identity])).toContain('"step":"specify"');
    expect(await decryptWith(now, [keys["maksym.d"]!.identity])).toBeUndefined();
    expect(await decryptWith(now, [keys["olena.k"]!.identity])).toContain('"step":"specify"');
  });
});
