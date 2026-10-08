import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parsePersonState } from "@sdlc-hub/core";
import { fixtures, materialize } from "@sdlc-hub/fixtures";
import { hubUser } from "@sdlc-hub/git";
import { doctor, personSetup, print, runCommand, type Run } from "../src/person.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

/** A person's clone of the demo product-specs, with a bare remote; claude is recorded, git is real. */
function clone() {
  const dir = mkdtempSync(join(tmpdir(), "hub-person-"));
  temp.push(dir);
  const { root } = materialize(fixtures["demo"]!, dir);
  const remote = join(dir, "remote.git");
  git(dir, "clone", "-q", "--bare", root, remote);
  git(root, "remote", "add", "origin", "../remote.git");
  git(root, "fetch", "-q", "origin");
  const claude: string[] = [];
  const run: Run = (cmd, args, cwd) => (cmd === "claude" ? (claude.push(args.join(" ")), { status: 0, out: "" }) : runCommand(cmd, args, cwd));
  return { root, remote, run, claude };
}

describe("hub setup", () => {
  it("confirms the role on main, records who the checkout is, sets up Claude Code and tells the admin", () => {
    const { root, remote, run, claude } = clone();
    const r = personSetup({ root, user: "iryna.s", roles: ["qa"], assistant: "claude", run, now: () => new Date("2026-10-08T12:00:00Z") });
    expect(r.ok, print(r.lines)).toBe(true);
    expect(hubUser(root)).toBe("iryna.s");
    expect(claude).toEqual([`plugin marketplace add ${root} --scope local`, "plugin install hub@product-specs --scope local", "plugin install sdd@sdd --scope local"]);
    const local = JSON.parse(readFileSync(join(root, ".claude/settings.local.json"), "utf8"));
    expect(local.permissions.deny).toContain("Edit(.hub/**)");
    const state = parsePersonState(git(remote, "show", "hub-state:people/iryna.s.json"), "p");
    expect(state.value).toMatchObject({ user: "iryna.s", setup_at: "2026-10-08T12:00:00Z", assistant: "claude" });
    // Nothing to commit, even without a global ignore file: setup excludes its local files in the checkout itself.
    expect(git(root, "-c", "core.excludesFile=/dev/null", "status", "--porcelain")).toBe("");
  });
  it("is safe to run again", () => {
    const { root, run } = clone();
    personSetup({ root, user: "iryna.s", roles: ["qa"], assistant: "claude", run });
    const again = personSetup({ root, user: "iryna.s", roles: ["qa"], assistant: "claude", run });
    expect(again.ok).toBe(true);
    const deny = JSON.parse(readFileSync(join(root, ".claude/settings.local.json"), "utf8")).permissions.deny as string[];
    expect(deny.length).toBe(new Set(deny).size);
  });
  it("stops when main does not give the person the roles the script names", () => {
    const { root, run } = clone();
    const r = personSetup({ root, user: "iryna.s", roles: ["admin"], assistant: "claude", run });
    expect(r.ok).toBe(false);
    expect(print(r.lines)).toContain('gives iryna.s the roles "qa", the script says "admin"');
    expect(hubUser(root)).toBeUndefined();
    expect(personSetup({ root, user: "ghost", roles: ["qa"], assistant: "claude", run }).lines[0]!.text).toMatch(/not in .hub\/roles.yaml/);
  });
  it("gives the admin no local path rules", () => {
    const { root, run } = clone();
    personSetup({ root, user: "nazar.t", roles: ["admin"], assistant: "claude", run });
    expect(JSON.parse(readFileSync(join(root, ".claude/settings.local.json"), "utf8")).permissions.deny).toEqual([]);
  });
});

describe("hub doctor", () => {
  it("passes after setup and says what is wrong before it", () => {
    const { root, run } = clone();
    const before = doctor(root, run);
    expect(print(before.lines)).toContain("! Claude Code does not load the hub plugin here");
    personSetup({ root, user: "iryna.s", roles: ["qa"], assistant: "claude", run });
    const after = doctor(root, run);
    expect(after.ok, print(after.lines)).toBe(true);
    expect(print(after.lines)).toContain("✓ You are Iryna S. (iryna.s), qa");
  });
});
