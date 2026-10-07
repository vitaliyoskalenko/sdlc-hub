import { describe, expect, it } from "vitest";
import { checkChange, parseConfig, parseRoles, type AccessContext, type Change } from "../src/index.ts";

const config = (contract: boolean) =>
  parseConfig(
    `schema_version: 1
git: { provider: gitlab, host: gitlab.example.com, namespace: shop, repo: product-specs }
project: { name: Marketplace }
teams:
  - { id: backend, name: Backend, repo: shop/backend, kind: backend${contract ? ", api_contract: true" : ""} }
  - { id: web, name: Web, repo: shop/web-admin, kind: web }
tracker: { type: none }
assistants: [claude]
engine: sdd
headless: { enabled: false }
`,
    "c",
  ).value!;

const roles = parseRoles(
  `schema_version: 1
people:
  - { user: nazar.t, name: Nazar T., role: admin }
  - { user: olena.k, name: Olena K., role: po }
  - { user: maksym.d, name: Maksym D., role: pm }
  - { user: daria.l, name: Daria L., role: designer }
  - { user: taras.m, name: Taras M., role: dev, team: backend, lead: true }
  - { user: petro.v, name: Petro V., role: dev, team: web, lead: true }
  - { user: andrii.p, name: Andrii P., role: dev, team: web }
  - { user: iryna.s, name: Iryna S., roles: [qa, ops] }
`,
  "r",
).value!;

const ctx = (contract = true): AccessContext => ({ config: config(contract), roles });
const F = "docs/features/tasks-issues";
const write = (user: string, path: string, c = ctx()) => checkChange(user, { path, next: "x\n" }, c).ok;

describe("default deny and the admin", () => {
  it("lets only the admin change hub, .hub, assistant folders and CI files", () => {
    for (const path of ["hub/cli.js", ".hub/config.yaml", ".hub/roles.yaml", ".claude/settings.json", "CLAUDE.md", "AGENTS.md", ".gitlab-ci.yml", "README.md"]) {
      expect(write("olena.k", path), path).toBe(false);
      expect(write("nazar.t", path), path).toBe(true);
    }
  });
  it("refuses a person who is not in roles.yaml", () => {
    expect(checkChange("stranger", { path: `${F}/spec.md`, next: "x" }, ctx())).toMatchObject({ ok: false, reason: expect.stringMatching(/not in roles.yaml/) });
  });
});

describe("paths of each role", () => {
  it.each([
    ["olena.k", `${F}/spec.md`, true],
    ["olena.k", `${F}/.size`, true],
    ["olena.k", "CONTEXT.md", true],
    ["olena.k", `${F}/CONTEXT.md`, true],
    ["olena.k", `${F}/ux-flows.md`, false],
    ["maksym.d", "docs/roadmap.md", true],
    ["maksym.d", `${F}/.size`, false],
    ["daria.l", `${F}/screens.md`, true],
    ["daria.l", `${F}/spec.md`, false],
    ["andrii.p", `${F}/spec.md`, false],
    ["iryna.s", `${F}/test-plan.md`, true],
    ["iryna.s", `${F}/hub/bugs/BUG-0012.md`, true],
    ["iryna.s", `${F}/hub/release.yaml`, true], // through ops; field by field in phase 2
    ["petro.v", `${F}/hub/validation/2026-10-07T1012.md`, true],
  ])("%s writing %s: %s", (user, path, ok) => {
    expect(write(user, path)).toBe(ok);
  });
});

describe("the contract team's files in product-specs", () => {
  it("are written by the contract team's lead only", () => {
    for (const path of [`${F}/sad.md`, `${F}/data-model.md`, `${F}/contracts/openapi.yaml`]) {
      expect(write("taras.m", path), path).toBe(true);
      expect(write("petro.v", path), path).toBe(false);
    }
  });
  it("never include adr, migrations or _audit", () => {
    for (const path of [`${F}/adr/0001-x.md`, `${F}/migrations/01_add.up.sql`, `${F}/_audit/data-model-2026-10-01.md`])
      expect(write("taras.m", path), path).toBe(false);
  });
  it("are written by no lead when no team publishes a contract", () => {
    expect(write("taras.m", `${F}/sad.md`, ctx(false))).toBe(false);
  });
});

describe("rules below the file level", () => {
  const spec = "# Spec\n\n## 5. Acceptance criteria\n\n- AC-01: x\n";
  const plan = "\n## Test plan\n\n| AC | Level |\n|---|---|\n| AC-01 | unit |\n";
  it("let QA add the Test plan section of spec.md and nothing else", () => {
    expect(checkChange("iryna.s", { path: `${F}/spec.md`, base: spec, next: spec + plan }, ctx()).ok).toBe(true);
    const r = checkChange("iryna.s", { path: `${F}/spec.md`, base: spec, next: spec.replace("x", "y") + plan }, ctx());
    expect(r).toMatchObject({ ok: false, line: 5 });
  });
  it("let the PO change feature_size in sad.md and nothing else", () => {
    const sad = '---\nstatus: Draft\nfeature_size: "M"\n---\n\n# SAD\n';
    expect(checkChange("olena.k", { path: `${F}/sad.md`, base: sad, next: sad.replace('"M"', '"L"') }, ctx()).ok).toBe(true);
    expect(checkChange("olena.k", { path: `${F}/sad.md`, base: sad, next: sad.replace("Draft", "Accepted") }, ctx()).ok).toBe(false);
  });
  it("let a developer change only the status of a bug on their own team", () => {
    const bug = "---\nid: BUG-0012\ntitle: t\nteam: web\nseverity: high\nstatus: fixing\n---\nSteps.\n";
    const path = `${F}/hub/bugs/BUG-0012.md`;
    expect(checkChange("andrii.p", { path, base: bug, next: bug.replace("fixing", "retest") }, ctx()).ok).toBe(true);
    expect(checkChange("andrii.p", { path, base: bug, next: bug.replace("title: t", "title: u") }, ctx()).ok).toBe(false);
    expect(checkChange("taras.m", { path, base: bug, next: bug.replace("fixing", "retest") }, ctx()).ok).toBe(false);
  });
});

describe("own key files", () => {
  it("let a person add their own public key and nothing else under .hub", () => {
    expect(checkChange("andrii.p", { path: ".hub/keys/andrii.p-laptop.pub", next: "age1x\n" }, ctx()).ok).toBe(true);
    expect(checkChange("andrii.p", { path: ".hub/keys/petro.v-laptop.pub", next: "age1x\n" }, ctx()).ok).toBe(false);
    expect(checkChange("andrii.p", { path: ".hub/keys/andrii.p-laptop.pub", base: "age1a\n", next: "age1b\n" }, ctx()).ok).toBe(false);
  });
});

describe("renames and deletions", () => {
  it("count as changes to both paths", () => {
    const rename: Change = { path: `${F}/ux-flows.md`, from: `${F}/spec.md`, base: "a\n", next: "a\n" };
    expect(checkChange("olena.k", rename, ctx()).ok).toBe(false);
    expect(checkChange("olena.k", { path: `${F}/spec.md`, base: "a\n" }, ctx()).ok).toBe(true);
    expect(checkChange("daria.l", { path: `${F}/spec.md`, base: "a\n" }, ctx()).ok).toBe(false);
  });
});

describe("signoffs.yaml", () => {
  const base = "- { step: clarify, user: olena.k, at: 2026-09-18T10:12:00Z }\n";
  const added = base + "- { step: epic, user: maksym.d, at: 2026-09-19T08:40:00Z }\n";
  it("can be appended to by a role with gates", () => {
    expect(checkChange("maksym.d", { path: `${F}/hub/signoffs.yaml`, base, next: added }, ctx()).ok).toBe(true);
  });
  it("refuses an edit to an existing entry", () => {
    const r = checkChange("maksym.d", { path: `${F}/hub/signoffs.yaml`, base: added, next: added.replace("olena.k", "maksym.d") }, ctx());
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/append-only/) });
  });
});
