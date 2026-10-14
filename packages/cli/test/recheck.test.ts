import { describe, expect, it } from "vitest";
import type { GitLab } from "@sdlc-hub/host";
import { recheckGitLab } from "../src/recheck.ts";

describe("hub recheck on GitLab", () => {
  it("runs the hub-guard job of each open merge request again, in its latest pipeline, and starts no new pipeline", async () => {
    const retried: number[] = [];
    // A new pipeline would be made by the token's bot, which cannot read the CI configuration in hub-ci.
    const gl = {
      mergeRequestsInto: async () => [{ iid: 6 }, { iid: 7 }],
      mergeRequestPipelines: async (_p: string, iid: number) => (iid === 6 ? [{ id: 40 }, { id: 30 }] : [{ id: 41 }]),
      pipelineJobs: async (_p: string, pipeline: number) => (pipeline === 40 ? [{ id: 400, name: "hub-guard" }] : pipeline === 41 ? [] : [{ id: 300, name: "hub-guard" }]),
      retryJob: async (_p: string, job: number) => void retried.push(job),
      mergeRequestPipeline: async () => {
        throw new Error("a new pipeline must not be started");
      },
    } as unknown as GitLab;
    const r = await recheckGitLab({ gl, project: "8" });
    expect(retried).toEqual([400]);
    expect(r.lines.map((l) => l.text)).toEqual(["!6: hub-guard runs again", "!7: no hub-guard job in its latest pipeline; it runs when the merge request's pipeline runs again"]);
  });
});
