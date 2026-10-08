import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { detectFeature, parseSignoffs } from "@sdlc-hub/core";
import { fixtures, materialize } from "@sdlc-hub/fixtures";
import { openProject } from "@sdlc-hub/git";
import type { ActionContext } from "@sdlc-hub/server";
import { createSaver } from "@sdlc-hub/save";
import { actionHandler } from "../src/actions.ts";
import { addDemoRemote, demoHost } from "../src/demo-host.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

/** The demo project with a bare remote as origin, as a person's clone would have. */
function project() {
  const dir = mkdtempSync(join(tmpdir(), "hub-act-"));
  temp.push(dir);
  const fixture = fixtures["demo"]!;
  const { root } = materialize(fixture, dir);
  const remote = join(dir, "remote.git");
  git(dir, "clone", "-q", "--bare", root, remote);
  git(root, "remote", "add", "origin", remote);
  git(root, "fetch", "-q", "origin");
  const opened = openProject(root, { now: fixture.now });
  const ctx: ActionContext = { project: opened.project!, specs: opened.view.specs, state: (slug) => detectFeature(opened.project!, opened.view, slug), emit: () => undefined };
  const handler = actionHandler({ root, identity: (u) => ({ name: u, email: `${u}@example.com` }), pushOptions: () => [], now: () => new Date("2026-10-08T10:00:00Z") });
  return { root, remote, ctx, handler };
}

describe("sign-off and return from the site", () => {
  it("pushes the PO's sign-off of clarify as a save branch, pending", async () => {
    const { remote, ctx, handler } = project();
    const r = await handler.handle("POST", "/signoff", "olena.k", { slug: "returns-portal", step: "clarify", decision: "pass" }, ctx);
    expect(r.status).toBe(202);
    const save = (r.body as { save: { branch: string; state: string; meta: Record<string, string> } }).save;
    expect(save).toMatchObject({ state: "pending", meta: { kind: "signoff", slug: "returns-portal", step: "clarify", decision: "pass" } });
    const entries = parseSignoffs(git(remote, "show", `${save.branch}:docs/features/returns-portal/hub/signoffs.yaml`), "s").value!;
    expect(entries.at(-1)).toMatchObject({ step: "clarify", user: "olena.k", decision: "pass", file: "docs/features/returns-portal/spec.md" });
    const list = await handler.handle("GET", "/saves", "olena.k", null, ctx);
    expect((list.body as { saves: unknown[] }).saves).toHaveLength(1);
    expect(((await handler.handle("GET", "/saves", "maksym.d", null, ctx)).body as { saves: unknown[] }).saves).toHaveLength(0);
  });

  it("refuses, before pushing, a sign-off the guard would refuse, with its reason", async () => {
    const { remote, ctx, handler } = project();
    const r = await handler.handle("POST", "/signoff", "maksym.d", { slug: "returns-portal", step: "clarify", decision: "pass" }, ctx);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ findings: [{ reason: expect.stringMatching(/clarify is signed by PO/) }] });
    expect(git(remote, "branch", "--list", "hub/*")).toBe("");
  });

  it("records a return with its reason", async () => {
    const { remote, ctx, handler } = project();
    const r = await handler.handle("POST", "/signoff", "olena.k", { slug: "returns-portal", step: "clarify", decision: "return", reason: "AC-03 needs a time limit" }, ctx);
    expect(r.status).toBe(202);
    const branch = (r.body as { save: { branch: string } }).save.branch;
    expect(parseSignoffs(git(remote, "show", `${branch}:docs/features/returns-portal/hub/signoffs.yaml`), "s").value!.at(-1)).toMatchObject({ decision: "return", reason: "AC-03 needs a time limit", cycle: 1 });
  });

  it("refuses a step that does not wait for a sign-off, a second save of the same, and bad input", async () => {
    const { ctx, handler } = project();
    expect((await handler.handle("POST", "/signoff", "olena.k", { slug: "returns-portal", step: "epic", decision: "pass" }, ctx)).status).toBe(409);
    expect((await handler.handle("POST", "/signoff", "olena.k", { slug: "returns-portal", step: "clarify", decision: "pass" }, ctx)).status).toBe(202);
    expect((await handler.handle("POST", "/signoff", "olena.k", { slug: "returns-portal", step: "clarify", decision: "pass" }, ctx)).status).toBe(409);
    expect((await handler.handle("POST", "/signoff", "olena.k", { slug: "../x", step: "clarify", decision: "pass" }, ctx)).status).toBe(400);
    expect((await handler.handle("POST", "/signoff", "olena.k", { slug: "returns-portal", step: "clarify", decision: "return", reason: "" }, ctx)).status).toBe(400);
    expect((await handler.handle("POST", "/nope", "olena.k", {}, ctx)).status).toBe(404);
  });
});

describe("People and roles from the site", () => {
  it("saves the admin's new person in roles.yaml as a branch", async () => {
    const { remote, ctx, handler } = project();
    const r = await handler.handle("POST", "/person", "nazar.t", { kind: "set", person: { user: "anna.b", name: "Anna B.", roles: ["qa"], os: "windows", assistant: "claude" } }, ctx);
    expect(r.status, JSON.stringify(r.body)).toBe(202);
    const branch = (r.body as { save: { branch: string; meta: Record<string, string> } }).save;
    expect(branch.meta).toEqual({ kind: "person", person: "anna.b", action: "add" });
    expect(git(remote, "show", `${branch.branch}:.hub/roles.yaml`)).toContain("user: anna.b");
  });
  it("refuses anyone but the admin, and a bad person, before pushing", async () => {
    const { remote, ctx, handler } = project();
    const pm = await handler.handle("POST", "/person", "maksym.d", { kind: "remove", user: "bohdan.r" }, ctx);
    expect(pm.status).toBe(403);
    expect(pm.body).toMatchObject({ findings: [{ reason: expect.stringMatching(/No role of maksym\.d/) }] });
    expect((await handler.handle("POST", "/person", "nazar.t", { kind: "set", person: { user: "x", name: "X", roles: ["boss"] } }, ctx)).status).toBe(400);
    expect((await handler.handle("POST", "/person", "nazar.t", { kind: "set", person: { user: "x" } }, ctx)).status).toBe(400);
    expect((await handler.handle("POST", "/person", "nazar.t", { kind: "drop" }, ctx)).status).toBe(400);
    expect(git(remote, "branch", "--list", "hub/*")).toBe("");
  });
});

describe("the demo's stand-in for the git host", () => {
  it("merges a save that hub-guard passes, and the feature moves on", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-demohost-"));
    temp.push(dir);
    const fixture = fixtures["demo"]!;
    const { root } = materialize(fixture, dir);
    const remote = addDemoRemote(root);
    const host = demoHost({ root, remote, delayMs: 0 });
    const handler = actionHandler({ root, identity: (u) => ({ name: u, email: `${u}@example.com` }), pushOptions: () => [], afterPush: host.afterPush, now: () => new Date("2026-10-08T10:00:00Z") });
    const ctxNow = () => {
      const opened = openProject(root, { now: fixture.now });
      return { project: opened.project!, specs: opened.view.specs, state: (slug: string) => detectFeature(opened.project!, opened.view, slug), emit: () => undefined } satisfies ActionContext;
    };
    expect(ctxNow().state("returns-portal")!.current).toBe("clarify");
    expect((await handler.handle("POST", "/signoff", "olena.k", { slug: "returns-portal", step: "clarify", decision: "pass" }, ctxNow())).status).toBe(202);
    await host.idle();
    expect(ctxNow().state("returns-portal")!.steps.find((s) => s.id === "clarify")!.status).toBe("done");
    const saves = (await handler.handle("GET", "/saves", "olena.k", null, ctxNow())).body as { saves: { state: string }[] };
    expect(saves.saves[0]!.state).toBe("merged");
    expect(git(remote, "branch", "--list", "hub/*")).toBe("");
  });

  it("records a refusal in hub-state and deletes the branch, and the site sees why", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hub-demohost-"));
    temp.push(dir);
    const { root } = materialize(fixtures["demo"]!, dir);
    const remote = addDemoRemote(root);
    const host = demoHost({ root, remote, delayMs: 0, now: () => "2026-10-08T10:01:00Z" });
    // A save that skipped the site's own check, as an older hub might push.
    const saver = createSaver({ root, identity: { name: "olena.k", email: "olena.k@example.com" }, pushOptions: () => [] });
    host.afterPush(saver.save({ user: "olena.k", label: "config", title: "Change config", build: (main) => [{ path: ".hub/config.yaml", next: `${main.read(".hub/config.yaml")}# edit\n` }] }));
    await host.idle();
    expect(saver.refresh()[0]).toMatchObject({ state: "refused", findings: [{ path: ".hub/config.yaml", reason: expect.stringMatching(/No role of olena.k/) }] });
    expect(git(remote, "branch", "--list", "hub/*")).toBe("");
  });
});
