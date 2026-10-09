import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { hubGuardWorkflow, hubReportWorkflow } from "../src/index.ts";

describe("the hub-guard workflow on GitHub", () => {
  const w = parse(hubGuardWorkflow());
  const steps = w.jobs["hub-guard"].steps as { uses?: string; with?: Record<string, unknown>; run?: string; "working-directory"?: string }[];
  it("runs on pull_request_target as a job named hub-guard, the required check's name", () => {
    expect(Object.keys(w.on)).toEqual(["pull_request_target"]);
    expect(Object.keys(w.jobs)).toEqual(["hub-guard"]);
  });
  it("runs the hub from the default branch and reads the pull request as data only", () => {
    expect(steps[0]!.with).toMatchObject({ path: "base" });
    expect(steps[0]!.with!["ref"]).toBeUndefined(); // the default branch
    expect(steps[1]!.with).toMatchObject({ ref: "${{ github.event.pull_request.head.sha }}", path: "pr", "persist-credentials": false });
    const run = steps.find((s) => s.run)!;
    expect(run["working-directory"]).toBe("pr");
    expect(run.run).toContain("node ../base/hub/cli.js guard --github");
    expect(run.run).not.toMatch(/npm|node (?!\.\.\/base)/); // nothing from the pull request runs
  });
});

describe("the hub-report workflow in a team repository", () => {
  it("runs after the team's workflows and records their result", () => {
    const w = parse(hubReportWorkflow({ specs: "shop/product-specs", team: "web", workflows: ["CI", "E2E"] }));
    expect(w.on.workflow_run).toEqual({ workflows: ["CI", "E2E"], types: ["completed"] });
    const run = w.jobs["hub-report"].steps.at(-1).run as string;
    expect(run).toContain("--tests ${{ github.event.workflow_run.conclusion == 'success' && 'passed' || 'failed' }}");
    expect(run).toContain('git clone --quiet --depth 1 --branch main "git@github.com:shop/product-specs.git"');
  });
  it("reports every push as passed in a repository with no workflows of its own", () => {
    const w = parse(hubReportWorkflow({ specs: "shop/product-specs", team: "android", workflows: [] }));
    expect(Object.keys(w.on)).toEqual(["push"]);
    expect(w.jobs["hub-report"].steps.at(-1).run).toMatch(/--tests passed$/m);
  });
  it("keeps the deploy key out of every command line and never reads a secret in an if", () => {
    const text = hubReportWorkflow({ specs: "shop/product-specs", team: "web", workflows: ["CI"] });
    const w = parse(text);
    expect(w.jobs["hub-report"].if).toBeUndefined();
    expect(text).not.toMatch(/if:.*secrets\./);
    expect(w.jobs["hub-report"].steps.at(-1).run).not.toContain("secrets.");
  });
});
