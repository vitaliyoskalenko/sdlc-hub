// The fixture repositories for step detection. Each one proves one rule of the specification.

import {
  base,
  dir,
  DONE_THROUGH_SHIP,
  featureYaml,
  type Fixture,
  INLINE_PLAN,
  releaseYaml,
  shippedWebFeature,
  signoffs,
  snapshot,
  SPEC,
  specFiles,
  tasksJson,
  teamFiles,
  testRun,
  tracker,
} from "./build.ts";

const NOW = "2026-10-07T12:00:00Z";
const fixtures: Record<string, Fixture> = {};

// --- the start of the flow

fixtures["empty-project"] = {
  description: "A valid .hub/ and no features: nothing to detect and no issues.",
  now: NOW,
  main: base(),
  features: [],
  expected: {},
};

fixtures["specify-running"] = {
  description: "A started event with no finish shows the step as running, named by the git author of the event.",
  now: NOW,
  main: { ...base(), ...featureYaml("bulk-import") },
  hubState: {
    "features/bulk-import/events.jsonl": '{"step":"specify","event":"started","role":"po","assistant":"claude","at":"2026-10-07T09:00:00Z"}\n',
  },
  authors: { "hub-state/features/bulk-import/events.jsonl#L1": "olena.k" },
  features: ["bulk-import"],
  expected: {
    "bulk-import": { current: "specify", steps: { specify: "running" }, by: { specify: "olena.k" }, warnings: [/No \.route/] },
  },
};

fixtures["clarify-signoff"] = {
  description: "spec.md exists and clarify is not signed: clarify is ready, waiting for the PO by name.",
  now: NOW,
  main: { ...base(), ...specFiles("returns-portal", "L", "full"), ...featureYaml("returns-portal") },
  authors: { "main/docs/features/returns-portal/spec.md": "olena.k" },
  expected: {
    "returns-portal": {
      current: "clarify",
      steps: { specify: "done", clarify: "ready" },
      by: { specify: "olena.k" },
      waitingOn: { clarify: ["olena.k"] },
      onlyWarnings: true,
      warnings: [],
    },
  },
};

{
  const slug = "tasks-issues";
  const main = {
    ...base(),
    ...specFiles(slug, "M", "standard"),
    ...featureYaml(slug, { backend: "taras.m", web: "petro.v", android: "andrii.p", ios: "sofiia.h" }),
    [`${dir(slug)}/ux-flows.md`]: "# UX flows\n",
  };
  Object.assign(
    main,
    signoffs(
      slug,
      [
        { step: "clarify", user: "olena.k", at: "2026-09-18T10:00:00Z" },
        { step: "epic", user: "maksym.d", at: "2026-09-19T10:00:00Z" },
        { step: "ux-flows", user: "olena.k", at: "2026-09-20T10:00:00Z" },
      ],
      main,
    ),
  );
  fixtures["backend-first"] = {
    description: "tech-design has evidence only in the contract team's local clone: running, read from the local copy.",
    now: NOW,
    main,
    teams: { backend: teamFiles(slug, { "sad.md": "# SAD\n" }) },
    expected: {
      [slug]: {
        current: "tech-design",
        steps: { specify: "done", clarify: "done", epic: "done", "ux-flows": "done", "tech-design": "running" },
        by: { clarify: "olena.k", epic: "maksym.d", "ux-flows": "olena.k" },
        sources: { "tech-design": "local-clone" },
        teamSources: { backend: "local-clone", web: "none", android: "none", ios: "none" },
      },
    },
  };
}

// --- routes: skipped or missed

{
  const slug = "order-notes-fix";
  const main = { ...base(), ...specFiles(slug, "XS", "quick", SPEC + INLINE_PLAN), ...featureYaml(slug, { web: "petro.v" }) };
  Object.assign(
    main,
    signoffs(
      slug,
      [
        { step: "epic", user: "maksym.d", at: "2026-10-01T09:00:00Z" },
        { step: "tech-design", user: "petro.v", at: "2026-10-01T12:00:00Z" },
        { step: "tasks", user: "petro.v", at: "2026-10-02T09:00:00Z" },
        { step: "sprint", user: "maksym.d", at: "2026-10-02T10:00:00Z" },
        { step: "plan-tests", user: "iryna.s", at: "2026-10-02T11:00:00Z" },
      ],
      main,
    ),
  );
  fixtures["quick-route"] = {
    description: "XS on the quick route: optional stages with later evidence are skipped, api is skipped with no contract team in the feature, and the inline test plan counts.",
    now: NOW,
    main,
    teams: {
      web: teamFiles(slug, {
        "sad.md": "# SAD\n",
        "adr/0001-keep-line-breaks.md": "# ADR\n",
        "tasks.json": tasksJson(slug, ["T1"]),
        "tasks/tracker.md": tracker([["T1", "done"]]),
        "_review/review-2026-10-06.md": "**Gate result:** CHANGES REQUESTED\n",
      }),
    },
    expected: {
      [slug]: {
        current: "review",
        steps: {
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
          review: "running",
        },
        by: { "tech-design": "petro.v", tasks: "petro.v", "plan-tests": "iryna.s" },
        reasons: { api: /publishes a contract/, clarify: /quick route/ },
        sources: { "tech-design": "local-clone", review: "local-clone", "plan-tests": "specs" },
      },
    },
  };
}

function routeFeature(slug: string, route: string, main: Record<string, string>) {
  Object.assign(main, specFiles(slug, "M", route), featureYaml(slug, { backend: "taras.m" }));
  Object.assign(
    main,
    signoffs(
      slug,
      [
        { step: "clarify", user: "olena.k", at: "2026-09-18T10:00:00Z" },
        { step: "epic", user: "maksym.d", at: "2026-09-19T10:00:00Z" },
      ],
      main,
    ),
  );
}
{
  const main = base();
  routeFeature("on-standard", "standard", main);
  routeFeature("on-full", "full", main);
  const backendFiles = (slug: string) => teamFiles(slug, { "sad.md": "# SAD\n", "adr/0001-x.md": "# ADR\n" });
  fixtures["skipped-or-missed"] = {
    description: "No ux-flows.md while tech-design has evidence: skipped on standard, missed with a warning on full.",
    now: NOW,
    main,
    teams: { backend: { ...backendFiles("on-standard"), ...backendFiles("on-full") } },
    features: ["on-full", "on-standard"],
    expected: {
      "on-standard": {
        current: "tech-design",
        steps: { specify: "done", clarify: "done", epic: "done", "ux-flows": "skipped", "tech-design": "signoff" },
        waitingOn: { "tech-design": ["taras.m"] },
        onlyWarnings: true,
        warnings: [],
      },
      "on-full": {
        current: "tech-design",
        steps: { specify: "done", clarify: "done", epic: "done", "ux-flows": "missed", "tech-design": "signoff" },
        reasons: { "ux-flows": /full route requires it/ },
        warnings: [/Missed step: ux-flows/],
      },
    },
  };
}

// --- a feature with no user interface

{
  const main = base();
  const backendOnly = (slug: string, ui: boolean | undefined) => {
    Object.assign(main, specFiles(slug, "M", "full"), featureYaml(slug, { backend: "taras.m" }));
    if (ui === false) main[`${dir(slug)}/hub/feature.yaml`] += "ui: false\n";
    Object.assign(main, signoffs(slug, [{ step: "clarify", user: "olena.k", at: "2026-09-18T10:00:00Z" }, { step: "epic", user: "maksym.d", at: "2026-09-19T10:00:00Z" }], main));
  };
  backendOnly("api-only", false);
  backendOnly("api-unmarked", undefined);
  const sad = "---\nstatus: Draft\nfeature_size: M\ntarget_surfaces: [backend-service]\n---\n\n# SAD\n";
  const files = (slug: string) => teamFiles(slug, { "sad.md": sad, "adr/0001-x.md": "# ADR\n" });
  fixtures["no-user-interface"] = {
    description: "ui: false in feature.yaml skips ux-flows and screens on every route. Without it, a sad.md that declares no UI surface gives a warning.",
    now: NOW,
    main,
    teams: { backend: { ...files("api-only"), ...files("api-unmarked") } },
    expected: {
      "api-only": {
        current: "tech-design",
        steps: { specify: "done", clarify: "done", epic: "done", "ux-flows": "skipped", "tech-design": "signoff", screens: "skipped" },
        reasons: { "ux-flows": /ui: false/, screens: /ui: false/ },
        onlyWarnings: true,
        warnings: [],
      },
      "api-unmarked": {
        current: "tech-design",
        steps: { specify: "done", clarify: "done", epic: "done", "ux-flows": "missed", "tech-design": "signoff" },
        warnings: [/declares no user interface.*ui: false/, /Missed step: ux-flows/],
      },
    },
  };
}

// --- returns at a gate

{
  const main = base();
  const returned = (slug: string, answered: boolean) => {
    Object.assign(main, specFiles(slug, "M", "standard"), featureYaml(slug));
    Object.assign(
      main,
      signoffs(
        slug,
        [
          { step: "clarify", user: "olena.k", at: "2026-09-18T10:00:00Z" },
          { step: "epic", user: "maksym.d", at: "2026-09-19T10:00:00Z", decision: "return", reason: "Size M is too small", returns_to: "clarify", cycle: 1 },
          ...(answered ? [{ step: "clarify", user: "olena.k", at: "2026-09-20T10:00:00Z" }] : []),
        ],
        main,
      ),
    );
  };
  returned("size-disputed", false);
  returned("size-answered", true);
  fixtures["epic-return"] = {
    description: "The PM returns epic: clarify is returned to the PO until the PO signs it again, then epic waits for the PM.",
    now: NOW,
    main,
    expected: {
      "size-disputed": {
        current: "clarify",
        steps: { specify: "done", clarify: "returned" },
        by: { clarify: "maksym.d" },
        reasons: { clarify: /too small/ },
        waitingOn: { clarify: ["olena.k"] },
      },
      "size-answered": {
        current: "epic",
        steps: { specify: "done", clarify: "done", epic: "ready" },
        waitingOn: { epic: ["maksym.d"] },
      },
    },
  };
}

// --- team snapshots

{
  const slug = "bulk-order-export";
  const main = {
    ...base(),
    ...specFiles(slug, "M", "standard"),
    ...featureYaml(slug, { backend: "taras.m", web: "petro.v", android: "andrii.p", ios: "sofiia.h" }),
    [`${dir(slug)}/ux-flows.md`]: "# UX\n",
    [`${dir(slug)}/screens.md`]: "# Screens\n",
    [`${dir(slug)}/test-plan.md`]: "# Test plan\n",
    [`${dir(slug)}/sad.md`]: "# SAD\n",
    [`${dir(slug)}/data-model.md`]: "# Data model\n",
    [`${dir(slug)}/contracts/openapi.yaml`]: "openapi: 3.1.0\n",
  };
  const clients = ["petro.v", "andrii.p", "sofiia.h"];
  Object.assign(
    main,
    signoffs(
      slug,
      [
        { step: "clarify", user: "olena.k", at: "2026-09-10T10:00:00Z" },
        { step: "epic", user: "maksym.d", at: "2026-09-11T10:00:00Z" },
        { step: "ux-flows", user: "olena.k", at: "2026-09-12T10:00:00Z" },
        ...clients.map((user) => ({ step: "tech-design", user, at: "2026-09-13T10:00:00Z" })),
        { step: "data-model", user: "taras.m", at: "2026-09-14T10:00:00Z" },
        ...clients.map((user) => ({ step: "api", user, at: "2026-09-15T10:00:00Z" })),
        { step: "screens", user: "olena.k", at: "2026-09-16T10:00:00Z" },
        ...["taras.m", ...clients].map((user) => ({ step: "tasks", user, at: "2026-09-17T10:00:00Z" })),
        { step: "sprint", user: "maksym.d", at: "2026-09-18T10:00:00Z" },
        { step: "plan-tests", user: "iryna.s", at: "2026-09-19T10:00:00Z" },
      ],
      main,
    ),
  );
  fixtures["implement-blocked"] = {
    description: "Four teams; web, Android and iOS wait for backend:T2, which is not done: implement is blocked. An unknown reference is a warning.",
    now: NOW,
    main,
    hubState: {
      ...snapshot(slug, "backend", {
        files: ["sad.md", "adr/0001-x.md", "data-model.md", "contracts/openapi.yaml", "tasks.json", "tasks/tracker.md"],
        tasks: ["T1", "T2"],
        tracker: [{ id: "T1", status: "done" }, { id: "T2", status: "in_progress" }],
      }),
      ...snapshot(slug, "web", {
        files: ["tasks.json", "tasks/tracker.md"],
        tasks: ["T1", "T2"],
        tracker: [{ id: "T1", status: "done" }, { id: "T2", status: "blocked", blocked_by: ["T1", "backend:T2"] }],
      }),
    },
    teams: {
      android: teamFiles(slug, { "tasks.json": tasksJson(slug, ["T1"]), "tasks/tracker.md": tracker([["T1", "blocked", "backend:T2"]]) }),
      ios: teamFiles(slug, { "tasks.json": tasksJson(slug, ["T1"]), "tasks/tracker.md": tracker([["T1", "todo", "backend:T9"]]) }),
    },
    expected: {
      [slug]: {
        current: "implement",
        steps: {
          specify: "done",
          clarify: "done",
          epic: "done",
          "ux-flows": "done",
          "tech-design": "done",
          "data-model": "done",
          api: "done",
          screens: "done",
          tasks: "done",
          sprint: "done",
          "plan-tests": "done",
          implement: "blocked",
        },
        reasons: { implement: /web waits for backend:T2/ },
        teamSources: { backend: "hub-state", web: "hub-state", android: "local-clone", ios: "local-clone" },
        waits: [
          { team: "web", task: "T2", on: "backend:T2", known: true, done: false },
          { team: "android", task: "T1", on: "backend:T2", known: true, done: false },
          { team: "ios", task: "T1", on: "backend:T9", known: false, done: false },
        ],
        warnings: [/ios T1 waits for backend:T9, which is not a known task/],
      },
    },
  };
}

{
  const slug = "tasks-split";
  const main = { ...base(), ...specFiles(slug, "M", "standard"), ...featureYaml(slug, { backend: "taras.m", web: "petro.v" }) };
  Object.assign(main, signoffs(slug, [{ step: "clarify", user: "olena.k", at: "2026-09-18T10:00:00Z" }], main));
  fixtures["snapshot-vs-clone"] = {
    description: "A valid hub-state snapshot wins over the clone; a malformed one is ignored with a warning and the clone is used.",
    now: NOW,
    main,
    hubState: {
      [`features/${slug}/teams/backend.json`]: "{ not json",
      ...snapshot(slug, "web", { files: ["tasks.json", "tasks/tracker.md"], tasks: ["T1"], tracker: [{ id: "T1", status: "todo" }] }),
    },
    teams: {
      backend: teamFiles(slug, { "tasks.json": tasksJson(slug, ["T1"]), "tasks/tracker.md": tracker([["T1", "todo"]]) }),
      web: teamFiles(slug, { "tasks.json": tasksJson(slug, ["T1", "T2"]), "tasks/tracker.md": tracker([["T1", "done"], ["T2", "done"]]) }),
    },
    expected: {
      [slug]: {
        current: "tasks",
        steps: {
          specify: "done",
          clarify: "done",
          epic: "missed",
          "ux-flows": "skipped",
          "tech-design": "missed",
          "data-model": "skipped",
          api: "skipped",
          screens: "skipped",
          tasks: "signoff",
        },
        waitingOn: { tasks: ["taras.m", "petro.v"] },
        teamSources: { backend: "local-clone", web: "hub-state" },
        warnings: [/snapshot of backend is malformed/, /Missed step: epic/, /Missed step: tech-design/],
        issues: [/Not valid JSON/],
      },
    },
  };
}

// --- QA and release

{
  const s = shippedWebFeature("open-bug");
  Object.assign(s.main, releaseYaml("open-bug", "staging: { smoke: passed, at: 2026-10-01T10:00:00Z }\n"), {
    [`${dir("open-bug")}/hub/bugs/BUG-0001.md`]: "---\nid: BUG-0001\ntitle: Lost on save\nteam: web\nseverity: high\nstatus: open\n---\nSteps.\n",
    [`${dir("open-bug")}/hub/bugs/BUG-0002.md`]: "---\nid: BUG-0002\ntitle: Typo\nteam: web\nseverity: low\nstatus: open\n---\nSteps.\n",
  });
  fixtures["verify-open-bug"] = {
    description: "Staging passed and a high bug is open: verify is ready for QA. A green CI run alone does not make verify missed.",
    now: NOW,
    main: s.main,
    hubState: { ...s.hubState, "features/open-bug/tests/ci-1.json": testRun("web", "ci", 0, "2026-10-02T10:00:00Z") },
    expected: {
      "open-bug": {
        current: "verify",
        steps: { ...DONE_THROUGH_SHIP, staging: "done", verify: "ready", autotests: "done" },
        waitingOn: { verify: ["iryna.s"] },
        blockingBugs: ["BUG-0001"],
        sources: { ship: "hub-state" },
        by: { ship: "petro.v" },
      },
    },
  };
}

{
  const s = shippedWebFeature("local-green", [{ step: "verify", user: "iryna.s", at: "2026-10-03T10:00:00Z" }]);
  Object.assign(s.main, releaseYaml("local-green", "staging: { smoke: passed }\n"));
  fixtures["autotests-local-only"] = {
    description: "A green local run does not open the autotest gate: the latest CI run is red, so autotests is blocked.",
    now: NOW,
    main: s.main,
    hubState: {
      ...s.hubState,
      "features/local-green/tests/ci-1.json": testRun("web", "ci", 2, "2026-10-04T10:00:00Z"),
      "features/local-green/tests/local-1.json": testRun("web", "local", 0, "2026-10-04T12:00:00Z"),
    },
    expected: {
      "local-green": {
        current: "autotests",
        steps: { ...DONE_THROUGH_SHIP, staging: "done", verify: "done", autotests: "blocked" },
        reasons: { autotests: /red in web/ },
      },
    },
  };
}

{
  const s = shippedWebFeature("retest", [
    { step: "verify", user: "iryna.s", at: "2026-10-03T10:00:00Z" },
    { step: "qa-final", user: "iryna.s", at: "2026-10-05T10:00:00Z", decision: "return", reason: "BUG-0003 reproduces on web", bugs: ["BUG-0003"], returns_to: "verify", cycle: 1 },
  ]);
  Object.assign(s.main, releaseYaml("retest", "staging: { smoke: passed }\n"), {
    [`${dir("retest")}/hub/bugs/BUG-0003.md`]: "---\nid: BUG-0003\ntitle: Lost on save\nteam: web\nseverity: high\nstatus: fixing\n---\nSteps.\n",
  });
  fixtures["qa-return-cycle-2"] = {
    description: "QA returns the feature at qa-final: verify is returned until QA signs it again, and the feature is in cycle 2.",
    now: NOW,
    main: s.main,
    hubState: { ...s.hubState, "features/retest/tests/ci-1.json": testRun("web", "ci", 0, "2026-10-04T10:00:00Z") },
    expected: {
      retest: {
        current: "verify",
        steps: { ...DONE_THROUGH_SHIP, staging: "done", verify: "returned", autotests: "done" },
        by: { verify: "iryna.s" },
        reasons: { verify: /BUG-0003/ },
        cycle: 2,
        blockingBugs: ["BUG-0003"],
      },
    },
  };
}

const QA_PASSED = [
  { step: "verify", user: "iryna.s", at: "2026-10-03T10:00:00Z" },
  { step: "qa-final", user: "iryna.s", at: "2026-10-04T10:00:00Z" },
  { step: "accept", user: "olena.k", at: "2026-10-04T12:00:00Z" },
];

{
  const s = shippedWebFeature("awaiting-go", QA_PASSED);
  Object.assign(s.main, releaseYaml("awaiting-go", "staging: { smoke: passed }\n"));
  fixtures["accept-awaiting-go"] = {
    description: "The PO accepted and release.yaml has no go: accept waits for the PM. The go or no-go lives in release.yaml only.",
    now: NOW,
    main: s.main,
    hubState: { ...s.hubState, "features/awaiting-go/tests/ci-1.json": testRun("web", "ci", 0, "2026-10-02T10:00:00Z") },
    expected: {
      "awaiting-go": {
        current: "accept",
        steps: { ...DONE_THROUGH_SHIP, staging: "done", verify: "done", autotests: "done", "qa-final": "done", accept: "signoff" },
        waitingOn: { accept: ["maksym.d"] },
      },
    },
  };
}

{
  const a = shippedWebFeature("shipped-out", QA_PASSED);
  const b = shippedWebFeature("in-watch", QA_PASSED);
  const rel = (started: string) =>
    `staging: { smoke: passed }\ngo: { value: go, user: maksym.d, at: 2026-10-05T09:00:00Z }\nrollout: { stage: 100 }\nwatch: { started: ${started}, days: 7 }\n`;
  Object.assign(a.main, b.main, releaseYaml("shipped-out", rel("2026-09-28")), releaseYaml("in-watch", rel("2026-10-05")));
  const ci = (slug: string) => ({ [`features/${slug}/tests/ci-1.json`]: testRun("web", "ci", 0, "2026-10-02T10:00:00Z") });
  const all = { ...DONE_THROUGH_SHIP, staging: "done", verify: "done", autotests: "done", "qa-final": "done", accept: "done" } as const;
  fixtures["released-and-watching"] = {
    description: "Rollout at 100% and the watch period over: released. Inside the watch period: release is running.",
    now: NOW,
    main: a.main,
    hubState: { ...a.hubState, ...b.hubState, ...ci("shipped-out"), ...ci("in-watch") },
    expected: {
      "shipped-out": { current: "released", steps: { ...all, release: "done" }, by: { accept: "maksym.d" } },
      "in-watch": { current: "release", steps: { ...all, release: "running" } },
    },
  };
}

// --- sign-offs and broken files

{
  const slug = "stale-flows";
  const main = { ...base(), ...specFiles(slug, "M", "standard"), ...featureYaml(slug), [`${dir(slug)}/ux-flows.md`]: "# UX flows v2\n" };
  Object.assign(
    main,
    signoffs(
      slug,
      [
        { step: "clarify", user: "olena.k", at: "2026-09-18T10:00:00Z", file: "spec.md" },
        { step: "epic", user: "maksym.d", at: "2026-09-19T10:00:00Z" },
        { step: "ux-flows", user: "olena.k", at: "2026-09-20T10:00:00Z", file: "ux-flows.md", hashOf: "# UX flows v1\n" },
      ],
      main,
    ),
  );
  fixtures["stale-signoff"] = {
    description: "ux-flows changed after its sign-off: the hash no longer matches, so it waits for sign-off again. A current hash keeps clarify done.",
    now: NOW,
    main,
    expected: {
      [slug]: {
        current: "ux-flows",
        steps: { specify: "done", clarify: "done", epic: "done", "ux-flows": "signoff" },
        stale: ["ux-flows"],
        reasons: { "ux-flows": /Changed since sign-off/ },
        waitingOn: { "ux-flows": ["olena.k"] },
      },
    },
  };
}

{
  const slug = "half-broken";
  fixtures["malformed-files"] = {
    description: "A broken feature.yaml and a bug with an unknown status are reported; detection goes on.",
    now: NOW,
    main: {
      ...base(),
      ...specFiles(slug, "M", "standard"),
      [`${dir(slug)}/hub/feature.yaml`]: "title: [\n",
      [`${dir(slug)}/hub/bugs/BUG-0009.md`]: "---\nid: BUG-0009\ntitle: t\nteam: web\nseverity: high\nstatus: done\n---\n",
    },
    expected: {
      [slug]: {
        current: "clarify",
        steps: { specify: "done", clarify: "ready" },
        issues: [/./, /status|Invalid option/],
      },
    },
  };
}

// --- other project shapes

{
  const slug = "one-repo-report";
  const config = base()[".hub/config.yaml"]!.replace(
    /teams:[\s\S]*?tracker:/,
    "teams:\n  - { id: app, name: Product, repo: shop/app, kind: other }\ntracker:",
  );
  const roles = base()[".hub/roles.yaml"]! + "  - { user: ann.d, name: Ann D., role: dev, team: app, lead: true }\n";
  const main = {
    ...base(),
    ".hub/config.yaml": config,
    ".hub/roles.yaml": roles,
    ...specFiles(slug, "L", "full"),
    ...featureYaml(slug, { app: "ann.d" }),
    [`${dir(slug)}/ux-flows.md`]: "# UX\n",
    [`${dir(slug)}/screens.md`]: "# Screens\n",
  };
  Object.assign(
    main,
    signoffs(
      slug,
      [
        { step: "clarify", user: "olena.k", at: "2026-09-18T10:00:00Z" },
        { step: "epic", user: "maksym.d", at: "2026-09-19T10:00:00Z" },
        { step: "ux-flows", user: "olena.k", at: "2026-09-20T10:00:00Z" },
        { step: "tech-design", user: "ann.d", at: "2026-09-21T10:00:00Z" },
        { step: "screens", user: "olena.k", at: "2026-09-22T10:00:00Z" },
      ],
      main,
    ),
  );
  fixtures["single-repo"] = {
    description: "One team and no contract team, on the full route: api is skipped anyway, a missing data-model is missed, and the team's own lead signs tech-design.",
    now: NOW,
    main,
    teams: {
      app: teamFiles(slug, { "sad.md": "# SAD\n", "adr/0001-x.md": "# ADR\n", "tasks.json": tasksJson(slug, ["T1"]), "tasks/tracker.md": tracker([["T1", "todo"]]) }),
    },
    expected: {
      [slug]: {
        current: "tasks",
        steps: {
          specify: "done",
          clarify: "done",
          epic: "done",
          "ux-flows": "done",
          "tech-design": "done",
          "data-model": "missed",
          api: "skipped",
          screens: "done",
          tasks: "signoff",
        },
        by: { "tech-design": "ann.d" },
        waitingOn: { tasks: ["ann.d"] },
        warnings: [/Missed step: data-model/],
      },
    },
  };
}

{
  const slug = "engine-swap";
  const alt = base()[".hub/engines/sdd.yaml"]!
    .replace("id: sdd", "id: other-engine")
    .replace("source: genkovich/sdd", "source: example/other")
    .replace(/stage: specify/, "stage: write-spec")
    .replace(/stage: clarify/, "stage: challenge-spec");
  fixtures["engine-swap"] = {
    description: "Another engine adapter with other stage names gives the same statuses.",
    now: NOW,
    main: {
      ...base(),
      ".hub/config.yaml": base()[".hub/config.yaml"]!.replace("engine: sdd", "engine: other-engine"),
      ".hub/engines/other-engine.yaml": alt,
      ...specFiles(slug, "M", "standard"),
      ...featureYaml(slug),
    },
    expected: { [slug]: { current: "clarify", steps: { specify: "done", clarify: "ready" }, waitingOn: { clarify: ["olena.k"] } } },
  };
}

export default fixtures;
