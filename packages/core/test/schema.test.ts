import { describe, expect, it } from "vitest";
import {
  parseBugFile,
  parseConfig,
  parseEngine,
  parseEventsJsonl,
  parseFeature,
  parseFlow,
  parseRelease,
  parseRoles,
  parseSignoffs,
  parseTeamSnapshot,
  parseTestRun,
  type Issue,
} from "../src/index.ts";

const errors = (r: { issues: Issue[] }) => r.issues.filter((i) => i.level === "error");
const warnings = (r: { issues: Issue[] }) => r.issues.filter((i) => i.level === "warning");

const CONFIG = `schema_version: 1
git:
  provider: gitlab
  host: gitlab.example.com
  namespace: shop
  repo: product-specs
project:
  name: Marketplace
teams:
  - id: backend
    name: Backend
    repo: shop/backend
    kind: backend
    api_contract: true
  - id: web
    name: Web
    repo: shop/web-admin
    kind: web
tracker:
  type: jira
  url: https://jira.example.com
  project_key: SHOP
  mirror_bugs: false
assistants: [claude, codex]
engine: sdd
headless:
  enabled: false
`;

describe("config.yaml", () => {
  it("parses a valid config", () => {
    const r = parseConfig(CONFIG, ".hub/config.yaml");
    expect(r.issues).toEqual([]);
    expect(r.value?.teams.map((t) => t.id)).toEqual(["backend", "web"]);
  });

  it("parses the setup prototype's preview once team ids are added", () => {
    // prototypes/setup/sdlc-hub-setup.html, yaml(): the preview has no schema_version and no team ids.
    const preview = CONFIG.replace("schema_version: 1\n", "").replace(/  - id: \w+\n    name/g, "  - name");
    const r = parseConfig(preview, ".hub/config.yaml");
    const msgs = errors(r).map((i) => i.path);
    expect(msgs).toContain("schema_version");
    expect(msgs).toContain("teams.0.id");
    expect(msgs).toContain("teams.1.id");
  });

  it("reports a missing field with its line", () => {
    const r = parseConfig(CONFIG.replace("  namespace: shop\n", ""), ".hub/config.yaml");
    const e = errors(r).find((i) => i.path === "git.namespace");
    expect(e).toBeDefined();
    expect(e?.line).toBe(3); // the git: mapping that lacks the key
  });

  it("reports a wrong type at the value's line", () => {
    const r = parseConfig(CONFIG.replace("enabled: false", "enabled: maybe"), ".hub/config.yaml");
    const e = errors(r).find((i) => i.path === "headless.enabled");
    expect(e?.line).toBe(27);
  });

  it("warns about an unknown key but keeps the value", () => {
    const r = parseConfig(CONFIG + "colour: blue\n", ".hub/config.yaml");
    expect(errors(r)).toEqual([]);
    expect(warnings(r).map((i) => i.path)).toEqual(["colour"]);
    expect(r.value?.project.name).toBe("Marketplace");
  });

  it("refuses two contract teams", () => {
    const r = parseConfig(CONFIG.replace("    kind: web\n", "    kind: web\n    api_contract: true\n"), "c");
    expect(errors(r).map((i) => i.message).join()).toMatch(/one team/i);
  });

  it("refuses a duplicate repository and the specifications repository as a team", () => {
    const dup = parseConfig(CONFIG.replace("shop/web-admin", "shop/backend"), "c");
    expect(errors(dup).map((i) => i.message).join()).toMatch(/same repository/i);
    const spec = parseConfig(CONFIG.replace("shop/web-admin", "shop/product-specs"), "c");
    expect(errors(spec).map((i) => i.message).join()).toMatch(/specifications repository/i);
  });

  it("needs a Jira address and project key", () => {
    const r = parseConfig(CONFIG.replace("  project_key: SHOP\n", ""), "c");
    expect(errors(r).map((i) => i.message).join()).toMatch(/Jira needs/);
  });

  it("refuses a team id that is not kebab-case", () => {
    const r = parseConfig(CONFIG.replace("id: web", "id: Web Admin"), "c");
    expect(errors(r).map((i) => i.path)).toContain("teams.1.id");
  });

  it("reports broken YAML with a line", () => {
    const r = parseConfig("git: [\n", "c");
    expect(r.value).toBeUndefined();
    expect(errors(r)[0]?.line).toBeGreaterThan(0);
  });
});

describe("roles.yaml", () => {
  const ROLES = `schema_version: 1
people:
  - { user: olena.k, name: Olena K., role: po }
  - { user: taras.m, name: Taras M., role: dev, team: backend, lead: true }
  - { user: iryna.s, name: Iryna S., roles: [qa, ops] }
`;
  it("normalises role and roles to a list", () => {
    const r = parseRoles(ROLES, ".hub/roles.yaml");
    expect(r.issues).toEqual([]);
    expect(r.value?.people.map((p) => p.roles)).toEqual([["po"], ["dev"], ["qa", "ops"]]);
  });
  it("refuses both role and roles, or neither", () => {
    const both = parseRoles(ROLES.replace("role: po", "role: po, roles: [pm]"), "r");
    expect(errors(both).map((i) => i.message).join()).toMatch(/either/i);
    const none = parseRoles(ROLES.replace(", role: po", ""), "r");
    expect(errors(none).map((i) => i.message).join()).toMatch(/either/i);
  });
  it("refuses an unknown role", () => {
    const r = parseRoles(ROLES.replace("role: po", "role: boss"), "r");
    expect(errors(r).length).toBeGreaterThan(0);
  });
  it("refuses a lead without a team", () => {
    const r = parseRoles(ROLES.replace("team: backend, ", ""), "r");
    expect(errors(r).map((i) => i.message).join()).toMatch(/team/);
  });
});

describe("flow.yaml and engine adapter", () => {
  const FLOW = `schema_version: 1
lanes: [po, pm]
release: { watch_days: 7 }
steps:
  - { id: specify, role: po, kind: engine }
  - { id: clarify, role: po, kind: engine, gate: { role: po, text: "the spec is ready" } }
  - { id: epic, role: pm, kind: hub, llm: false, evidence: ["signoff:epic"], gate: { role: pm, text: "size, route and leads", returns_to: clarify } }
  - { id: tasks, role: pm, kind: hub, evidence: ["signoff:tasks"], gate: { role: pm, by: team-leads, text: "split" } }
`;
  it("parses a flow", () => {
    const r = parseFlow(FLOW, ".hub/flow.yaml");
    expect(r.issues).toEqual([]);
    expect(r.value?.steps.map((s) => s.id)).toEqual(["specify", "clarify", "epic", "tasks"]);
    expect(r.value?.steps[1]?.gate?.by).toBe("role");
    expect(r.value?.steps[3]?.gate?.by).toBe("team-leads");
  });
  it("refuses duplicate and non-kebab step ids", () => {
    const dup = parseFlow(FLOW.replace("id: clarify", "id: specify"), "f");
    expect(errors(dup).map((i) => i.message).join()).toMatch(/twice/);
    const bad = parseFlow(FLOW.replace("id: clarify", "id: final check"), "f");
    expect(errors(bad).map((i) => i.path)).toContain("steps.1.id");
  });
  it("refuses a return to a step that has no human gate", () => {
    const r = parseFlow(FLOW.replace("returns_to: clarify", "returns_to: specify"), "f");
    expect(errors(r).map((i) => i.message).join()).toMatch(/human gate/);
  });
  it("refuses a step role outside the lanes", () => {
    const r = parseFlow(FLOW.replace("lanes: [po, pm]", "lanes: [po]"), "f");
    expect(errors(r).map((i) => i.message).join()).toMatch(/lane/);
  });

  const ENGINE = `id: sdd
source: genkovich/sdd
version: "2.3.x"
artifacts: docs/features/{slug}
invoke:
  claude: "/sdd:{stage} {slug}"
  codex: "$sdd-{stage} {slug}"
  cursor: "/sdd-{stage} {slug}"
steps:
  specify: { stage: specify, in: specs, done_when: ["file:spec.md"] }
  tech-design: { stages: [design, sequences], in: contract, done_when: ["file:sad.md"] }
  clarify: { stage: clarify, in: specs, skippable_on: [quick, standard], done_when: ["signoff:clarify"] }
returns:
  fix: { stage: fix, from: [verify, qa-final], in: owning-team, done_when: ["file:_fixes/*.md"] }
`;
  it("parses an engine adapter with stage or stages", () => {
    const r = parseEngine(ENGINE, ".hub/engines/sdd.yaml");
    expect(r.issues).toEqual([]);
    expect(r.value?.steps["tech-design"]?.stages).toEqual(["design", "sequences"]);
    expect(r.value?.steps["specify"]?.stages).toEqual(["specify"]);
    expect(r.value?.steps["clarify"]?.skippable_on).toEqual(["quick", "standard"]);
    expect(r.value?.returns?.["fix"]?.from).toEqual(["verify", "qa-final"]);
  });
  it("refuses unknown evidence", () => {
    const r = parseEngine(ENGINE.replace('"file:spec.md"', '"spec.md"'), "e");
    expect(errors(r).map((i) => i.message).join()).toMatch(/evidence/);
  });
  it("refuses a step with both stage and stages", () => {
    const r = parseEngine(ENGINE.replace("{ stages: [design, sequences]", "{ stage: design, stages: [design, sequences]"), "e");
    expect(errors(r).length).toBeGreaterThan(0);
  });
});

describe("feature files", () => {
  it("parses feature.yaml from the specification", () => {
    const r = parseFeature(
      `title: Tasks & issues in the Marketplace admin
owner: olena.k
teams:
  backend: { lead: taras.m }
  web:     { lead: petro.v }
links:
  jira: https://jira.example.com/browse/SHOP-412
estimate:
  days: 15
  tokens_m: [52, 118]
ui: false
`,
      "feature.yaml",
    );
    expect(r.issues).toEqual([]);
    expect(r.value?.teams?.["web"]?.lead).toBe("petro.v");
    expect(r.value?.ui).toBe(false);
  });

  it("parses signoffs.yaml from the specification", () => {
    const r = parseSignoffs(
      `- step: clarify
  user: olena.k
  at: 2026-09-18T10:12:00Z
  file: docs/features/tasks-issues/spec.md
  hash: sha256:3f1c00aa
- step: epic
  user: maksym.d
  at: 2026-09-19T08:40:00Z
  decision: return
  reason: "Size M is too small"
  cycle: 1
- step: qa-final
  user: iryna.s
  at: 2026-10-06T15:02:00Z
  decision: return
  reason: "BUG-0012 reproduces on Android"
  bugs: [BUG-0012]
  returns_to: verify
  cycle: 1
`,
      "signoffs.yaml",
    );
    expect(r.issues).toEqual([]);
    expect(r.value?.[0]?.decision).toBe("pass");
    expect(r.value?.[2]?.bugs).toEqual(["BUG-0012"]);
  });

  it("needs a reason on a return and a file with a hash", () => {
    const noReason = parseSignoffs("- { step: epic, user: a, at: 2026-09-19T08:40:00Z, decision: return, cycle: 1 }\n", "s");
    expect(errors(noReason).map((i) => i.message).join()).toMatch(/reason/);
    const half = parseSignoffs("- { step: clarify, user: a, at: 2026-09-19T08:40:00Z, file: spec.md }\n", "s");
    expect(errors(half).map((i) => i.message).join()).toMatch(/hash/);
  });

  it("needs the file and hash on a confirmation of no change", () => {
    const r = parseSignoffs("- { step: screens, user: daria.l, at: 2026-09-20T08:00:00Z, decision: confirm }\n", "s");
    expect(errors(r).map((i) => i.message).join()).toMatch(/confirmation/);
  });

  it("parses a bug file with front matter", () => {
    const r = parseBugFile(
      `---
id: BUG-0012
title: Task visible after access to the order was revoked
ac: AC-4
platforms: [web, android, ios]
team: backend
severity: high
status: retest            # open | fixing | retest | closed | rejected
found_by: iryna.s
found_in: verify
---
Steps, expected result, actual result and evidence follow as plain text.
`,
      "BUG-0012.md",
    );
    expect(r.issues).toEqual([]);
    expect(r.value?.front.status).toBe("retest");
    expect(r.value?.body).toMatch(/^Steps/);
  });

  it("refuses a bug status outside the list", () => {
    const r = parseBugFile("---\nid: BUG-0001\ntitle: t\nteam: web\nseverity: high\nstatus: done\n---\n", "b");
    expect(errors(r).map((i) => i.path)).toContain("status");
  });

  it("parses release.yaml with the go or no-go", () => {
    const r = parseRelease(
      `staging: { smoke: passed, at: 2026-10-08T12:00:00Z }
checklist:
  - { item: "Backend deployed", done: true }
go: { value: go, user: maksym.d, at: 2026-10-09T09:00:00Z }
rollout: { stage: 100 }
watch: { started: 2026-10-10, days: 7 }
`,
      "release.yaml",
    );
    expect(r.issues).toEqual([]);
    expect(r.value?.go?.value).toBe("go");
  });
});

describe("hub-state records", () => {
  it("parses events and drops malformed lines with an issue", () => {
    const r = parseEventsJsonl(
      [
        '{"step":"implement","event":"started","role":"dev","assistant":"claude","at":"2026-10-01T09:00:00Z"}',
        "not json",
        '{"step":"implement","event":"finished","role":"dev","assistant":"claude","at":"2026-10-01T12:00:00Z","user":"taras.m"}',
      ].join("\n"),
      "events.jsonl",
    );
    expect(r.value?.length).toBe(1);
    expect(errors(r).map((i) => i.line)).toEqual([2, 3]); // line 3 carries a username, which events must not
  });

  it("parses a test run", () => {
    const r = parseTestRun('{"source":"ci","team":"web","platform":"web","passed":40,"failed":0,"at":"2026-10-06T10:00:00Z"}', "t.json");
    expect(r.issues).toEqual([]);
  });

  it("parses a team snapshot", () => {
    const r = parseTeamSnapshot(
      JSON.stringify({
        schema_version: 1,
        team: "web",
        slug: "tasks-issues",
        source_commit: "abc123",
        generated_at: "2026-10-06T10:00:00Z",
        files: ["tasks.json", "tasks/tracker.md"],
        tasks: [{ id: "T1", title: "List", layer: "ui", deps: [], acs: ["AC-01"] }],
        tracker: [{ id: "T1", status: "blocked", blocked_by: ["backend:T2"] }],
        review: null,
        mr: null,
        pipeline: null,
        warnings: [],
      }),
      "web.json",
    );
    expect(r.issues).toEqual([]);
  });
});
