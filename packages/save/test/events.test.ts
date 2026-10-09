import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseEventsJsonl } from "@sdlc-hub/core";
import { flushEvents, queueEvent, queuedEvents } from "../src/index.ts";

const temp: string[] = [];
afterAll(() => temp.forEach((d) => rmSync(d, { recursive: true, force: true })));
const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x", GIT_CONFIG_GLOBAL: "/dev/null" };
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, env, encoding: "utf8" }).trim();
const tmp = (p: string) => {
  const d = mkdtempSync(join(tmpdir(), p));
  temp.push(d);
  return d;
};

function setup() {
  const remote = tmp("hub-ev-remote-");
  git(remote, "init", "-q", "--bare", "-b", "main");
  const seed = tmp("hub-ev-seed-");
  git(seed, "init", "-q", "-b", "main");
  writeFileSync(join(seed, "README.md"), "x\n");
  git(seed, "add", ".");
  git(seed, "commit", "-q", "-m", "seed");
  git(seed, "push", "-q", remote, "main", "main:hub-state");
  const clone = tmp("hub-ev-clone-");
  git(clone, "clone", "-q", remote, ".");
  return { remote, clone };
}

describe("stage events", () => {
  it("are queued on the machine, then pushed to hub-state in the person's name, one file per feature", () => {
    const { remote, clone } = setup();
    queueEvent(clone, { slug: "tasks-issues", step: "specify", event: "started", role: "po", assistant: "claude", at: "2026-10-09T10:00:00Z" });
    queueEvent(clone, { slug: "tasks-issues", step: "specify", event: "finished", role: "po", assistant: "claude", at: "2026-10-09T10:40:00Z" });
    queueEvent(clone, { slug: "returns-portal", step: "clarify", event: "started", role: "po", at: "2026-10-09T11:00:00Z" });
    expect(queuedEvents(clone)).toHaveLength(3);
    expect(flushEvents(clone, { url: remote, author: { name: "Olena K.", email: "olena.k@example.com" } })).toBe(3);
    const text = git(remote, "show", "hub-state:features/tasks-issues/events.jsonl");
    expect(parseEventsJsonl(text, "e").value?.map((e) => e.event)).toEqual(["started", "finished"]);
    expect(text).not.toContain("olena");
    expect(git(remote, "log", "-1", "--format=%an", "hub-state")).toBe("Olena K.");
    expect(queuedEvents(clone)).toEqual([]);
    // A second flush appends to what is there.
    queueEvent(clone, { slug: "tasks-issues", step: "clarify", event: "started", role: "po", at: "2026-10-09T12:00:00Z" });
    flushEvents(clone, { url: remote, author: { name: "Olena K.", email: "olena.k@example.com" } });
    expect(parseEventsJsonl(git(remote, "show", "hub-state:features/tasks-issues/events.jsonl"), "e").value).toHaveLength(3);
  });

  it("stay queued when the host cannot be reached, and refuse a username or a bad slug", () => {
    const { clone } = setup();
    queueEvent(clone, { slug: "tasks-issues", step: "specify", event: "started", role: "po", at: "2026-10-09T10:00:00Z" });
    expect(() => flushEvents(clone, { url: join(tmpdir(), "no-such-remote"), author: { name: "O", email: "o@x" } })).toThrow();
    expect(queuedEvents(clone)).toHaveLength(1);
    // The next flush that reaches the host sends them.
    const { remote } = setup();
    expect(flushEvents(clone, { url: remote, author: { name: "O", email: "o@x" } })).toBe(1);
    expect(queuedEvents(clone)).toEqual([]);
    expect(() => queueEvent(clone, { slug: "tasks-issues", step: "specify", event: "started", role: "po", at: "2026-10-09T10:00:00Z", user: "olena.k" } as never)).toThrow(/Not a valid event/);
    expect(() => queueEvent(clone, { slug: "../x", step: "specify", event: "started", role: "po", at: "2026-10-09T10:00:00Z" })).toThrow();
  });
});
