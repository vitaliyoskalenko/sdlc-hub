// The demo project: the prototype's five features at the same steps, with the prototype's sample data (criteria,
// stories, task splits, bugs and test runs), plus one feature with no user interface. Synthetic like every fixture:
// it exists so the site can be shown to the team and clicked through for every role.

import { base, dir, type Entry, type Files, type Fixture, signoffs, snapshot, type SnapshotParts, testRun, type TaskSpec } from "./build.ts";

const NOW = "2026-10-07T12:00:00Z";
const LEADS4 = { backend: "taras.m", web: "petro.v", android: "andrii.p", ios: "sofiia.h" };

/** Who signs each gate in the default flow, given the feature's leads and its contract team. */
function signers(step: string, leads: Record<string, string>, contract: string | null): string[] {
  const all = Object.values(leads);
  const others = contract ? Object.entries(leads).filter(([t]) => t !== contract).map(([, u]) => u) : all;
  switch (step) {
    case "clarify":
    case "ux-flows":
    case "screens":
    case "accept":
      return ["olena.k"];
    case "epic":
    case "sprint":
      return ["maksym.d"];
    case "plan-tests":
    case "verify":
    case "qa-final":
      return ["iryna.s"];
    case "tech-design":
    case "api":
      return others.length ? others : all;
    case "data-model":
      return contract ? [leads[contract]!] : all;
    default:
      return all; // tasks, review, ship
  }
}

/** Sign-off entries for the given steps, one day apart from `from`. */
function sign(steps: string[], leads: Record<string, string>, contract: string | null, from: string): Entry[] {
  const start = new Date(from);
  return steps.flatMap((step, i) => {
    const at = new Date(start.getTime() + i * 86_400_000).toISOString().replace(".000", "");
    return signers(step, leads, contract).map((user) => ({ step, user, at }));
  });
}

function featureYaml(title: string, jira: string, teams: Record<string, string>, days: number, extra = ""): string {
  return (
    `title: ${title}\nowner: olena.k\nteams:\n` +
    Object.entries(teams).map(([t, l]) => `  ${t}: { lead: ${l} }\n`).join("") +
    `links:\n  jira: https://jira.example.com/browse/${jira}\n  confluence: https://confluence.example.com/display/SHOP\n  figma: https://www.figma.com/file/EXAMPLE\n  staging: https://admin.staging.example.com\n` +
    `estimate:\n  days: ${days}\n` +
    extra
  );
}

/** The usual document owners, for git authors of files on main. */
function owners(slug: string, files: Files, authors: Record<string, string>) {
  const by: Record<string, string> = {
    "spec.md": "olena.k", ".size": "olena.k", ".route": "olena.k", "CONTEXT.md": "olena.k",
    "ux-flows.md": "daria.l", "screens.md": "daria.l", "test-plan.md": "iryna.s",
    "sad.md": "taras.m", "data-model.md": "taras.m", "contracts/openapi.yaml": "taras.m",
    "hub/feature.yaml": "maksym.d", "hub/release.yaml": "bohdan.r",
  };
  for (const path of Object.keys(files)) {
    const rel = path.slice(dir(slug).length + 1);
    if (path.startsWith(dir(slug) + "/") && by[rel]) authors[`main/${path}`] = by[rel]!;
    if (path.startsWith(`${dir(slug)}/hub/bugs/`)) authors[`main/${path}`] = "iryna.s";
  }
}

const prefixed = (slug: string, files: Files): Files => Object.fromEntries(Object.entries(files).map(([p, t]) => [`${dir(slug)}/${p}`, t]));

function spec(slug: string, size: string, context: string, stories: string[], criteria: string[], questions: string[] = [], extra = ""): string {
  return (
    `---\nstatus: ${questions.some((q) => q.startsWith("[ ]")) ? "Draft" : "Approved"}\nowner: "olena.k"\nupdated_at: "2026-09-18"\nfeature_size: "${size}"\n---\n\n` +
    `# Spec — ${slug}\n\n## 1. Context\n\n${context}\n\n## 4. User stories\n\n` +
    stories.map((s, i) => `- **US-0${i + 1}** ${s}`).join("\n") +
    `\n\n## 5. Acceptance criteria\n\n` +
    criteria.map((c, i) => `- **AC-0${i + 1}** ${c}`).join("\n") +
    `\n\n## 8. Open questions\n\n` +
    (questions.length ? questions.map((q) => `- ${q}`).join("\n") : "None.") +
    "\n" +
    extra
  );
}

// --- tasks-issues: the prototype's main sample feature

const TI_SPEC = spec(
  "tasks-issues",
  "M",
  "Staff in the Marketplace admin agree on follow-ups about an order in chat, and the work gets lost. Tasks attached to orders give each follow-up an owner and a due date.",
  [
    "A staff member creates a task from an order and assigns it to a colleague.",
    "The assignee sees all their tasks in one list.",
    "The author sees on the order when the task is done.",
  ],
  [
    "A task is created from an order page and stays linked to that order.",
    "A task has one assignee, a due date and a status.",
    "The assignee gets one notification per assignment.",
    "Only staff with access to the order see its tasks.",
    "The order page shows a counter of its open tasks.",
  ],
  ["[x] Can a task have several assignees? No: one, per AC-02."],
);

const TI_DOCS: Files = {
  "spec.md": TI_SPEC,
  ".size": "M\n",
  ".route": "standard\n",
  "ux-flows.md": "# UX flows — tasks-issues\n\n## Screens\n\n- SCR-01 Order page: tasks block\n- SCR-02 Task form\n- SCR-03 My tasks\n\n## Flow for US-01\n\n```mermaid\nflowchart LR\n  A[SCR-01 order page] --> B[SCR-02 task form]\n  B -->|saved| C[the task shows on the order]\n  B -->|assignee has no access to the order| E[error in the form]\n```\n\nCovers AC-01 and AC-04.\n",
  "screens.md": "# Screens — tasks-issues\n\n| Screen | State | Components | Criteria |\n|---|---|---|---|\n| SCR-02 Task form | default | TextField, Select, DatePicker from the design system | AC-02 |\n| SCR-02 Task form | validation | empty title, due date in the past (422) | AC-02 |\n| SCR-02 Task form | loading | button busy | — |\n| SCR-02 Task form | success | the task shows in the order's block, counter +1 | AC-05 |\n| SCR-02 Task form | error | assignee has no access to the order (403), InlineBanner | AC-04 |\n",
  "test-plan.md": "# Test plan — tasks-issues\n\n| AC | Level | Platforms | Test |\n|---|---|---|---|\n| AC-01 | e2e | web, android, ios | order page → create task → it shows in the block |\n| AC-02 | e2e | web, android, ios | assignee, due date and status all change |\n| AC-03 | integration | backend | reassigning twice gives one notification each |\n| AC-04 | integration | backend | no access to the order gives 403 and no listing |\n| AC-05 | e2e | web, android, ios | the counter goes down after closing a task |\n",
  "sad.md": "---\nstatus: Accepted\nfeature_size: \"M\"\ntarget_surfaces: [backend-service, web-frontend, mobile-app]\n---\n\n# SAD — tasks-issues\n\nTasks live in the orders module as a new aggregate, `StaffTask`. Notifications go through the existing outbox. The ADRs are in the backend repository.\n",
  "data-model.md": "# Data model — tasks-issues\n\n`staff_tasks`: id, order_id, assignee_id, due_date, status, created_by, created_at. Index on (assignee_id, status) and on (order_id). Rollback drops the table.\n",
  "contracts/openapi.yaml": "openapi: 3.1.0\ninfo: { title: Tasks, version: 1.0.0 }\npaths:\n  /admin/tasks:\n    post: { summary: Create a task (AC-01, AC-02, AC-04), responses: { '201': { description: Created }, '403': { description: No access to the order }, '422': { description: Invalid } } }\n    get: { summary: My tasks (AC-04), parameters: [{ name: assignee, in: query, schema: { type: string } }], responses: { '200': { description: OK } } }\n  /admin/tasks/{id}:\n    patch: { summary: Change a task (AC-02), responses: { '200': { description: OK }, '403': { description: No access }, '409': { description: Changed meanwhile } } }\n  /admin/orders/{id}/tasks:\n    get: { summary: Tasks of an order (AC-04), responses: { '200': { description: OK } } }\n",
  "hub/bugs/BUG-0012.md": "---\nid: BUG-0012\ntitle: Task visible after access to the order was revoked\nac: AC-04\nplatforms: [web, android, ios]\nteam: backend\nseverity: high\nstatus: retest\nfound_by: iryna.s\nfound_in: verify\n---\nOpen an order as a staff member whose access to it was revoked.\n\nExpected: the tasks block is hidden. Actual: the task is listed, on all three clients.\n",
  "hub/bugs/BUG-0014.md": "---\nid: BUG-0014\ntitle: Task form has no state for a 403 response\nac: AC-04\nplatforms: [web]\nteam: web\nseverity: medium\nstatus: fixing\nfound_by: iryna.s\nfound_in: verify\n---\nAssign a task to a colleague without access to the order. Expected: an inline error. Actual: a blank form.\n",
  "hub/bugs/BUG-0013.md": "---\nid: BUG-0013\ntitle: Due date picker opens one day early on iOS\nac: AC-02\nplatforms: [ios]\nteam: ios\nseverity: low\nstatus: closed\nfound_by: iryna.s\nfound_in: verify\n---\nFixed in build 2.31.0 (513).\n",
  // QA's verdicts: cycle 1 found BUG-0012 (AC-04 on every client) and BUG-0013 (AC-02 on iOS, fixed and passed since).
  "hub/verification.yaml":
    "verdicts:\n" +
    ["AC-01", "AC-02", "AC-03", "AC-05"].flatMap((ac) => ["web", "android", "ios"].map((p) => `  - { ac: ${ac}, platform: ${p}, verdict: pass, user: iryna.s, at: 2026-10-03T15:00:00Z }\n`)).join("") +
    "  - { ac: AC-02, platform: ios, verdict: fail, bugs: [BUG-0013], user: iryna.s, at: 2026-10-03T15:10:00Z }\n" +
    ["web", "android", "ios"].map((p) => `  - { ac: AC-04, platform: ${p}, verdict: fail, bugs: [BUG-0012], user: iryna.s, at: 2026-10-03T15:20:00Z }\n`).join("") +
    "  - { ac: AC-02, platform: ios, verdict: pass, user: iryna.s, at: 2026-10-06T11:00:00Z }\n",
};

const TI_TASKS: Record<string, TaskSpec[]> = {
  backend: [
    { id: "T1", title: "staff_tasks migration", layer: "migration", acs: ["AC-01"] },
    { id: "T2", title: "POST and PATCH tasks", layer: "app", deps: ["T1"], acs: ["AC-01", "AC-02"] },
    { id: "T3", title: "notify on assignment", layer: "app", deps: ["T2"], acs: ["AC-03"] },
  ],
  ...Object.fromEntries(
    ["web", "android", "ios"].map((t) => [
      t,
      [
        { id: "T1", title: "ui: task block and form on the mock", layer: "ui", acs: ["AC-01", "AC-02"] },
        { id: "T2", title: "ui: My tasks on the mock", layer: "ui", acs: ["AC-04"] },
        { id: "T3", title: "switch to the staging API", layer: "wiring", deps: ["T1", "T2"], acs: [] },
      ],
    ]),
  ),
};

const BULK_SPEC = spec(
  "bulk-order-export",
  "M",
  "Support and finance export orders one page at a time and paste them into spreadsheets. A bulk export of the current filter saves hours a week.",
  ["A staff member exports the orders of the current filter as a CSV file.", "A staff member downloads the file later from a link."],
  [
    "An export starts from the orders list with the current filter.",
    "The staff member sees the progress of the export.",
    "The CSV has one row per order, with the columns of the list.",
    "The download link works for 24 hours.",
  ],
);

const BULK_TASKS: Record<string, TaskSpec[]> = {
  backend: [
    { id: "T1", title: "export_jobs migration", layer: "migration", acs: ["AC-01"] },
    { id: "T2", title: "POST /admin/exports and job status", layer: "app", deps: ["T1"], acs: ["AC-01", "AC-02"] },
    { id: "T3", title: "CSV builder in the worker", layer: "app", deps: ["T2"], acs: ["AC-03"] },
    { id: "T4", title: "download link with expiry", layer: "app", deps: ["T3"], acs: ["AC-04"] },
  ],
  web: [
    { id: "T1", title: "ui: export dialog on the mock", layer: "ui", acs: ["AC-01"] },
    { id: "T2", title: "ui: progress and download on the mock", layer: "ui", deps: ["T1"], acs: ["AC-02", "AC-04"] },
    { id: "T3", title: "switch to the staging API", layer: "wiring", deps: ["T2"], acs: [] },
  ],
  android: [
    { id: "T1", title: "ui: export sheet on the mock", layer: "ui", acs: ["AC-01"] },
    { id: "T2", title: "ui: progress and share on the mock", layer: "ui", deps: ["T1"], acs: ["AC-02", "AC-04"] },
    { id: "T3", title: "switch to the staging API", layer: "wiring", deps: ["T2"], acs: [] },
  ],
  ios: [
    { id: "T1", title: "ui: export sheet on the mock", layer: "ui", acs: ["AC-01"] },
    { id: "T2", title: "ui: progress and share on the mock", layer: "ui", deps: ["T1"], acs: ["AC-02", "AC-04"] },
    { id: "T3", title: "switch to the staging API", layer: "wiring", deps: ["T2"], acs: [] },
  ],
};

/** A tracker table in the SDD 2.3 template, from tasks and their states. */
function trackerMd(slug: string, tasks: TaskSpec[], rows: Record<string, [status: string, blockedBy?: string]>, owner: string): string {
  return (
    `# Tracker — ${slug}\n\n| # | Task | Layer | Owner | Estimate | Blocked by | Status |\n|---|---|---|---|---|---|---|\n` +
    tasks
      .map((t) => {
        const x = typeof t === "string" ? { id: t, title: t, layer: "app" } : t;
        const [status, blocked] = rows[x.id] ?? ["todo"];
        return `| ${x.id} | ${x.title} | ${x.layer ?? "app"} | ${owner} | S | ${blocked ?? "—"} | ${status} |`;
      })
      .join("\n") +
    "\n"
  );
}

/** Team snapshots of a feature that every team has built, reviewed and shipped. */
function shippedSnapshots(slug: string, leads: Record<string, string>, contract: string | null, tasks: Record<string, TaskSpec[]>): Files {
  const out: Files = {};
  for (const [team, lead] of Object.entries(leads)) {
    const list = tasks[team] ?? [];
    const parts: SnapshotParts = {
      files: [...(team === contract ? ["sad.md", "adr/0001-tasks-in-orders.md", "_sequences-log.md", "data-model.md", "contracts/openapi.yaml"] : []), "tasks.json", "tasks/tracker.md", "_review/review-2026-10-01.md"],
      tasks: list,
      tracker: list.map((t) => ({ id: typeof t === "string" ? t : t.id, status: "done" })),
      review: "PASS",
      mr: { iid: 200 + Object.keys(out).length, state: "opened", author: lead },
    };
    Object.assign(out, snapshot(slug, team, parts));
  }
  return out;
}

const THROUGH_SHIP = ["clarify", "epic", "ux-flows", "tech-design", "data-model", "api", "screens", "tasks", "sprint", "plan-tests", "review", "ship"];

export function demoFixture(): Fixture {
  const main: Files = base();
  const hubState: Files = {};
  const teams: Record<string, Files> = { android: {} };
  const authors: Record<string, string> = {};

  // 1. tasks-issues: QA returned it at the final check; verify waits for the retest of BUG-0012. Cycle 2.
  {
    const slug = "tasks-issues";
    Object.assign(main, prefixed(slug, { ...TI_DOCS, "hub/feature.yaml": featureYaml("Tasks & issues in the Marketplace admin", "SHOP-412", LEADS4, 15, "  tokens_m: [52, 118]\n"), "hub/release.yaml": "staging: { smoke: passed, at: 2026-10-02T10:00:00Z }\nversions: { backend: v2.31.0, web: admin build 885, android: 2.31.0 (4131), ios: 2.31.0 (513) }\n" }));
    Object.assign(
      main,
      signoffs(
        slug,
        [
          ...sign(THROUGH_SHIP, LEADS4, "backend", "2026-09-10T09:00:00Z"),
          { step: "verify", user: "iryna.s", at: "2026-10-03T10:00:00Z" },
          { step: "qa-final", user: "iryna.s", at: "2026-10-05T10:00:00Z", decision: "return", reason: "BUG-0012 reproduces on all three clients", bugs: ["BUG-0012"], returns_to: "verify", cycle: 1 },
        ],
        main,
      ),
    );
    Object.assign(hubState, shippedSnapshots(slug, LEADS4, "backend", TI_TASKS));
    const runs: [string, string, number, number, string, string][] = [
      ["backend", "ci", 212, 0, "2026-10-04T09:35:00Z", "pipeline #8841"],
      ["web", "ci", 31, 0, "2026-10-04T09:00:00Z", "pipeline #5102"],
      ["android", "ci", 13, 1, "2026-10-04T08:50:00Z", "pipeline #4127"],
      ["android", "ci", 14, 0, "2026-10-04T11:20:00Z", "pipeline #4131"],
      ["ios", "ci", 14, 0, "2026-10-04T08:00:00Z", "pipeline #3990"],
      ["android", "local", 14, 0, "2026-10-04T10:40:00Z", "local run by andrii.p"],
    ];
    runs.forEach(([team, source, passed, failed, at, ref], i) => {
      hubState[`features/${slug}/tests/run-${i + 1}.json`] = testRun(team, source as "ci" | "local", failed, at, passed, ref);
    });
    owners(slug, main, authors);
  }

  // 2. bulk-order-export: implement is running; Web, Android and iOS wait for backend T2.
  {
    const slug = "bulk-order-export";
    const docs: Files = {
      "spec.md": BULK_SPEC,
      ".size": "M\n",
      ".route": "standard\n",
      "ux-flows.md": "# UX flows — bulk-order-export\n\n- SCR-01 Orders list: Export button\n- SCR-02 Export dialog with progress\n- SCR-03 Exports: the download links\n\nUS-01 → SCR-01 → SCR-02 → the file is ready (AC-01, AC-02).\n",
      "screens.md": "# Screens — bulk-order-export\n\n| Screen | State | Criteria |\n|---|---|---|\n| SCR-02 Export dialog | running, with progress | AC-02 |\n| SCR-02 Export dialog | done, with the link | AC-04 |\n| SCR-03 Exports | link expired | AC-04 |\n",
      "test-plan.md": "# Test plan — bulk-order-export\n\n| AC | Level | Platforms | Test |\n|---|---|---|---|\n| AC-01 | e2e | web, android, ios | export the current filter |\n| AC-02 | e2e | web, android, ios | the progress reaches 100% |\n| AC-03 | integration | backend | 10 000 orders give 10 000 rows |\n| AC-04 | integration | backend | the link answers 410 after 24 hours |\n",
      "sad.md": "---\nstatus: Accepted\nfeature_size: \"M\"\ntarget_surfaces: [backend-service, worker, web-frontend, mobile-app]\n---\n\n# SAD — bulk-order-export\n\nExports run as jobs in the existing worker; files go to object storage with signed links.\n",
      "data-model.md": "# Data model — bulk-order-export\n\n`export_jobs`: id, requested_by, filter, status, progress, file_key, expires_at.\n",
      "contracts/openapi.yaml": "openapi: 3.1.0\ninfo: { title: Exports, version: 1.0.0 }\npaths:\n  /admin/exports:\n    post: { summary: Start an export of the current filter (AC-01), responses: { '202': { description: Accepted } } }\n  /admin/exports/{id}:\n    get: { summary: Job status and link (AC-02, AC-04), responses: { '200': { description: OK }, '410': { description: Link expired } } }\n",
      "hub/feature.yaml": featureYaml("Bulk order export", "SHOP-431", LEADS4, 12),
    };
    Object.assign(main, prefixed(slug, docs));
    Object.assign(main, signoffs(slug, sign(["clarify", "epic", "ux-flows", "tech-design", "data-model", "api", "screens", "tasks", "sprint", "plan-tests"], LEADS4, "backend", "2026-09-20T09:00:00Z"), main));
    Object.assign(
      hubState,
      snapshot(slug, "backend", {
        files: ["sad.md", "adr/0001-export-jobs-in-the-worker.md", "_sequences-log.md", "data-model.md", "contracts/openapi.yaml", "tasks.json", "tasks/tracker.md"],
        tasks: BULK_TASKS.backend,
        tracker: [{ id: "T1", status: "done" }, { id: "T2", status: "in_progress", blocked_by: ["T1"] }, { id: "T3", status: "todo", blocked_by: ["T2"] }, { id: "T4", status: "todo", blocked_by: ["T3"] }],
      }),
      snapshot(slug, "web", {
        files: ["tasks.json", "tasks/tracker.md"],
        tasks: BULK_TASKS.web,
        tracker: [{ id: "T1", status: "done" }, { id: "T2", status: "in_progress", blocked_by: ["T1"] }, { id: "T3", status: "blocked", blocked_by: ["T2", "backend:T2"] }],
      }),
      snapshot(slug, "ios", {
        files: ["tasks.json", "tasks/tracker.md"],
        tasks: BULK_TASKS.ios,
        tracker: [{ id: "T1", status: "in_progress" }, { id: "T2", status: "todo", blocked_by: ["T1"] }, { id: "T3", status: "blocked", blocked_by: ["T2", "backend:T2"] }],
      }),
    );
    // Android has not published a snapshot yet: the site reads the lead's local clone.
    teams.android![`${dir(slug)}/tasks.json`] = JSON.stringify({ slug, tasks: BULK_TASKS.android!.map((t) => (typeof t === "string" ? t : { ...t, deps: t.deps ?? [], acs: t.acs ?? [] })) });
    teams.android![`${dir(slug)}/tasks/tracker.md`] = trackerMd(slug, BULK_TASKS.android!, { T1: ["done"], T2: ["todo", "T1"], T3: ["blocked", "T2, backend:T2"] }, "andrii.p");
    owners(slug, main, authors);
  }

  // 3. returns-portal: the spec is written; clarify waits for the PO.
  {
    const slug = "returns-portal";
    const s = spec(
      slug,
      "L",
      "Customers ask support by e-mail to return items, and each return takes a staff member about 20 minutes. A self-service portal lets customers start a return and get a label.",
      ["A customer starts a return from the order page.", "A customer follows the return until the refund.", "Staff see every return and its state in the admin."],
      [
        "A customer can return items within 14 days of delivery.",
        "The customer chooses a reason for each item.",
        "The customer gets a return label by e-mail.",
        "Staff see the return in the admin within a minute.",
        "The refund is issued when the warehouse confirms the items.",
      ],
      ["[ ] Who pays for return shipping when the reason is a change of mind?", "[ ] Do marketplace sellers handle their own returns?"],
    );
    Object.assign(main, prefixed(slug, { "spec.md": s, ".size": "L\n", ".route": "full\n", "hub/feature.yaml": "title: Returns portal for customers\nowner: olena.k\nlinks:\n  jira: https://jira.example.com/browse/SHOP-440\nestimate:\n  days: 30\n" }));
    owners(slug, main, authors);
  }

  // 4. order-notes-fix: XS on the quick route, web only; review is running.
  {
    const slug = "order-notes-fix";
    const leads = { web: "petro.v" };
    const s =
      "# Spec — order-notes-fix\n\n## 1. Context\n\nStaff write delivery instructions in order notes on several lines. The admin joins them into one line, and the courier misses them.\n\n## 5. Acceptance criteria\n\n- **AC-01** Line breaks in an order note survive a save and show in the order page.\n\n## Test plan\n\n| AC | Level | Test |\n|---|---|---|\n| AC-01 | unit | a note with two lines is saved and rendered with two lines |\n";
    Object.assign(main, prefixed(slug, { "spec.md": s, ".size": "XS\n", ".route": "quick\n", "hub/feature.yaml": featureYaml("Order notes lose line breaks", "SHOP-438", leads, 2) }));
    Object.assign(main, signoffs(slug, sign(["epic", "tech-design", "tasks", "sprint", "plan-tests"], leads, null, "2026-10-01T09:00:00Z"), main));
    Object.assign(
      hubState,
      snapshot(slug, "web", {
        files: ["sad.md", "adr/0001-keep-line-breaks.md", "_sequences-log.md", "tasks.json", "tasks/tracker.md"],
        tasks: [{ id: "T1", title: "keep line breaks when saving and rendering a note", layer: "ui", acs: ["AC-01"] }],
        tracker: [{ id: "T1", status: "done" }],
      }),
    );
    hubState[`features/${slug}/events.jsonl`] = [
      '{"step":"implement","event":"started","role":"dev","assistant":"cursor","at":"2026-10-02T09:00:00Z"}',
      '{"step":"implement","event":"finished","role":"dev","assistant":"cursor","at":"2026-10-03T15:00:00Z"}',
      '{"step":"review","event":"started","role":"dev","assistant":"cursor","at":"2026-10-07T08:30:00Z"}',
    ].join("\n") + "\n";
    for (const n of [1, 2, 3]) authors[`hub-state/features/${slug}/events.jsonl#L${n}`] = "petro.v";
    owners(slug, main, authors);
  }

  // 5. staff-permissions: released, the watch period is over.
  {
    const slug = "staff-permissions";
    const leads = { backend: "taras.m", web: "petro.v" };
    const s = spec(
      slug,
      "M",
      "Every staff member sees every section of the admin. Admins need to give support staff the orders and returns only.",
      ["An admin gives a staff member access to some sections only.", "A staff member sees only the sections they have access to."],
      ["An admin assigns a role with a set of sections to each staff member.", "A section without access is hidden from the menu.", "A direct link to a section without access shows a 403 page."],
    );
    const tasks: Record<string, TaskSpec[]> = {
      backend: [{ id: "T1", title: "roles and sections tables", layer: "migration", acs: ["AC-01"] }, { id: "T2", title: "check the section on every admin request", layer: "app", deps: ["T1"], acs: ["AC-03"] }],
      web: [{ id: "T1", title: "ui: roles editor", layer: "ui", acs: ["AC-01"] }, { id: "T2", title: "hide sections from the menu", layer: "ui", deps: ["T1", "backend:T2"], acs: ["AC-02"] }],
    };
    Object.assign(
      main,
      prefixed(slug, {
        "spec.md": s,
        ".size": "M\n",
        ".route": "standard\n",
        "ux-flows.md": "# UX flows — staff-permissions\n\n- SCR-01 Staff: roles editor\n- SCR-02 403 page\n",
        "screens.md": "# Screens — staff-permissions\n\n| Screen | State | Criteria |\n|---|---|---|\n| SCR-01 Roles editor | default | AC-01 |\n| SCR-02 403 page | default | AC-03 |\n",
        "test-plan.md": "# Test plan — staff-permissions\n\n| AC | Level | Test |\n|---|---|---|\n| AC-01 | e2e | assign a role and sign in as that staff member |\n| AC-02 | e2e | the menu shows the role's sections only |\n| AC-03 | integration | a request to a section without access gives 403 |\n",
        "sad.md": "---\nstatus: Accepted\nfeature_size: \"M\"\ntarget_surfaces: [backend-service, web-frontend]\n---\n\n# SAD — staff-permissions\n\nA middleware checks the section of every admin request against the staff member's role.\n",
        "data-model.md": "# Data model — staff-permissions\n\n`staff_roles` and `staff_role_sections`.\n",
        "contracts/openapi.yaml": "openapi: 3.1.0\ninfo: { title: Staff roles, version: 1.0.0 }\npaths:\n  /admin/staff/{id}/role:\n    put: { summary: Assign a role (AC-01), responses: { '200': { description: OK } } }\n",
        "hub/feature.yaml": featureYaml("Staff permissions", "SHOP-398", leads, 14),
        "hub/release.yaml": "staging: { smoke: passed }\ngo: { value: go, user: maksym.d, at: 2026-09-05T09:00:00Z }\nversions: { backend: v2.29.0, web: admin build 861 }\nrollout: { stage: 100, at: 2026-09-05T15:00:00Z }\nwatch: { started: 2026-09-05, days: 7 }\n",
      }),
    );
    Object.assign(main, signoffs(slug, sign([...THROUGH_SHIP, "verify", "qa-final", "accept"], leads, "backend", "2026-08-10T09:00:00Z"), main));
    Object.assign(hubState, shippedSnapshots(slug, leads, "backend", tasks));
    hubState[`features/${slug}/tests/run-1.json`] = testRun("backend", "ci", 0, "2026-09-01T10:00:00Z", 188, "pipeline #8512");
    hubState[`features/${slug}/tests/run-2.json`] = testRun("web", "ci", 0, "2026-09-01T10:30:00Z", 27, "pipeline #4870");
    owners(slug, main, authors);
  }

  // 6. order-webhooks: backend only, no user interface; tech-design waits for the backend lead.
  {
    const slug = "order-webhooks";
    const leads = { backend: "taras.m" };
    const s = spec(
      slug,
      "S",
      "Partner warehouses poll the orders API every minute to see status changes. Webhooks tell them at once and cut the load.",
      ["A partner system learns about an order status change without polling."],
      ["A partner system gets a webhook within a minute of an order status change.", "A failed delivery is retried for 24 hours.", "Each webhook is signed so the partner can check it came from us."],
    );
    Object.assign(main, prefixed(slug, { "spec.md": s, ".size": "S\n", ".route": "standard\n", "hub/feature.yaml": featureYaml("Webhooks for order status", "SHOP-445", leads, 5, "ui: false\n") }));
    Object.assign(main, signoffs(slug, sign(["clarify", "epic"], leads, "backend", "2026-10-03T09:00:00Z"), main));
    Object.assign(hubState, snapshot(slug, "backend", { files: ["sad.md", "adr/0001-outbox-for-webhooks.md", "_sequences-log.md"] }));
    owners(slug, main, authors);
  }

  const DONE = "done" as const;
  const throughShip = Object.fromEntries(["specify", ...THROUGH_SHIP, "implement"].map((s) => [s, DONE]));
  return {
    description: "The demo project: six features at different steps, four teams, every role, with the prototype's sample data.",
    now: NOW,
    main,
    hubState,
    teams,
    authors,
    features: ["bulk-order-export", "order-notes-fix", "order-webhooks", "returns-portal", "staff-permissions", "tasks-issues"],
    expected: {
      "tasks-issues": {
        current: "verify",
        steps: { ...throughShip, staging: DONE, verify: "returned", autotests: DONE },
        cycle: 2,
        blockingBugs: ["BUG-0012"],
        reasons: { verify: /BUG-0012/ },
      },
      "bulk-order-export": {
        current: "implement",
        steps: { ...Object.fromEntries(["specify", "clarify", "epic", "ux-flows", "tech-design", "data-model", "api", "screens", "tasks", "sprint", "plan-tests"].map((s) => [s, DONE])), implement: "running" },
        teamSources: { backend: "hub-state", web: "hub-state", android: "local-clone", ios: "hub-state" },
      },
      "returns-portal": { current: "clarify", steps: { specify: DONE, clarify: "ready" }, waitingOn: { clarify: ["olena.k"] } },
      "order-notes-fix": {
        current: "review",
        steps: { specify: DONE, clarify: "skipped", epic: DONE, "ux-flows": "skipped", "tech-design": DONE, "data-model": "skipped", api: "skipped", screens: "skipped", tasks: DONE, sprint: DONE, "plan-tests": DONE, implement: DONE, review: "running" },
        by: { review: "petro.v" },
      },
      "staff-permissions": {
        current: "released",
        steps: { ...throughShip, staging: DONE, verify: DONE, autotests: DONE, "qa-final": DONE, accept: DONE, release: DONE },
      },
      "order-webhooks": {
        current: "tech-design",
        steps: { specify: DONE, clarify: DONE, epic: DONE, "ux-flows": "skipped", "tech-design": "signoff", screens: "skipped" },
        waitingOn: { "tech-design": ["taras.m"] },
      },
    },
  };
}
