// hub setup and hub doctor: what the setup script runs on the person's machine, in their clone of product-specs.
// setup confirms on main that the person has the roles the script names, records who the checkout belongs to,
// writes the local files for their assistant and tells the admin it is done (hub-state people/<user>.json).
// doctor checks that all of it still holds.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { personStatePath, type Person } from "@sdlc-hub/core";
import { gitIdentity, openProject, personOf } from "@sdlc-hub/git";
import { claudeSetupCommands, MARKETPLACE, PLUGIN } from "@sdlc-hub/plugin/files";
import { createSaver, writeHubState, type Line, type SaverOptions } from "@sdlc-hub/save";
import { identityToRecipient } from "age-encryption";
import { keyPath, keyStore, keysOf, machineName, newKeyPair } from "@sdlc-hub/usage";

export type Run = (cmd: string, args: string[], cwd: string) => { status: number; out: string };

export const runCommand: Run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, timeout: 120_000 });
  return { status: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
};

export type { Line } from "@sdlc-hub/save";

export const release = (root: string): string => {
  const f = join(root, "hub/cli.js");
  return existsSync(f) ? createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 12) : "none";
};

/** The local path rules for Claude Code: guidance only, the guard decides at merge. The admin has none. */
export function claudeLocalSettings(existing: string | null, person: Person): string {
  const s = existing?.trim() ? (JSON.parse(existing) as Record<string, unknown>) : {};
  const permissions = { ...((s["permissions"] as Record<string, unknown> | undefined) ?? {}) };
  const ours = ["Edit(.hub/**)", "Write(.hub/**)", "Edit(hub/**)", "Write(hub/**)", "Edit(.claude-plugin/**)", "Edit(**/hub/signoffs.yaml)", "Write(**/hub/signoffs.yaml)"];
  const deny = ((permissions["deny"] as string[] | undefined) ?? []).filter((r) => !ours.includes(r));
  permissions["deny"] = person.roles.includes("admin") ? deny : [...deny, ...ours];
  return `${JSON.stringify({ ...s, permissions }, null, 2)}\n`;
}

export interface SetupOptions {
  root: string;
  /** How saves open their merge request; GitLab's push options by default. */
  pushOptions?: SaverOptions["pushOptions"];
  user: string;
  roles: string[];
  assistant: string;
  release?: string;
  run?: Run;
  now?: () => Date;
}

export async function personSetup(o: SetupOptions): Promise<{ ok: boolean; lines: Line[] }> {
  const run = o.run ?? runCommand;
  const lines: Line[] = [];
  const say = (ok: boolean, text: string, blocking = true) => lines.push({ ok, text, blocking });
  const done = () => ({ ok: lines.every((l) => l.ok || l.blocking === false), lines });

  const opened = openProject(o.root);
  if (!opened.project) {
    say(false, `.hub/ does not load on main: ${opened.issues.map((i) => `${i.file}: ${i.message}`).join("; ")}`);
    return done();
  }
  const { project } = opened;
  const person = project.roles.people.find((p) => p.user === o.user);
  if (!person) {
    say(false, `${o.user} is not in .hub/roles.yaml on main. Ask the admin to add you on People and roles, then run the script again.`);
    return done();
  }
  const want = [...o.roles].sort().join(" ");
  const have = [...person.roles].sort().join(" ");
  if (want !== have) {
    say(false, `roles.yaml on main gives ${o.user} the roles "${have}", the script says "${want}". Ask the admin for a new script.`);
    return done();
  }
  say(true, `${person.name} (${o.user}) has the roles ${have} on main`);

  const here = release(o.root);
  if (o.release && o.release !== here) say(false, `The hub on main (${here}) is newer than the one this script was made with (${o.release}); this checkout uses main's.`, false);

  // Who this checkout belongs to, for the site and the plugin, whatever the git e-mail says.
  run("git", ["config", "--local", "hub.user", o.user], o.root);
  const id = gitIdentity(o.root);
  if (!id.email) say(false, "git has no user.email. Set it: git config --global user.email <your e-mail>", false);
  say(true, `This checkout belongs to ${o.user} (git config hub.user)`);

  // This machine's usage key: the private key stays here, the public one goes to .hub/keys/ by merge request.
  try {
    const store = keyStore(remoteUrl(o.root, run));
    let identity = store.load();
    let where = "";
    if (!identity) {
      const pair = await newKeyPair();
      identity = pair.identity;
      where = store.save(identity) === "keychain" ? " (private key in your system keychain)" : " (private key in a file only you can read: no keychain here)";
    }
    const recipient = await identityToRecipient(identity);
    if (keysOf(opened.view.specs, o.user).includes(recipient)) say(true, "Your usage key is in .hub/keys/");
    else {
      let machine = machineName();
      for (let n = 2; opened.view.specs.read(keyPath(o.user, machine)) !== undefined; n++) machine = `${machineName()}-${n}`;
      const path = keyPath(o.user, machine);
      createSaver({ root: o.root, identity: { name: id.name || o.user, email: id.email || `${o.user}@localhost` }, ...(o.pushOptions ? { pushOptions: o.pushOptions } : {}) }).save({
        user: o.user,
        label: `key-${machine}`,
        title: `Usage key of ${o.user} on ${machine}`,
        meta: { kind: "key" },
        build: (main) => (main.read(path) === undefined ? [{ path, next: `${recipient}\n` }] : []),
      });
      say(true, `Proposed your usage key as ${path}${where}; it merges by itself`);
    }
  } catch (e) {
    say(false, `Could not set up your usage key: ${(e as Error).message.split("\n")[0]}. Run your setup script again later.`, false);
  }

  if (o.assistant === "claude") {
    const file = join(o.root, ".claude/settings.local.json");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, claudeLocalSettings(existsSync(file) ? readFileSync(file, "utf8") : null, person));
    excludeLocally(o.root, ".claude/settings.local.json");
    say(true, "Wrote your local path rules for Claude Code (.claude/settings.local.json, never committed)");
    const commands = [...claudeSetupCommands(o.root), ...(project.config.engine === "sdd" ? [["claude", "plugin", "install", "sdd@sdd", "--scope", "local"]] : [])];
    for (const [cmd, ...args] of commands) {
      const r = run(cmd!, args, o.root);
      if (r.status !== 0) say(false, `${[cmd, ...args].join(" ")} failed: ${r.out.split("\n").at(-1) ?? ""}. Run it yourself in ${o.root}.`, false);
    }
    say(true, `Claude Code loads the ${PLUGIN} plugin from ${MARKETPLACE} in this checkout`);
  } else say(false, `The hub commands for ${o.assistant} arrive in phase 5; until then use the site and the prompts it gives.`, false);

  // Tell the admin's People and roles that this person is set up.
  const at = (o.now ?? (() => new Date()))().toISOString().replace(/\.\d+Z$/, "Z");
  const record = { user: o.user, setup_at: at, release: here, assistant: o.assistant, platform: process.platform };
  try {
    const url = remoteUrl(o.root, run);
    writeHubState({
      url,
      message: `hub setup: ${o.user}`,
      author: { name: id.name || o.user, email: id.email || `${o.user}@localhost` },
      edit(dir) {
        const path = join(dir, personStatePath(o.user));
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
        return true;
      },
    });
    say(true, "Told the admin that you are set up (hub-state)");
  } catch (e) {
    say(false, `Could not tell the admin that you are set up: ${(e as Error).message.split("\n")[0]}`, false);
  }
  return done();
}

/** Keeps a local file out of commits in this checkout only (.git/info/exclude), whatever the repository ignores. */
function excludeLocally(root: string, path: string) {
  const file = join(root, ".git/info/exclude");
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (text.split("\n").some((l) => l.trim() === path)) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${text}${text && !text.endsWith("\n") ? "\n" : ""}${path}\n`);
}

/** The remote of product-specs as git reaches it from anywhere: a relative path becomes absolute. */
function remoteUrl(root: string, run: Run): string {
  const r = run("git", ["remote", "get-url", "origin"], root);
  if (r.status !== 0) throw new Error("this checkout has no remote origin");
  const url = r.out.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//.test(url) || /^[^/]+@[^:]+:/.test(url) || isAbsolute(url) ? url : resolve(root, url);
}

export function doctor(root: string, run: Run = runCommand): { ok: boolean; lines: Line[] } {
  const lines: Line[] = [];
  const say = (ok: boolean, text: string, blocking = true) => lines.push({ ok, text, blocking });
  const major = Number(process.versions.node.split(".")[0]);
  say(major >= 22, major >= 22 ? `Node.js ${process.versions.node}` : `Node.js ${process.versions.node} is too old: install 22 or newer`);
  const opened = openProject(root);
  if (!opened.project) {
    say(false, `.hub/ does not load: ${opened.issues.map((i) => `${i.file}: ${i.message}`).join("; ")}`);
    return { ok: false, lines };
  }
  say(true, `${opened.project.config.project.name}: .hub/ loads`);
  const user = personOf(root, opened.project.roles);
  const person = opened.project.roles.people.find((p) => p.user === user);
  say(!!person, person ? `You are ${person.name} (${person.user}), ${person.roles.join(", ")}` : "Nobody in roles.yaml matches this checkout: run your setup script again");
  const remote = run("git", ["ls-remote", "--heads", "origin", "main", "hub-state"], root);
  say(remote.status === 0, remote.status === 0 ? "The git host answers" : `The git host does not answer: ${remote.out.split("\n").at(-1)}`);
  if (remote.status === 0) say(/refs\/heads\/hub-state/.test(remote.out), /refs\/heads\/hub-state/.test(remote.out) ? "hub-state exists" : "There is no hub-state branch: ask the admin to run setup again", false);
  const assistant = person?.assistant ?? "claude";
  if (assistant === "claude") {
    const local = join(root, ".claude/settings.local.json");
    const enabled = existsSync(local) && /"hub@product-specs": true/.test(readFileSync(local, "utf8"));
    say(enabled, enabled ? "Claude Code has the hub plugin for this checkout" : `Claude Code does not load the hub plugin here: run ${claudeSetupCommands(root).map((c) => c.join(" ")).join(", then ")}`, false);
  }
  return { ok: lines.every((l) => l.ok || l.blocking === false), lines };
}

export const print = (lines: Line[]) => lines.map((l) => `${l.ok ? "✓" : l.blocking === false ? "!" : "✗"} ${l.text}`).join("\n");
