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

describe("QA and release from the site", () => {
  const post = (path: string, user: string, body: object) => {
    const { remote, ctx, handler } = project();
    return handler.handle("POST", path, user, body, ctx).then((r) => ({ ...r, remote }));
  };
  const saved = (r: { status: number; body: unknown }) => {
    expect(r.status, JSON.stringify(r.body)).toBe(202);
    return (r.body as { save: { branch: string } }).save.branch;
  };
  it("records QA's verdicts in hub/verification.yaml", async () => {
    const r = await post("/verdicts", "iryna.s", { slug: "tasks-issues", verdicts: [{ ac: "AC-04", platform: "ios", verdict: "fail", bugs: ["BUG-0012"] }] });
    expect(git(r.remote, "show", `${saved(r)}:docs/features/tasks-issues/hub/verification.yaml`)).toContain("{ ac: AC-04, platform: ios, verdict: fail, bugs: [BUG-0012]");
  });
  it("refuses QA's sign-off of verify while a criterion has no passing verdict", async () => {
    const r = await post("/signoff", "iryna.s", { slug: "tasks-issues", step: "verify", decision: "pass" });
    expect(r.status).toBe(409);
    expect((r.body as { error: string }).error).toMatch(/Not every criterion passes yet: AC-04 on web: fail/);
  });
  it("lets the owning team change a bug's status, and refuses another team", async () => {
    saved(await post("/bug-edit", "taras.m", { slug: "tasks-issues", id: "BUG-0012", edit: { status: "fixing" } }));
    expect((await post("/bug-edit", "taras.m", { slug: "tasks-issues", id: "BUG-0012", edit: { status: "retest" } })).status).toBe(409); // already so
    expect((await post("/bug-edit", "petro.v", { slug: "tasks-issues", id: "BUG-0012", edit: { status: "closed" } })).status).toBe(403);
  });
  it("files QA's bug from the site", async () => {
    saved(await post("/bug", "iryna.s", { slug: "tasks-issues", bug: { title: "Counter stays", team: "web", severity: "medium", ac: "AC-05", platforms: ["web"] } }));
    expect((await post("/bug", "iryna.s", { slug: "tasks-issues", bug: { title: "x", team: "web", severity: "low", platforms: ["web]\nx: [y"] } })).status).toBe(400);
  });
  it("records Ops' staging check and the PM's go, and refuses them the other way round", async () => {
    const smoke = await post("/release", "bohdan.r", { slug: "tasks-issues", edit: { kind: "smoke", value: "passed" } });
    expect(git(smoke.remote, "show", `${saved(smoke)}:docs/features/tasks-issues/hub/release.yaml`)).toMatch(/smoke: passed/);
    saved(await post("/release", "maksym.d", { slug: "tasks-issues", edit: { kind: "go", value: "go" } }));
    expect((await post("/release", "bohdan.r", { slug: "tasks-issues", edit: { kind: "go", value: "go" } })).status).toBe(403);
    expect((await post("/release", "bohdan.r", { slug: "tasks-issues", edit: { kind: "launch" } })).status).toBe(400);
  }, 30_000);
});

describe("validation from the site", () => {
  const withHeadless = (enabled: boolean) => {
    const { root, remote, ctx } = project();
    const runs: string[] = [];
    const handler = actionHandler({ root, identity: (u) => ({ name: u, email: `${u}@example.com` }), pushOptions: () => [], headless: async (_cwd, prompt) => (runs.push(prompt), { ok: true, text: "## spec.md\nConsistent." }) });
    const config = { ...ctx.project.config, headless: { enabled } };
    return { remote, runs, handler, ctx: { ...ctx, project: { ...ctx.project, config } } };
  };
  it("runs the PO's read-only validation when the admin turned headless runs on, and saves nothing", async () => {
    const { remote, runs, handler, ctx } = withHeadless(true);
    const r = await handler.handle("POST", "/validate", "olena.k", { slug: "tasks-issues" }, ctx);
    expect(r).toEqual({ status: 200, body: { report: "## spec.md\nConsistent." } });
    expect(runs).toEqual(["/hub:validate tasks-issues"]);
    expect(git(remote, "branch", "--list", "hub/*")).toBe("");
    // The person saves the report: a new file in hub/validation/.
    const saved = await handler.handle("POST", "/validation", "olena.k", { slug: "tasks-issues", report: "## spec.md\nConsistent." }, ctx);
    expect(saved.status).toBe(202);
  });
  it("is refused while headless runs are off, and to people who do not validate", async () => {
    const off = withHeadless(false);
    expect((await off.handler.handle("POST", "/validate", "olena.k", { slug: "tasks-issues" }, off.ctx)).status).toBe(409);
    const on = withHeadless(true);
    expect((await on.handler.handle("POST", "/validate", "iryna.s", { slug: "tasks-issues" }, on.ctx)).status).toBe(403);
    expect(on.runs).toEqual([]);
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
    host.afterPush(await saver.save({ user: "olena.k", label: "config", title: "Change config", build: (main) => [{ path: ".hub/config.yaml", next: `${main.read(".hub/config.yaml")}# edit\n` }] }));
    await host.idle();
    expect(saver.refresh()[0]).toMatchObject({ state: "refused", findings: [{ path: ".hub/config.yaml", reason: expect.stringMatching(/No role of olena.k/) }] });
    expect(git(remote, "branch", "--list", "hub/*")).toBe("");
  });
});
