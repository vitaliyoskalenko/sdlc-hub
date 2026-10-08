// hub sync: pull both branches, publish this machine's usage, encrypted, and on the admin's or the PM's machine the
// open totals for everyone. It also refreshes Claude Code's copy of the hub plugin when hub/plugin changed.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { identityToRecipient } from "age-encryption";
import { gitIdentity, openProject, personOf, refSource } from "@sdlc-hub/git";
import { writeHubState, type Line } from "@sdlc-hub/save";
import { decryptWith, encryptTo, keyStore, machineName, openTotals, recipientsFor, usageRecordSchema, type UsageRecord } from "@sdlc-hub/usage";
import { remoteUrl, runCommand, type Run } from "./person.ts";

export interface SyncOptions {
  root: string;
  run?: Run;
  now?: () => Date;
}

const usageDir = (root: string, run: Run) => {
  const common = run("git", ["rev-parse", "--git-common-dir"], root).out.trim();
  return join(common.startsWith("/") ? common : join(root, common), "sdlc-hub", "usage");
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const records = (text: string): UsageRecord[] =>
  text
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => {
      try {
        const r = usageRecordSchema.safeParse(JSON.parse(l));
        return r.success ? [r.data] : [];
      } catch {
        return [];
      }
    });

export async function sync(o: SyncOptions): Promise<{ ok: boolean; lines: Line[] }> {
  const run = o.run ?? runCommand;
  const lines: Line[] = [];
  const say = (ok: boolean, text: string, blocking = true) => lines.push({ ok, text, blocking });

  // 1. Both branches; main moves on only when the checkout has no changes of its own.
  const fetched = run("git", ["fetch", "-q", "origin", "+refs/heads/main:refs/remotes/origin/main", "+refs/heads/hub-state:refs/remotes/origin/hub-state"], o.root);
  if (fetched.status !== 0) {
    say(false, `Could not reach the git host: ${fetched.out.split("\n").at(-1)}`);
    return { ok: false, lines };
  }
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], o.root).out.trim();
  const dirty = run("git", ["status", "--porcelain", "--untracked-files=no"], o.root).out.trim();
  if (branch !== "main") say(false, `You are on ${branch}, not main: main was fetched but not checked out`, false);
  else if (dirty) say(false, "main has changes of your own, so it was fetched but not moved; commit or stash them, then sync again", false);
  else {
    const ff = run("git", ["merge", "-q", "--ff-only", "refs/remotes/origin/main"], o.root);
    say(ff.status === 0, ff.status === 0 ? "main is up to date" : `main could not move forward: ${ff.out.split("\n").at(-1)}`, false);
  }

  const opened = openProject(o.root);
  if (!opened.project) {
    say(false, ".hub/ does not load");
    return { ok: false, lines };
  }
  const { project } = opened;
  const user = personOf(o.root, project.roles);
  const person = project.roles.people.find((p) => p.user === user);
  if (!user || !person) {
    say(false, "Nobody in roles.yaml matches this checkout: run your setup script");
    return { ok: false, lines };
  }
  // The same address setup named the usage key by.
  const remote = remoteUrl(o.root, run);
  const identity = keyStore(remote).load();
  const id = gitIdentity(o.root);
  const author = { name: id.name || user, email: id.email || `${user}@localhost` };

  // 2. This machine's usage, each month that changed since the last sync, encrypted.
  const dir = usageDir(o.root, run);
  const sentFile = join(dir, "published.json");
  const sent = existsSync(sentFile) ? (JSON.parse(readFileSync(sentFile, "utf8")) as Record<string, string>) : {};
  const months = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)).map((f) => f.slice(0, 7)) : [];
  const changed = months.filter((m) => sent[m] !== hash(readFileSync(join(dir, `${m}.jsonl`), "utf8")));
  if (!identity && changed.length) say(false, "There is no usage key on this machine: run your setup script, then sync again", false);
  else if (changed.length) {
    const recipients = [...new Set([...recipientsFor(opened.view.specs, project.roles, user), await identityToRecipient(identity!)])];
    const files: Record<string, string> = {};
    for (const m of changed) files[`metrics/${m}/${user}/${machineName()}.jsonl.age`] = await encryptTo(readFileSync(join(dir, `${m}.jsonl`), "utf8"), recipients);
    try {
      writeHubState({
        url: remote,
        message: `hub sync: usage of ${user}, ${changed.join(", ")}`,
        author,
        edit(d) {
          for (const [p, t] of Object.entries(files)) {
            mkdirSync(dirname(join(d, p)), { recursive: true });
            writeFileSync(join(d, p), t);
          }
          return true;
        },
      });
      for (const m of changed) sent[m] = hash(readFileSync(join(dir, `${m}.jsonl`), "utf8"));
      writeFileSync(sentFile, JSON.stringify(sent));
      say(true, `Published your usage for ${changed.join(", ")}, encrypted to you, the admins and the PMs`);
    } catch (e) {
      say(false, `Could not publish your usage: ${(e as Error).message.split("\n")[0]}`, false);
    }
  } else say(true, "Your usage is published");

  // 3. The open totals, from the admin's or the PM's machine: the only ones who can read every person's usage.
  if (identity && (person.roles.includes("admin") || person.roles.includes("pm"))) {
    run("git", ["fetch", "-q", "origin", "+refs/heads/hub-state:refs/remotes/origin/hub-state"], o.root);
    const state = refSource(o.root, "refs/remotes/origin/hub-state");
    const byMonth = new Map<string, { user: string; record: UsageRecord }[]>();
    for (const p of state.list("metrics")) {
      const m = /^metrics\/(\d{4}-\d{2})\/([^/]+)\/[^/]+\.jsonl\.age$/.exec(p);
      if (!m) continue;
      const text = await decryptWith(state.read(p) ?? "", [identity]);
      if (text === undefined) continue;
      byMonth.set(m[1]!, [...(byMonth.get(m[1]!) ?? []), ...records(text).map((record) => ({ user: m[2]!, record }))]);
    }
    const totals: Record<string, string> = {};
    for (const [m, list] of byMonth) {
      const text = openTotals(m, list, project.config.prices).map((r) => JSON.stringify(r)).join("\n") + "\n";
      if (state.read(`metrics/${m}/usage.jsonl`) !== text) totals[`metrics/${m}/usage.jsonl`] = text;
    }
    if (Object.keys(totals).length) {
      try {
        writeHubState({
          url: remote,
          message: `hub sync: open totals ${Object.keys(totals).map((p) => p.split("/")[1]).join(", ")}`,
          author,
          edit(d) {
            for (const [p, t] of Object.entries(totals)) {
              mkdirSync(dirname(join(d, p)), { recursive: true });
              writeFileSync(join(d, p), t);
            }
            return true;
          },
        });
        say(true, `Published the open totals for ${Object.keys(totals).map((p) => p.split("/")[1]).join(", ")}: groups of three people or more`);
      } catch (e) {
        say(false, `Could not publish the open totals: ${(e as Error).message.split("\n")[0]}`, false);
      }
    } else say(true, "The open totals are up to date");
  }

  // 4. Claude Code keeps a copy of the hub plugin: refresh it when hub/plugin changed.
  const pluginFile = join(o.root, "hub/plugin/.claude-plugin/plugin.json");
  if ((person.assistant ?? "claude") === "claude" && existsSync(pluginFile)) {
    const version = (JSON.parse(readFileSync(pluginFile, "utf8")) as { version?: string }).version ?? "";
    const seenFile = join(dir, "plugin-version");
    const seen = existsSync(seenFile) ? readFileSync(seenFile, "utf8").trim() : "";
    if (version && version !== seen) {
      const a = run("claude", ["plugin", "marketplace", "update", "product-specs"], o.root);
      const b = a.status === 0 ? run("claude", ["plugin", "update", "hub@product-specs", "--scope", "local"], o.root) : a;
      if (b.status === 0) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(seenFile, version);
        say(true, `Claude Code has the hub plugin ${version}; start a new session to use it`);
      } else say(false, `Could not refresh the hub plugin in Claude Code: ${b.out.split("\n").at(-1)}`, false);
    }
  }
  return { ok: lines.every((l) => l.ok || l.blocking === false), lines };
}
