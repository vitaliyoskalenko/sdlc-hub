// Builders for fixture repositories. A fixture is three file trees (main of product-specs, the hub-state
// branch, and local team clones), the git authors of some paths, the time "now", and what detection must find.
// All of it is synthetic until a phase 0 pilot gives real SDD output (see docs/open-items.md, claim 8).

import { contentHash, DEFAULT_FLOW_YAML, DEFAULT_SDD_ENGINE_YAML, type StepStatus } from "../../src/index.ts";

export type Files = Record<string, string>;

export interface Expected {
  current: string;
  /** Statuses of the listed steps. Every step not listed must be "todo". */
  steps: Partial<Record<string, StepStatus>>;
  by?: Record<string, string>;
  waitingOn?: Record<string, string[]>;
  reasons?: Record<string, RegExp>;
  sources?: Record<string, "specs" | "hub-state" | "local-clone">;
  teamSources?: Record<string, "hub-state" | "local-clone" | "none">;
  stale?: string[];
  cycle?: number;
  blockingBugs?: string[];
  /** Each pattern must match one warning; with `onlyWarnings`, every warning must be matched. */
  warnings?: RegExp[];
  onlyWarnings?: boolean;
  /** Each pattern must match one issue message. Without it, the feature must have no issues. */
  issues?: RegExp[];
  waits?: { team: string; task: string; on: string; known: boolean; done: boolean }[];
}

export interface Fixture {
  description: string;
  now: string;
  main: Files;
  hubState?: Files;
  teams?: Record<string, Files>;
  /** Git authors: "main/<path>", "hub-state/<path>" or "hub-state/<path>#L<n>". */
  authors?: Record<string, string>;
  /** Slugs listFeatures must find, when given. */
  features?: string[];
  expected: Record<string, Expected>;
}

// --- the project every fixture starts from

export const CONFIG = `schema_version: 1
git: { provider: gitlab, host: gitlab.example.com, namespace: shop, repo: product-specs }
project: { name: Marketplace }
teams:
  - { id: backend, name: Backend, repo: shop/backend, kind: backend, api_contract: true }
  - { id: web, name: Web, repo: shop/web-admin, kind: web }
  - { id: android, name: Android, repo: shop/android-app, kind: android }
  - { id: ios, name: iOS, repo: shop/ios-app, kind: ios }
tracker: { type: jira, url: https://jira.example.com, project_key: SHOP }
assistants: [claude, codex, cursor]
engine: sdd
headless: { enabled: false }
`;

export const ROLES = `schema_version: 1
people:
  - { user: nazar.t, name: Nazar T., role: admin }
  - { user: olena.k, name: Olena K., role: po }
  - { user: maksym.d, name: Maksym D., role: pm }
  - { user: daria.l, name: Daria L., role: designer }
  - { user: taras.m, name: Taras M., role: dev, team: backend, lead: true }
  - { user: petro.v, name: Petro V., role: dev, team: web, lead: true }
  - { user: andrii.p, name: Andrii P., role: dev, team: android, lead: true }
  - { user: sofiia.h, name: Sofiia H., role: dev, team: ios, lead: true }
  - { user: iryna.s, name: Iryna S., role: qa }
  - { user: bohdan.r, name: Bohdan R., role: ops }
`;

export const base = (): Files => ({
  ".hub/config.yaml": CONFIG,
  ".hub/roles.yaml": ROLES,
  ".hub/flow.yaml": DEFAULT_FLOW_YAML,
  ".hub/engines/sdd.yaml": DEFAULT_SDD_ENGINE_YAML,
});

// --- feature files

export const SPEC = "# Spec\n\n## 5. Acceptance criteria\n\n- AC-01: The thing works.\n";
export const INLINE_PLAN = "\n## Test plan\n\n| AC | Level | Test |\n|---|---|---|\n| AC-01 | unit | the thing works |\n";

export const dir = (slug: string) => `docs/features/${slug}`;

export function specFiles(slug: string, size: string, route: string, spec = SPEC): Files {
  return { [`${dir(slug)}/spec.md`]: spec, [`${dir(slug)}/.size`]: `${size}\n`, [`${dir(slug)}/.route`]: `${route}\n` };
}

export function featureYaml(slug: string, teams?: Record<string, string>): Files {
  const t = teams ? "teams:\n" + Object.entries(teams).map(([id, lead]) => `  ${id}: { lead: ${lead} }\n`).join("") : "";
  return { [`${dir(slug)}/hub/feature.yaml`]: `title: ${slug}\nowner: olena.k\n${t}` };
}

export interface Entry {
  step: string;
  user: string;
  at: string;
  decision?: "pass" | "return" | "confirm";
  reason?: string;
  returns_to?: string;
  bugs?: string[];
  cycle?: number;
  /** A file of the feature folder; the hash is the hash of `hashOf` (default: the file's content in `main`). */
  file?: string;
  hashOf?: string;
}

/** signoffs.yaml from entries; a file's hash is computed from `main` unless `hashOf` gives other content. */
export function signoffs(slug: string, entries: Entry[], main: Files): Files {
  const yaml = entries
    .map((e) => {
      const lines = [`- step: ${e.step}`, `  user: ${e.user}`, `  at: ${e.at}`];
      if (e.decision) lines.push(`  decision: ${e.decision}`);
      if (e.reason) lines.push(`  reason: ${JSON.stringify(e.reason)}`);
      if (e.returns_to) lines.push(`  returns_to: ${e.returns_to}`);
      if (e.bugs) lines.push(`  bugs: [${e.bugs.join(", ")}]`);
      if (e.cycle) lines.push(`  cycle: ${e.cycle}`);
      if (e.file) {
        const path = `${dir(slug)}/${e.file}`;
        lines.push(`  file: ${path}`, `  hash: ${contentHash(e.hashOf ?? main[path] ?? "")}`);
      }
      return lines.join("\n") + "\n";
    })
    .join("");
  return { [`${dir(slug)}/hub/signoffs.yaml`]: yaml };
}

export function tracker(rows: [id: string, status: string, blockedBy?: string][]): string {
  return [
    "# Tracker",
    "",
    "| # | Task | Layer | Owner | Estimate | Blocked by | Status |",
    "|---|---|---|---|---|---|---|",
    ...rows.map(([id, status, blocked]) => `| ${id} | Task ${id} | app | TBD | S | ${blocked ?? "—"} | ${status} |`),
    "",
  ].join("\n");
}

export function tasksJson(slug: string, ids: string[]): string {
  return JSON.stringify({ slug, tasks: ids.map((id) => ({ id, title: `Task ${id}`, layer: "app", deps: [], acs: ["AC-01"] })) });
}

/** The files a team clone holds for a feature, under docs/features/<slug>/. */
export function teamFiles(slug: string, files: Files): Files {
  return Object.fromEntries(Object.entries(files).map(([p, t]) => [`${dir(slug)}/${p}`, t]));
}

export interface SnapshotParts {
  files?: string[];
  tasks?: string[];
  tracker?: { id: string; status: string; blocked_by?: string[] }[];
  review?: "PASS" | "CHANGES REQUESTED";
  mr?: { iid: number; state: "opened" | "merged" | "closed"; author?: string };
}

/** A team snapshot on hub-state, as hub-report writes it. */
export function snapshot(slug: string, team: string, p: SnapshotParts): Files {
  const json = {
    schema_version: 1,
    team,
    slug,
    source_commit: "0000000",
    generated_at: "2026-10-06T08:00:00Z",
    files: p.files ?? [],
    tasks: p.tasks ? p.tasks.map((id) => ({ id, title: `Task ${id}`, layer: "app", deps: [], acs: ["AC-01"] })) : null,
    tracker: p.tracker ? p.tracker.map((r) => ({ id: r.id, status: r.status, blocked_by: r.blocked_by ?? [] })) : null,
    review: p.review ? { file: "_review/review-2026-10-05.md", verdict: p.review } : null,
    mr: p.mr ?? null,
    pipeline: null,
    warnings: [],
  };
  return { [`features/${slug}/teams/${team}.json`]: JSON.stringify(json, null, 2) };
}

/** An XS feature on the quick route, built by the web team alone, shipped and waiting for staging. */
export function shippedWebFeature(slug: string, extra: Entry[] = []): { main: Files; hubState: Files } {
  const main: Files = { ...base(), ...specFiles(slug, "XS", "quick", SPEC + INLINE_PLAN), ...featureYaml(slug, { web: "petro.v" }) };
  Object.assign(
    main,
    signoffs(
      slug,
      [
        { step: "epic", user: "maksym.d", at: "2026-09-20T09:00:00Z" },
        { step: "tech-design", user: "petro.v", at: "2026-09-21T09:00:00Z" },
        { step: "tasks", user: "petro.v", at: "2026-09-22T09:00:00Z" },
        { step: "sprint", user: "maksym.d", at: "2026-09-22T10:00:00Z" },
        { step: "plan-tests", user: "iryna.s", at: "2026-09-22T11:00:00Z" },
        { step: "review", user: "petro.v", at: "2026-09-25T09:00:00Z" },
        { step: "ship", user: "petro.v", at: "2026-09-26T09:00:00Z" },
        ...extra,
      ],
      main,
    ),
  );
  const hubState = snapshot(slug, "web", {
    files: ["sad.md", "adr/0001-keep-it-small.md", "tasks.json", "tasks/tracker.md", "_review/review-2026-10-05.md"],
    tasks: ["T1"],
    tracker: [{ id: "T1", status: "done" }],
    review: "PASS",
    mr: { iid: 118, state: "opened", author: "petro.v" },
  });
  return { main, hubState };
}

export const DONE_THROUGH_SHIP: Partial<Record<string, StepStatus>> = {
  specify: "done",
  clarify: "skipped",
  epic: "done",
  "ux-flows": "skipped",
  "tech-design": "done",
  "data-model": "skipped",
  api: "skipped",
  screens: "skipped",
  tasks: "done",
  sprint: "done",
  "plan-tests": "done",
  implement: "done",
  review: "done",
  ship: "done",
};

export const testRun = (team: string, source: "ci" | "local", failed: number, at: string) =>
  JSON.stringify({ source, team, platform: team, passed: 40, failed, at });

export const releaseYaml = (slug: string, yaml: string): Files => ({ [`${dir(slug)}/hub/release.yaml`]: yaml });
