// The demo project: the prototype's five features, at the same stages, plus one feature with no user interface.
// Synthetic like every fixture; it exists so the site can be clicked through for every role.

import { base, dir, type Entry, type Files, type Fixture, signoffs, snapshot, type SnapshotParts, testRun } from "./build.ts";

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

function featureYaml(title: string, teams: Record<string, string>, extra = ""): string {
  return (
    `title: ${title}\nowner: olena.k\nteams:\n` +
    Object.entries(teams).map(([t, l]) => `  ${t}: { lead: ${l} }\n`).join("") +
    `links:\n  jira: https://jira.example.com/browse/SHOP-412\n  confluence: https://confluence.example.com/display/SHOP\n  figma: https://www.figma.com/file/EXAMPLE\n  staging: https://admin.staging.example.com\n` +
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
  }
}

// --- documents of tasks-issues, from the prototype

const TI_SPEC = `---
status: Approved
owner: "olena.k"
updated_at: "2026-09-18"
feature_size: "M"
---

# Spec — tasks-issues

## 1. Context

Staff in the Marketplace admin agree on follow-ups about an order in chat, and the work gets lost. Tasks attached to orders give each follow-up an owner and a due date.

## 4. User stories

- **US-01** A staff member creates a task from an order and assigns it to a colleague.
- **US-02** The assignee sees all their tasks in one list.
- **US-03** The author sees on the order when the task is done.

## 5. Acceptance criteria

- **AC-01** A task is created from an order page and stays linked to that order.
- **AC-02** A task has one assignee, a due date and a status.
- **AC-03** The assignee gets one notification per assignment.
- **AC-04** Only staff with access to the order see its tasks.
- **AC-05** The order page shows a counter of its open tasks.

## 8. Open questions

- [x] Can a task have several assignees? No: one, per AC-02.
`;

const TI_DOCS: Files = {
  "spec.md": TI_SPEC,
  ".size": "M\n",
  ".route": "standard\n",
  "ux-flows.md": "# UX flows — tasks-issues\n\n## Screens\n\n- SCR-01 Order page: tasks block\n- SCR-02 Task form\n- SCR-03 My tasks\n\n## Flow for US-01\n\n```mermaid\nflowchart LR\n  A[SCR-01 order page] --> B[SCR-02 task form]\n  B -->|saved| C[task shows on the order]\n  B -->|no access to the order| E[error in the form]\n```\n\nCovers AC-01 and AC-04.\n",
  "screens.md": "# Screens — tasks-issues\n\n| Screen | State | Components | Criteria |\n|---|---|---|---|\n| SCR-02 | default | TextField, Select, DatePicker | AC-02 |\n| SCR-02 | loading | button busy | — |\n| SCR-02 | success | the task shows in the order's block, counter +1 | AC-05 |\n| SCR-02 | error | InlineBanner for 403 | AC-04 |\n",
  "test-plan.md": "# Test plan — tasks-issues\n\n| AC | Level | Platforms | Test |\n|---|---|---|---|\n| AC-01 | e2e | web, android, ios | order page, create task, it shows in the block |\n| AC-02 | e2e | web, android, ios | assignee, due date and status all change |\n| AC-03 | integration | backend | reassigning twice gives one notification each |\n| AC-04 | integration | backend | no access to the order gives 403 and no listing |\n| AC-05 | e2e | web, android, ios | the counter goes down after closing a task |\n",
  "sad.md": "---\nstatus: Accepted\nfeature_size: \"M\"\ntarget_surfaces: [backend-service, web-frontend, mobile-app]\n---\n\n# SAD — tasks-issues\n\nTasks live in the orders module as a new aggregate. See the ADRs in the backend repository.\n",
  "data-model.md": "# Data model — tasks-issues\n\n`staff_tasks`: id, order_id, assignee_id, due_date, status, created_by. Index on (assignee_id, status).\n",
  "contracts/openapi.yaml": "openapi: 3.1.0\ninfo: { title: Tasks, version: 1.0.0 }\npaths:\n  /admin/tasks:\n    post: { summary: Create a task (AC-01, AC-02, AC-04), responses: { '201': { description: Created }, '403': { description: No access }, '422': { description: Invalid } } }\n  /admin/tasks/{id}:\n    patch: { summary: Change a task (AC-02), responses: { '200': { description: OK }, '403': { description: No access } } }\n",
};

const BUGS: Files = {
  "hub/bugs/BUG-0012.md": "---\nid: BUG-0012\ntitle: Task visible after access to the order was revoked\nac: AC-04\nplatforms: [web, android, ios]\nteam: backend\nseverity: high\nstatus: retest\nfound_by: iryna.s\nfound_in: verify\n---\nOpen an order as staff whose access was revoked. Expected: the tasks block is hidden. Actual: the task is listed.\n",
  "hub/bugs/BUG-0014.md": "---\nid: BUG-0014\ntitle: Task form has no state for a 403 response\nac: AC-04\nplatforms: [web]\nteam: web\nseverity: medium\nstatus: fixing\nfound_by: iryna.s\nfound_in: verify\n---\nThe form shows a blank page on 403.\n",
  "hub/bugs/BUG-0013.md": "---\nid: BUG-0013\ntitle: Due date picker opens one day early on iOS\nac: AC-02\nplatforms: [ios]\nteam: ios\nseverity: low\nstatus: closed\nfound_by: iryna.s\nfound_in: verify\n---\nFixed in build 513.\n",
};

const prefixed = (slug: string, files: Files): Files => Object.fromEntries(Object.entries(files).map(([p, t]) => [`${dir(slug)}/${p}`, t]));

/** Team snapshots of a feature that every team has built, reviewed and shipped. */
function shippedSnapshots(slug: string, leads: Record<string, string>, contract: string | null, tasks: number): Files {
  const out: Files = {};
  for (const [team, lead] of Object.entries(leads)) {
    const ids = Array.from({ length: tasks }, (_, i) => `T${i + 1}`);
    const parts: SnapshotParts = {
      files: [...(team === contract ? ["sad.md", "adr/0001-tasks-in-orders.md", "data-model.md", "contracts/openapi.yaml"] : []), "tasks.json", "tasks/tracker.md", "_review/review-2026-10-01.md"],
      tasks: ids,
      tracker: ids.map((id) => ({ id, status: "done" })),
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

  // 1. tasks-issues: QA returned it at the final check; verify waits for the retest. Cycle 2.
  {
    const slug = "tasks-issues";
    Object.assign(main, prefixed(slug, { ...TI_DOCS, ...BUGS, "hub/feature.yaml": featureYaml("Tasks & issues in the Marketplace admin", LEADS4, "estimate:\n  days: 15\n  tokens_m: [52, 118]\n"), "hub/release.yaml": "staging: { smoke: passed, at: 2026-10-02T10:00:00Z }\n" }));
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
    Object.assign(hubState, shippedSnapshots(slug, LEADS4, "backend", 3));
    for (const t of Object.keys(LEADS4)) hubState[`features/${slug}/tests/ci-${t}.json`] = testRun(t, "ci", 0, "2026-10-04T10:00:00Z");
    hubState[`features/${slug}/tests/local-android.json`] = testRun("android", "local", 0, "2026-10-04T12:00:00Z");
    owners(slug, main, authors);
  }

  // 2. bulk-order-export: implement is running; three client teams wait for backend T2.
  {
    const slug = "bulk-order-export";
    const docs = { ...TI_DOCS, "spec.md": TI_SPEC.replace(/tasks-issues/g, slug), "hub/feature.yaml": featureYaml("Bulk order export", LEADS4, "estimate:\n  days: 12\n") };
    Object.assign(main, prefixed(slug, docs));
    Object.assign(main, signoffs(slug, sign(["clarify", "epic", "ux-flows", "tech-design", "data-model", "api", "screens", "tasks", "sprint", "plan-tests"], LEADS4, "backend", "2026-09-20T09:00:00Z"), main));
    Object.assign(
      hubState,
      snapshot(slug, "backend", {
        files: ["sad.md", "adr/0001-export-jobs.md", "data-model.md", "contracts/openapi.yaml", "tasks.json", "tasks/tracker.md"],
        tasks: ["T1", "T2", "T3", "T4"],
        tracker: [{ id: "T1", status: "done" }, { id: "T2", status: "in_progress" }, { id: "T3", status: "todo", blocked_by: ["T2"] }, { id: "T4", status: "todo", blocked_by: ["T3"] }],
      }),
      snapshot(slug, "web", {
        files: ["tasks.json", "tasks/tracker.md"],
        tasks: ["T1", "T2", "T3"],
        tracker: [{ id: "T1", status: "done" }, { id: "T2", status: "in_progress", blocked_by: ["T1"] }, { id: "T3", status: "blocked", blocked_by: ["T2", "backend:T2"] }],
      }),
      snapshot(slug, "ios", {
        files: ["tasks.json", "tasks/tracker.md"],
        tasks: ["T1", "T2", "T3"],
        tracker: [{ id: "T1", status: "in_progress" }, { id: "T2", status: "todo", blocked_by: ["T1"] }, { id: "T3", status: "blocked", blocked_by: ["T2", "backend:T2"] }],
      }),
    );
    // Android has not published a snapshot yet: the site reads the lead's local clone.
    teams.android![`${dir(slug)}/tasks.json`] = JSON.stringify({
      slug,
      tasks: [
        { id: "T1", title: "ui: export sheet on the mock", layer: "ui", deps: [], acs: ["AC-01"] },
        { id: "T2", title: "ui: progress and share on the mock", layer: "ui", deps: ["T1"], acs: ["AC-02"] },
        { id: "T3", title: "switch to the staging API", layer: "wiring", deps: ["T2"], acs: [] },
      ],
    });
    teams.android![`${dir(slug)}/tasks/tracker.md`] =
      "# Tracker — bulk-order-export\n\n| # | Task | Layer | Owner | Estimate | Blocked by | Status |\n|---|---|---|---|---|---|---|\n| T1 | ui: export sheet on the mock | ui | andrii.p | S | — | done |\n| T2 | ui: progress and share on the mock | ui | andrii.p | M | T1 | todo |\n| T3 | switch to the staging API | wiring | andrii.p | S | T2, backend:T2 | blocked |\n";
    owners(slug, main, authors);
  }

  // 3. returns-portal: the spec is written; clarify waits for the PO.
  {
    const slug = "returns-portal";
    Object.assign(main, prefixed(slug, { "spec.md": TI_SPEC.replace(/tasks-issues/g, slug).replace('feature_size: "M"', 'feature_size: "L"'), ".size": "L\n", ".route": "full\n", "hub/feature.yaml": "title: Returns portal for customers\nowner: olena.k\nlinks:\n  jira: https://jira.example.com/browse/SHOP-440\n" }));
    owners(slug, main, authors);
  }

  // 4. order-notes-fix: XS on the quick route, web only; review is running.
  {
    const slug = "order-notes-fix";
    const leads = { web: "petro.v" };
    Object.assign(main, prefixed(slug, { "spec.md": "# Spec — order-notes-fix\n\n## 5. Acceptance criteria\n\n- **AC-01** Line breaks in an order note survive a save.\n\n## Test plan\n\n| AC | Level | Test |\n|---|---|---|\n| AC-01 | unit | a note with two lines is saved with two lines |\n", ".size": "XS\n", ".route": "quick\n", "hub/feature.yaml": featureYaml("Order notes lose line breaks", leads) }));
    Object.assign(main, signoffs(slug, sign(["epic", "tech-design", "tasks", "sprint", "plan-tests"], leads, null, "2026-10-01T09:00:00Z"), main));
    Object.assign(hubState, snapshot(slug, "web", { files: ["sad.md", "adr/0001-keep-line-breaks.md", "tasks.json", "tasks/tracker.md"], tasks: ["T1"], tracker: [{ id: "T1", status: "done" }] }));
    hubState[`features/${slug}/events.jsonl`] = '{"step":"review","event":"started","role":"dev","assistant":"cursor","at":"2026-10-07T08:30:00Z"}\n';
    authors[`hub-state/features/${slug}/events.jsonl#L1`] = "petro.v";
    owners(slug, main, authors);
  }

  // 5. staff-permissions: released, the watch period is over.
  {
    const slug = "staff-permissions";
    const leads = { backend: "taras.m", web: "petro.v" };
    Object.assign(main, prefixed(slug, { ...TI_DOCS, "spec.md": TI_SPEC.replace(/tasks-issues/g, slug), "hub/feature.yaml": featureYaml("Staff permissions", leads), "hub/release.yaml": "staging: { smoke: passed }\ngo: { value: go, user: maksym.d, at: 2026-09-05T09:00:00Z }\nrollout: { stage: 100, at: 2026-09-05T15:00:00Z }\nwatch: { started: 2026-09-05, days: 7 }\n" }));
    Object.assign(main, signoffs(slug, sign([...THROUGH_SHIP, "verify", "qa-final", "accept"], leads, "backend", "2026-08-10T09:00:00Z"), main));
    Object.assign(hubState, shippedSnapshots(slug, leads, "backend", 2));
    for (const t of Object.keys(leads)) hubState[`features/${slug}/tests/ci-${t}.json`] = testRun(t, "ci", 0, "2026-09-01T10:00:00Z");
    owners(slug, main, authors);
  }

  // 6. order-webhooks: backend only, no user interface; tech-design waits for the backend lead.
  {
    const slug = "order-webhooks";
    const leads = { backend: "taras.m" };
    Object.assign(main, prefixed(slug, { "spec.md": "# Spec — order-webhooks\n\n## 5. Acceptance criteria\n\n- **AC-01** A partner system gets a webhook within a minute of an order status change.\n", ".size": "S\n", ".route": "standard\n", "hub/feature.yaml": featureYaml("Webhooks for order status", leads, "ui: false\n") }));
    Object.assign(main, signoffs(slug, sign(["clarify", "epic"], leads, "backend", "2026-10-03T09:00:00Z"), main));
    Object.assign(hubState, snapshot(slug, "backend", { files: ["sad.md", "adr/0001-outbox.md"] }));
    owners(slug, main, authors);
  }

  const DONE = "done" as const;
  const throughShip = Object.fromEntries(["specify", ...THROUGH_SHIP, "implement"].map((s) => [s, DONE]));
  return {
    description: "The demo project: six features at different steps, four teams, every role.",
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
