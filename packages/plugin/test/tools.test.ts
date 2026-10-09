import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseBugFile, parseSignoffs } from "@sdlc-hub/core";
import { fixtures, materialize } from "@sdlc-hub/fixtures";
import { openProject } from "@sdlc-hub/git";
import { createSaver } from "@sdlc-hub/save";
import { hubBug, hubDecide, hubNext, hubQa, hubRelease, hubReleaseEdit, hubSignoff, hubStatus, hubVerdicts, sessionContext, type ToolContext } from "../src/index.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

function demo(user: string) {
  const dir = mkdtempSync(join(tmpdir(), "hub-plugin-"));
  temp.push(dir);
  const f = fixtures["demo"]!;
  const { root } = materialize(f, dir);
  const remote = join(dir, "remote.git");
  git(dir, "clone", "-q", "--bare", root, remote);
  git(root, "remote", "add", "origin", remote);
  const ctx: ToolContext = {
    open: () => openProject(root, { now: f.now }),
    user: () => user,
    assistant: "claude",
    saver: (u) => createSaver({ root, identity: { name: u, email: `${u}@example.com` }, pushOptions: () => [] }),
    now: () => new Date("2026-10-08T10:00:00Z"),
  };
  return { ctx, remote };
}

describe("hub_status", () => {
  it("lists every feature and what waits for me", () => {
    const { text } = hubStatus(demo("olena.k").ctx);
    expect(text).toContain("- returns-portal: step 2 of 20, clarify: ready to start, waiting on Olena K.");
    expect(text).toContain("- staff-permissions: released");
    expect(text).toContain("Waiting for you: returns-portal (clarify).");
  });
  it("describes one feature, with the waits between teams and what is mine", () => {
    const { text } = hubStatus(demo("petro.v").ctx, "bulk-order-export");
    expect(text).toMatch(/implement: running/);
    expect(text).toContain("web:T3 waits for backend:T2.");
    expect(text).toMatch(/For you: /);
  });
  it("names the features when the slug is wrong", () => {
    const r = hubStatus(demo("olena.k").ctx, "nope");
    expect(r.isError).toBe(true);
    expect(r.text).toContain("returns-portal");
  });
});

describe("hub_next", () => {
  it("hands the PO the engine command for clarify, unchanged", () => {
    const r = hubNext(demo("olena.k").ctx, "returns-portal");
    expect(r.isError).toBeUndefined();
    expect(r.text).toContain("  /sdd:clarify returns-portal");
    expect(r.text).toContain("/hub:signoff clarify returns-portal");
  });
  it("finds the step that waits for me when no feature is named", () => {
    expect(hubNext(demo("olena.k").ctx).text).toContain("/sdd:clarify returns-portal");
  });
  it("stops the PM at the PO's step, and says whose it is", () => {
    const r = hubNext(demo("maksym.d").ctx, "returns-portal");
    expect(r.isError).toBe(true);
    expect(r.text).toContain("belongs to po (Olena K.)");
  });
  it("tells the backend lead that the gate waits for him", () => {
    const r = hubNext(demo("taras.m").ctx, "order-webhooks");
    expect(r.text).toContain("gate waits for you");
  });
});

describe("hub_signoff, hub_return and hub_bug", () => {
  it("saves the PO's sign-off as a branch", async () => {
    const { ctx, remote } = demo("olena.k");
    const r = await hubSignoff(ctx, "clarify", "returns-portal", "pass");
    expect(r.text).toMatch(/saved as branch hub\/olena\.k\/signoff-clarify-returns-portal-/);
    const branch = git(remote, "branch", "--list", "hub/*").replace("*", "").trim();
    expect(parseSignoffs(git(remote, "show", `${branch}:docs/features/returns-portal/hub/signoffs.yaml`), "s").value!.at(-1)).toMatchObject({ step: "clarify", user: "olena.k" });
  });
  it("explains a refusal without pushing", async () => {
    const { ctx, remote } = demo("maksym.d");
    const r = await hubSignoff(ctx, "clarify", "returns-portal", "pass");
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/clarify is signed by PO/);
    expect(git(remote, "branch", "--list", "hub/*")).toBe("");
  });
  it("needs a reason to return", async () => {
    expect((await hubSignoff(demo("olena.k").ctx, "clarify", "returns-portal", "return", " ")).text).toBe("A return needs a reason");
  });
  it("files QA's bug with the next number, found in verify", async () => {
    const { ctx, remote } = demo("iryna.s");
    const r = await hubBug(ctx, { slug: "tasks-issues", title: "Counter stays after closing a task", team: "web", severity: "medium", ac: "AC-05", platforms: ["web"] });
    expect(r.isError).toBeUndefined();
    const branch = git(remote, "branch", "--list", "hub/*").replace("*", "").trim();
    const files = git(remote, "diff", "--name-only", `main...${branch}`);
    expect(files).toMatch(/^docs\/features\/tasks-issues\/hub\/bugs\/BUG-\d{4}\.md$/);
    expect(parseBugFile(git(remote, "show", `${branch}:${files}`), files).value!.front).toMatchObject({ status: "open", found_by: "iryna.s", found_in: "verify" });
  });
  it("refuses a bug from someone who may not file one", async () => {
    const r = await hubBug(demo("olena.k").ctx, { slug: "tasks-issues", title: "x", team: "web", severity: "low" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/No role of olena\.k/);
  });
});

describe("a new assistant session", () => {
  it("is told who the person is and what waits for them", () => {
    const text = sessionContext(demo("olena.k").ctx);
    expect(text).toContain("The person is Olena K. (olena.k), role po.");
    expect(text).toContain("Waiting for them: returns-portal (clarify).");
  });
  it("still starts when the person is unknown", () => {
    const { ctx } = demo("olena.k");
    expect(sessionContext({ ...ctx, user: () => undefined })).toMatch(/^SDLC Hub: Your git identity matches nobody/);
  });
});

describe("QA and release from the assistant", () => {
  it("shows QA the open cells, the bugs and the latest CI runs", () => {
    const { text } = hubQa(demo("iryna.s").ctx, "tasks-issues");
    expect(text).toContain("open: AC-04 on web: fail; AC-04 on android: fail; AC-04 on ios: fail");
    expect(text).toContain("BUG-0012 high retest (backend, AC-04)");
    expect(text).toContain("Final decisions: return by iryna.s 2026-10-05 (BUG-0012 reproduces on all three clients)");
  });
  it("records QA's verdicts and refuses the final decision before autotests and verify", async () => {
    const { ctx, remote } = demo("iryna.s");
    expect((await hubVerdicts(ctx, "tasks-issues", [{ ac: "AC-04", platform: "web", verdict: "pass" }])).text).toMatch(/saved as branch hub\/iryna\.s\/verdicts-tasks-issues/);
    expect(git(remote, "branch", "--list", "hub/*")).toContain("verdicts-tasks-issues");
    expect((await hubDecide(ctx, "tasks-issues", "pass")).text).toMatch(/does not wait for a sign-off now/);
  });
  it("shows Ops the release and records the smoke check", async () => {
    const { ctx } = demo("bohdan.r");
    expect(hubRelease(ctx, "tasks-issues").text).toContain("1. [ ] Every team's production deploy is done");
    expect((await hubReleaseEdit(ctx, "returns-portal", { kind: "smoke", value: "passed" })).isError).toBeUndefined();
    expect((await hubReleaseEdit(demo("iryna.s").ctx, "returns-portal", { kind: "go", value: "go" })).text).toMatch(/hub-guard would refuse this/);
  });
});
