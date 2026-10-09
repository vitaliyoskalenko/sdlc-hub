import { describe, expect, it } from "vitest";
import { guardSettings, loadProject, memorySource, parseConfig } from "@sdlc-hub/core";
import { configYaml, hubFiles, hubGuardCi, hubReportJob, problem, reportStage, teamId, withBlock, withIgnore, withInclude, type SetupAnswers } from "../src/index.ts";

export const ANSWERS: SetupAnswers = {
  host: "gitlab",
  address: "gitlab.example.com",
  namespace: "shop",
  repoMode: "existing",
  repo: "product-specs",
  teams: [
    { name: "Backend", repo: "backend", kind: "backend" },
    { name: "Web", repo: "web-admin", kind: "web" },
    { name: "Android", repo: "android-app", kind: "android" },
    { name: "iOS", repo: "ios-app", kind: "ios" },
  ],
  contract: 0,
  project: "Marketplace",
  tracker: { type: "jira", url: "https://jira.example.com", key: "SHOP", mirror: false },
  links: {},
  assistants: { claude: true, codex: true, cursor: false },
  engine: "sdd",
  headless: false,
};

describe("setup answers to .hub/ files", () => {
  it("make a config.yaml that core accepts, with team ids from the names", () => {
    const r = parseConfig(configYaml(ANSWERS), "c");
    expect(r.issues).toEqual([]);
    expect(r.value?.teams.map((t) => [t.id, t.repo, t.api_contract ?? false])).toEqual([
      ["backend", "shop/backend", true],
      ["web", "shop/web-admin", false],
      ["android", "shop/android-app", false],
      ["ios", "shop/ios-app", false],
    ]);
    expect(r.value?.assistants).toEqual(["claude", "codex"]);
  });
  it("write every .hub/ file the hub needs, with the installing person as admin", () => {
    const { files, issues } = hubFiles(ANSWERS, { user: "nazar.t", name: "Nazar T." });
    expect(issues).toEqual([]);
    expect(Object.keys(files).sort()).toEqual([".hub/config.yaml", ".hub/engines/sdd.yaml", ".hub/flow.yaml", ".hub/roles.yaml"]);
    expect(files[".hub/roles.yaml"]).toMatch(/user: nazar.t[\s\S]*role: admin/);
  });
  it("write the plain engine with a prompt per stage, and the project loads with it", () => {
    const { files, issues } = hubFiles({ ...ANSWERS, engine: "plain" }, { user: "nazar.t", name: "Nazar T." });
    expect(issues).toEqual([]);
    expect(Object.keys(files).filter((f) => f.startsWith(".hub/engines/"))).toContain(".hub/engines/plain/specify.md");
    expect(loadProject(memorySource(files)).issues).toEqual([]);
  });
  it("write the guard settings: enforce with every check by default, or what the admin chose", () => {
    expect(guardSettings(parseConfig(configYaml(ANSWERS), "c").value!)).toEqual({ mode: "enforce", checks: { files: true, signoffs: true, pushers: true, members: true } });
    expect(configYaml(ANSWERS)).toContain("guard:\n  mode: enforce\n");
    const loose = parseConfig(configYaml({ ...ANSWERS, guard: { mode: "advisory", checks: { files: false, signoffs: true, pushers: false, members: true } }, autoMerge: false }), "c").value!;
    expect(guardSettings(loose)).toEqual({ mode: "advisory", checks: { files: false, signoffs: true, pushers: false, members: true } });
    expect(loose.git.auto_merge).toBe(false);
  });
  it("keep a full address with its scheme for a server that is not https", () => {
    expect(parseConfig(configYaml({ ...ANSWERS, address: "http://localhost:8929" }), "c").value?.git.host).toBe("http://localhost:8929");
  });
  it("say what blocks a screen, like the prototype", () => {
    expect(problem({ ...ANSWERS, teams: [{ ...ANSWERS.teams[0]!, repo: "product-specs" }] }, 1)).toMatch(/cannot be the specifications/);
    expect(problem({ ...ANSWERS, teams: [ANSWERS.teams[0]!, { ...ANSWERS.teams[1]!, repo: "backend" }] }, 1)).toMatch(/same repository/);
    expect(problem({ ...ANSWERS, tracker: { type: "jira", url: "" } }, 2)).toMatch(/Jira needs/);
    expect(problem(ANSWERS, 1)).toBe("");
    expect(teamId("Web Admin")).toBe("web-admin");
  });
});

describe("sections in files the hub does not own", () => {
  it("add the hub block once and replace it on a second run", () => {
    const once = withBlock("# Project\n\nOur rules.\n", "## SDLC Hub\n\nv1");
    const twice = withBlock(once, "## SDLC Hub\n\nv2");
    expect(twice).toMatch(/^# Project\n\nOur rules.\n\n<!-- sdlc-hub:start -->\n## SDLC Hub\n\nv2\n<!-- sdlc-hub:end -->\n$/);
  });
  it("add a .gitignore line once", () => {
    expect(withIgnore(null, ".claude/*.local.md")).toBe(".claude/*.local.md\n");
    expect(withIgnore("node_modules", ".claude/*.local.md")).toBe("node_modules\n.claude/*.local.md\n");
    expect(withIgnore("a\n.claude/*.local.md\n", ".claude/*.local.md")).toBe("a\n.claude/*.local.md\n");
  });
});

describe("the hub-report job", () => {
  it("is included once, keeping the team's CI and its comments", () => {
    const ci = "# our pipeline\nstages: [build, test]\nbuild:\n  stage: build\n  script: [make]\n";
    const once = withInclude(ci);
    expect(once).toMatch(/^include:\n  - local: ci\/hub-report.gitlab-ci.yml\n# our pipeline/);
    expect(once).toContain("script: [make]");
    expect(withInclude(once)).toBe(once);
  });
  it("joins an include that is already there", () => {
    expect(withInclude("include: other.yml\njob:\n  script: [x]\n")).toMatch(/include:\n  - other.yml\n  - local: ci\/hub-report.gitlab-ci.yml/);
    expect(withInclude("include:\n  - local: a.yml\n")).toMatch(/- local: a.yml\n  - local: ci\/hub-report.gitlab-ci.yml/);
  });
  it("makes a whole CI file for a repository that has none, in the test stage", () => {
    expect(withInclude(null)).toBe("include:\n  - local: ci/hub-report.gitlab-ci.yml\n");
    expect(reportStage(null)).toBe("test");
    expect(reportStage("build:\n  script: [x]\n")).toBe(".post");
    // A file that only includes the hub, or sets up stages and defaults, has no CI of its own.
    expect(reportStage("include:\n  - local: ci/hub-report.gitlab-ci.yml\n")).toBe("test");
    expect(reportStage("stages: [build]\ndefault:\n  image: alpine\n.template:\n  script: [x]\n")).toBe("test");
    expect(reportStage("include:\n  - local: ci/hub-report.gitlab-ci.yml\nunit:\n  script: [npm test]\n")).toBe(".post");
  });
  it("is valid GitLab CI: every script entry is a string, and the hub never turns a pipeline red", async () => {
    const { parse } = await import("yaml");
    for (const stage of [".post", "test"]) {
      const ci = parse(hubReportJob({ specs: "shop/product-specs", team: "web", stage }));
      const base = ci[".sdlc-hub"];
      expect(base.before_script.every((s: unknown) => typeof s === "string")).toBe(true);
      expect(base.before_script[0]).toContain("Authorization: Basic");
      expect(base.allow_failure).toBe(true);
      for (const job of Object.keys(ci).filter((k) => !k.startsWith("."))) {
        expect(ci[job].extends).toBe(".sdlc-hub");
        expect(ci[job].script.every((s: unknown) => typeof s === "string")).toBe(true);
        expect(ci[job].allow_failure).toBeUndefined();
      }
    }
  });

  it("runs one hub job per pipeline: at the end, the one that matches the result of the team's jobs", async () => {
    const { parse } = await import("yaml");
    const ci = parse(hubReportJob({ specs: "shop/product-specs", team: "web", stage: ".post" }));
    expect(Object.keys(ci).filter((k) => !k.startsWith(".")).sort()).toEqual(["hub-tests-failed", "hub-tests-passed"]);
    expect(ci["hub-tests-passed"]).toMatchObject({ stage: ".post", rules: [{ if: "$HUB_STATE_TOKEN", when: "on_success" }] });
    expect(ci["hub-tests-passed"].script[0]).toMatch(/--push --tests passed$/);
    expect(ci["hub-tests-failed"]).toMatchObject({ stage: ".post", rules: [{ if: "$HUB_STATE_TOKEN", when: "on_failure" }] });
    expect(ci["hub-tests-failed"].script[0]).toMatch(/--push --tests failed$/);
  });

  it("is the whole pipeline of a repository with no CI of its own, which then counts as passed", async () => {
    const { parse } = await import("yaml");
    const ci = parse(hubReportJob({ specs: "shop/product-specs", team: "web", stage: "test" }));
    expect(Object.keys(ci).filter((k) => !k.startsWith("."))).toEqual(["hub-report"]);
    expect(ci["hub-report"]).toMatchObject({ stage: "test", rules: [{ if: "$HUB_STATE_TOKEN", when: "always" }] });
    expect(ci["hub-report"].script[0]).toMatch(/--push --tests passed$/);
  });

  it("never puts the token on a command line", () => {
    const job = hubReportJob({ specs: "shop/product-specs", team: "web", stage: ".post" });
    expect(job).toContain("GIT_CONFIG_VALUE_0");
    expect(job).not.toMatch(/https?:\/\/[^\s"]*\$HUB_STATE_TOKEN/);
    expect(job).toContain('HUB_TEAM: "web"');
  });
});

describe("the hub-ci configuration of product-specs", () => {
  it("runs hub-guard on merge requests only, with the hub code of main and never the merge request's", async () => {
    const { parse } = await import("yaml");
    const ci = parse(hubGuardCi());
    expect(ci.workflow.rules).toEqual([{ if: '$CI_PIPELINE_SOURCE == "merge_request_event"' }]);
    const job = ci["hub-guard"];
    expect(job.variables.GIT_DEPTH).toBe("0");
    expect(job.script.every((s: unknown) => typeof s === "string")).toBe(true);
    const script = job.script.join("\n");
    expect(script).toContain('git fetch --quiet origin "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"');
    expect(script).toContain("git show FETCH_HEAD:hub/cli.js");
    expect(script).toContain("guard --rules FETCH_HEAD");
    expect(script).not.toMatch(/node hub\/cli\.js/); // the checkout is the merge request: never run its code
  });
});
