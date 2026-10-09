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

describe("the ruleset check on a second run", () => {
  it("accepts GitHub's answer with more parameters than were sent, and sees a missing rule or source", async () => {
    const { covers } = await import("../src/install-github.ts");
    const { hubRuleset } = await import("@sdlc-hub/host");
    const want = hubRuleset(15368).rules;
    const answer = JSON.parse(JSON.stringify(want)) as { type: string; parameters?: Record<string, unknown> }[];
    answer[0]!.parameters!["allowed_merge_methods"] = ["merge", "squash", "rebase"];
    expect(covers(answer, want)).toBe(true);
    expect(covers(answer.slice(1), want)).toBe(false);
    expect(covers(answer, hubRuleset().rules)).toBe(true);
    expect(covers(JSON.parse(JSON.stringify(hubRuleset().rules)), want)).toBe(false);
  });
});

describe("the GitHub plan check", () => {
  const answers = { host: "github", address: "github.com", namespace: "shop", repoMode: "existing", repo: "product-specs", teams: [{ name: "Backend", repo: "backend", kind: "backend" }], contract: 0, project: "P", tracker: { type: "none" }, links: {}, assistants: { claude: true, codex: false, cursor: false }, engine: "sdd", headless: false } as const;
  const gh = (plan: string, isPrivate: boolean) =>
    ({
      me: async () => ({ id: 1, login: "nazar.t", name: "Nazar T." }),
      org: async () => ({ login: "shop", id: 2, plan: { name: plan }, deploy_keys_enabled_for_repositories: true }),
      orgRole: async () => "admin",
      repo: async (_o: string, n: string) => ({ id: 3, name: n, full_name: `shop/${n}`, private: isPrivate, default_branch: "main" }),
    }) as never;
  const plan = async (p: string, priv: boolean, mode?: "enforce" | "advisory") => {
    const { preflightGitHub } = await import("../src/install-github.ts");
    const r = await preflightGitHub({ ...answers, teams: [...answers.teams], ...(mode ? { guard: { mode, checks: { files: true, signoffs: true, pushers: true, members: true } } } : {}) }, gh(p, priv));
    return r.checks.find((c) => c.id === "plan")!;
  };
  it("passes GitHub Team, and public repositories on Free", async () => {
    expect((await plan("team", true)).ok).toBe(true);
    expect((await plan("free", false)).ok).toBe(true);
  });
  it("refuses Free with private repositories, unless the admin chose advisory mode", async () => {
    expect(await plan("free", true)).toMatchObject({ ok: false, text: expect.stringMatching(/choose advisory mode/) });
    expect(await plan("free", true, "advisory")).toMatchObject({ ok: true, text: expect.stringMatching(/waits for someone to merge it/) });
  });
});
