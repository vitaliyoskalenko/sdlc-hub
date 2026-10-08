import { describe, expect, it } from "vitest";
import { parseConfig } from "@sdlc-hub/core";
import { configYaml, hubFiles, hubReportJob, problem, reportStage, teamId, withBlock, withIgnore, withInclude, type SetupAnswers } from "../src/index.ts";

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
    expect(withIgnore(null, ".claude/sdd.local.md")).toBe(".claude/sdd.local.md\n");
    expect(withIgnore("node_modules", ".claude/sdd.local.md")).toBe("node_modules\n.claude/sdd.local.md\n");
    expect(withIgnore("a\n.claude/sdd.local.md\n", ".claude/sdd.local.md")).toBe("a\n.claude/sdd.local.md\n");
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
  });
  it("never puts the token on a command line", () => {
    const job = hubReportJob({ specs: "shop/product-specs", team: "web", stage: ".post" });
    expect(job).toContain("GIT_CONFIG_VALUE_0");
    expect(job).not.toMatch(/https?:\/\/[^\s"]*\$HUB_STATE_TOKEN/);
    expect(job).toContain('HUB_TEAM: "web"');
  });
});
