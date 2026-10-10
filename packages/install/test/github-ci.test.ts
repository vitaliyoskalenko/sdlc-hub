import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { hubGuardWorkflow, hubReportWorkflow } from "../src/index.ts";

describe("the hub-guard workflow on GitHub", () => {
  const w = parse(hubGuardWorkflow());
  const steps = w.jobs["hub-guard"].steps as { uses?: string; with?: Record<string, unknown>; run?: string; "working-directory"?: string }[];
  it("runs on pull_request_target as a job named hub-guard, the required check's name", () => {
    expect(Object.keys(w.on)).toEqual(["pull_request_target"]);
    expect(Object.keys(w.jobs)).toEqual(["hub-guard"]);
    // It writes hub-state and deletes a refused branch, and closes its pull request, which GitHub leaves open.
    expect(w.permissions).toEqual({ contents: "write", "pull-requests": "write" });
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

describe("the hub-fanout workflow in a team repository", () => {
  it("runs hourly and on demand, reads product-specs with the deploy key, and opens the pull request with its own token", async () => {
    const { hubFanoutWorkflow } = await import("../src/github-ci.ts");
    const text = hubFanoutWorkflow({ specs: "shop/product-specs", team: "web" });
    const w = parse(text);
    expect(Object.keys(w.on)).toEqual(["schedule", "workflow_dispatch"]);
    expect(w.permissions).toEqual({ contents: "write", "pull-requests": "write" });
    const run = (w.jobs["hub-fanout"].steps as { run?: string; env?: Record<string, string> }[]).find((s) => s.run)!;
    expect(run.env).toEqual({ GH_TOKEN: "${{ github.token }}", BASE: "${{ github.event.repository.default_branch }}" });
    expect(run.run).toContain('fanout --team "web" --specs /tmp/hub-specs --into .');
    expect(run.run).toContain("git@github.com:shop/product-specs.git");
    expect(run.run).toContain("gh pr create");
  });
});

describe("hub-ci on GitLab", () => {
  it("runs hub-guard on merge requests and hub-fanout on main", async () => {
    const { hubGuardCi } = await import("../src/ci.ts");
    const c = parse(hubGuardCi());
    expect(c["hub-guard"].rules).toEqual([{ if: '$CI_PIPELINE_SOURCE == "merge_request_event"' }]);
    expect(c["hub-fanout"].rules).toEqual([{ if: "$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH" }]);
    expect(c["hub-fanout"].script.join("\n")).toContain('node hub/cli.js fanout --server-url "${HUB_GIT_URL:-$CI_SERVER_URL}"');
  });
});
