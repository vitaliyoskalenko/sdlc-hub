import { describe, expect, it } from "vitest";
import { isSaveBranch, parseSaveRefusal, refusalPath, saveBranch } from "../src/index.ts";

describe("save branches", () => {
  it("are named by person, label and time", () => {
    const b = saveBranch("olena.k", "Sign off clarify: tasks-issues", new Date("2026-10-08T10:11:12Z"));
    expect(b).toBe("hub/olena.k/sign-off-clarify-tasks-issues-20261008101112");
    expect(isSaveBranch(b)).toBe(true);
    expect(refusalPath(b)).toBe("saves/olena.k/sign-off-clarify-tasks-issues-20261008101112.json");
  });
  it("leave other branches alone", () => {
    expect(isSaveBranch("feature/x")).toBe(false);
    expect(isSaveBranch("hub/a/b/c")).toBe(false);
    expect(() => refusalPath("main")).toThrow();
  });
  it("record a refusal that the site can read", () => {
    const r = parseSaveRefusal(JSON.stringify({ branch: "hub/olena.k/x-1", mr: 3, author: "olena.k", sha: "abcdef1", at: "2026-10-08T10:00:00Z", findings: [{ user: "olena.k", path: ".hub/config.yaml", reason: "No role" }] }), "r.json");
    expect(r.issues).toEqual([]);
    expect(parseSaveRefusal(JSON.stringify({ branch: "x", author: "a", sha: "abcdef1", at: "2026-10-08T10:00:00Z", findings: [] }), "r.json").value).toBeUndefined();
  });
});
