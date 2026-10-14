import { describe, expect, it } from "vitest";
import { GitLab } from "../src/index.ts";

/** A fake GitLab that answers from a table and counts the calls. */
function fake(answers: Record<string, unknown>) {
  const calls: string[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(url).replace("https://gl.test/api/v4", "")}`;
    calls.push(key);
    return key in answers ? new Response(JSON.stringify(answers[key]), { status: 200 }) : new Response(JSON.stringify({ message: "405 Method Not Allowed" }), { status: 405 });
  }) as typeof fetch;
  return { gl: new GitLab("https://gl.test", "t", fetcher), calls };
}

describe("setting a merge request to merge by itself", () => {
  it("leaves one that is already set alone", async () => {
    const { gl, calls } = fake({ "GET /projects/7/merge_requests/3": { iid: 3, merge_when_pipeline_succeeds: true, detailed_merge_status: "ci_still_running" } });
    expect((await gl.autoMerge(7, 3, async () => undefined)).merge_when_pipeline_succeeds).toBe(true);
    expect(calls.filter((c) => c.startsWith("PUT"))).toEqual([]);
  });
  it("sets a new one once GitLab has checked it", async () => {
    const { gl, calls } = fake({
      "GET /projects/7/merge_requests/3": { iid: 3, merge_when_pipeline_succeeds: false, detailed_merge_status: "ci_must_pass" },
      "PUT /projects/7/merge_requests/3/merge": { iid: 3, merge_when_pipeline_succeeds: true },
    });
    await gl.autoMerge(7, 3, async () => undefined);
    expect(calls.filter((c) => c.startsWith("PUT"))).toEqual(["PUT /projects/7/merge_requests/3/merge"]);
  });
});

describe("GitLab that is not itself", () => {
  it("says so when it answers with its error page instead of data", async () => {
    const page = (async () => new Response("<html>GitLab is not responding</html>", { status: 502 })) as unknown as typeof fetch;
    await expect(new GitLab("https://gitlab.example.com", "t", page).me()).rejects.toThrow(/with a page, not data: it may be starting or overloaded/);
  });
});

describe("who pushed to a branch", () => {
  it("leaves out a deletion of the branch: removing a refused branch is no contribution to the one pushed again", async () => {
    const events = [
      { author_username: "nazar.t", created_at: "2026-10-14T10:05:00Z", push_data: { ref: "sdlc-hub/install", ref_type: "branch", action: "pushed" } },
      { author_username: "project_1_bot", created_at: "2026-10-14T10:03:00Z", push_data: { ref: "sdlc-hub/install", ref_type: "branch", action: "removed" } },
      { author_username: "olena.k", created_at: "2026-10-14T10:04:00Z", push_data: { ref: "other", ref_type: "branch", action: "pushed" } },
    ];
    const fetcher = (async () => new Response(JSON.stringify(events), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    expect(await new GitLab("https://gl", "t", fetcher).pushers(1, "sdlc-hub/install", "2026-10-14T10:00:00Z")).toEqual(["nazar.t"]);
  });
});
