import { describe, expect, it } from "vitest";
import { detectFeature, listFeatures, loadProject, memorySource, type FileSource, type ProjectView } from "../src/index.ts";
import { fixtures } from "@sdlc-hub/fixtures";
import type { Files, Fixture } from "@sdlc-hub/fixtures";

function authorsFor(prefix: string, authors: Record<string, string> = {}): Record<string, string> {
  return Object.fromEntries(Object.entries(authors).flatMap(([k, v]) => (k.startsWith(prefix) ? [[k.slice(prefix.length), v]] : [])));
}

function viewOf(f: Fixture): ProjectView {
  const clones = new Map<string, FileSource>(Object.entries(f.teams ?? {}).map(([id, files]: [string, Files]) => [id, memorySource(files)]));
  return {
    specs: memorySource(f.main, authorsFor("main/", f.authors)),
    hubState: f.hubState ? memorySource(f.hubState, authorsFor("hub-state/", f.authors)) : null,
    teamClone: (id) => clones.get(id) ?? null,
    now: f.now,
  };
}

describe.each(Object.entries(fixtures))("fixture %s", (name, f) => {
  const view = viewOf(f);
  const project = loadProject(view.specs);

  it("loads the project without issues", () => {
    expect(project.issues).toEqual([]);
  });

  if (f.features) {
    it("finds the features", () => expect(listFeatures(view.specs)).toEqual(f.features));
  }

  for (const [slug, exp] of Object.entries(f.expected)) {
    describe(slug, () => {
      const state = () => detectFeature(project.value!, view, slug);

      it(`is at ${exp.current}`, () => expect(state().current).toBe(exp.current));

      it("has the expected status on every step", () => {
        const actual = Object.fromEntries(state().steps.map((s) => [s.id, s.status]));
        const wanted = Object.fromEntries(state().steps.map((s) => [s.id, exp.steps[s.id] ?? "todo"]));
        expect(actual).toEqual(wanted);
      });

      if (exp.by)
        it("names the person on each step", () => {
          const s = state();
          for (const [id, user] of Object.entries(exp.by!)) expect(s.steps.find((x) => x.id === id)?.by, id).toBe(user);
        });
      if (exp.waitingOn)
        it("names who each step waits for", () => {
          const s = state();
          for (const [id, users] of Object.entries(exp.waitingOn!)) expect(s.steps.find((x) => x.id === id)?.waitingOn, id).toEqual(users);
        });
      if (exp.reasons)
        it("gives the reasons", () => {
          const s = state();
          for (const [id, re] of Object.entries(exp.reasons!)) expect(s.steps.find((x) => x.id === id)?.reason, id).toMatch(re);
        });
      if (exp.sources)
        it("says where the evidence came from", () => {
          const s = state();
          for (const [id, src] of Object.entries(exp.sources!)) expect(s.steps.find((x) => x.id === id)?.source, id).toBe(src);
        });
      if (exp.teamSources)
        it("reads each team from the expected place", () => {
          expect(Object.fromEntries(state().teams.map((t) => [t.id, t.source]))).toEqual(exp.teamSources);
        });
      if (exp.stale)
        it("marks changed-since-sign-off", () => {
          expect(state().steps.filter((s) => s.stale).map((s) => s.id)).toEqual(exp.stale);
        });
      if (exp.cycle) it(`is in cycle ${exp.cycle}`, () => expect(state().cycle).toBe(exp.cycle));
      if (exp.blockingBugs) it("lists the blocking bugs", () => expect(state().blockingBugs).toEqual(exp.blockingBugs));
      if (exp.waits) it("lists the cross-team waits", () => expect(state().waits).toEqual(exp.waits));

      it("reports the expected warnings", () => {
        const warnings = state().warnings;
        for (const re of exp.warnings ?? []) expect(warnings.some((w) => re.test(w)), `${re} in ${JSON.stringify(warnings)}`).toBe(true);
        if (exp.onlyWarnings) expect(warnings.filter((w) => !(exp.warnings ?? []).some((re) => re.test(w)))).toEqual([]);
      });

      it("reports the expected issues", () => {
        const messages = state().issues.map((i) => i.message);
        if (!exp.issues) expect(messages).toEqual([]);
        else for (const re of exp.issues) expect(messages.some((m) => re.test(m)), `${re} in ${JSON.stringify(messages)}`).toBe(true);
      });
    });
  }

  it(`(${name}) is described`, () => expect(f.description.length).toBeGreaterThan(10));
});

describe("a stage whose only evidence is its sign-off", () => {
  it("waits for that sign-off once the stage finished, instead of showing ready to start", () => {
    const f = fixtures["demo"]!;
    const path = "features/returns-portal/events.jsonl";
    const events = ['{"step":"clarify","event":"started","role":"po","assistant":"claude","at":"2026-10-08T09:00:00Z"}', '{"step":"clarify","event":"finished","role":"po","assistant":"claude","at":"2026-10-08T09:20:00Z"}'];
    const view = viewOf({ ...f, hubState: { ...f.hubState, [path]: `${f.hubState?.[path] ?? ""}${events.join("\n")}\n` } });
    const clarify = detectFeature(loadProject(view.specs).value!, view, "returns-portal").steps.find((s) => s.id === "clarify")!;
    expect(clarify).toMatchObject({ status: "signoff", waitingOn: ["olena.k"] });
  });
});

describe("tech-design without the sequences log", () => {
  // SDD keeps sequences' edits-log on disk only when the stage asked the person something.
  it("counts as done once hub_record says the stages finished", () => {
    const f = fixtures["demo"]!;
    const snap = "features/order-webhooks/teams/backend.json";
    const backend = JSON.parse(f.hubState![snap]!) as { files: string[] };
    const noLog = { ...f.hubState, [snap]: JSON.stringify({ ...backend, files: backend.files.filter((x) => x !== "_sequences-log.md") }) };
    const step = (hubState: Record<string, string>) => {
      const view = viewOf({ ...f, hubState });
      return detectFeature(loadProject(view.specs).value!, view, "order-webhooks").steps.find((s) => s.id === "tech-design")!.status;
    };
    expect(step(noLog)).not.toBe("signoff");
    const finished = '{"step":"tech-design","event":"finished","role":"dev","assistant":"claude","at":"2026-10-08T09:00:00Z"}\n';
    expect(step({ ...noLog, "features/order-webhooks/events.jsonl": finished })).toBe("signoff");
  });
});

describe("a gate that only reads CI", () => {
  it("is not reached by a green pipeline while the steps before it are open", () => {
    const f = fixtures["demo"]!;
    const run = JSON.stringify({ source: "ci", team: "backend", result: "passed", at: "2026-10-08T09:00:00Z" });
    const view = viewOf({ ...f, hubState: { ...f.hubState, "features/returns-portal/tests/ci-backend-9.json": run } });
    const s = detectFeature(loadProject(view.specs).value!, view, "returns-portal");
    expect(s.steps.find((x) => x.id === "autotests")!.status).toBe("todo");
    expect(s.current).toBe("clarify");
  });
});

describe("the user interface of a feature with several teams", () => {
  it("comes from every team's design: the contract team's backend alone is no reason to warn", () => {
    const f = fixtures["demo"]!;
    const path = "features/bulk-order-export/teams/backend.json";
    const backend = JSON.parse(f.hubState![path]!) as Record<string, unknown>;
    // sad.md lives in the contract team's repository only, as SDD's design writes it there.
    const main = Object.fromEntries(Object.entries(f.main).filter(([p]) => p !== "docs/features/bulk-order-export/sad.md"));
    const view = viewOf({ ...f, main, hubState: { ...f.hubState, [path]: JSON.stringify({ ...backend, target_surfaces: ["backend-service"] }) } });
    const s = detectFeature(loadProject(view.specs).value!, view, "bulk-order-export");
    expect(s.warnings.filter((w) => /declares no user interface/.test(w))).toEqual([]);
    // The contract team's sad.md in product-specs (copied at api) is that team's too.
    const withSad = viewOf({ ...f, main: { ...main, "docs/features/bulk-order-export/sad.md": "---\ntarget_surfaces: [backend-service]\n---\n# SAD\n" }, hubState: { ...f.hubState, [path]: JSON.stringify({ ...backend, target_surfaces: ["backend-service"] }) } });
    expect(detectFeature(loadProject(withSad.specs).value!, withSad, "bulk-order-export").warnings.filter((w) => /declares no user interface/.test(w))).toEqual([]);
  });
});

describe("an optional step handed out and then passed by", () => {
  it("is skipped once a later step has its evidence, though hub_next recorded its start", () => {
    const f = fixtures["demo"]!;
    const path = "features/order-notes-fix/events.jsonl";
    const started = '{"step":"data-model","event":"started","role":"dev","assistant":"claude","at":"2026-10-01T09:00:00Z"}\n';
    const view = viewOf({ ...f, hubState: { ...f.hubState, [path]: `${f.hubState?.[path] ?? ""}${started}` } });
    expect(detectFeature(loadProject(view.specs).value!, view, "order-notes-fix").steps.find((s) => s.id === "data-model")!.status).toBe("skipped");
  });
});

describe("a task tracker before work starts", () => {
  it("is no sign that implement runs: a task blocked by another team is not progress", () => {
    const f = fixtures["demo"]!;
    const notStarted = (s: string) => (s === "blocked" ? "blocked" : "todo");
    const hubState = Object.fromEntries(
      Object.entries(f.hubState ?? {}).map(([p, text]) => {
        if (!/^features\/bulk-order-export\/teams\//.test(p)) return [p, text];
        const snap = JSON.parse(text) as { tracker?: { status: string }[] };
        return [p, JSON.stringify({ ...snap, tracker: snap.tracker?.map((r) => ({ ...r, status: notStarted(r.status) })) })];
      }),
    );
    const teams = Object.fromEntries(
      Object.entries(f.teams ?? {}).map(([id, files]) => [id, Object.fromEntries(Object.entries(files).map(([p, t]) => [p, p.endsWith("tracker.md") ? t.replace(/\| (in_progress|review|done) \|/g, "| todo |") : t]))]),
    );
    const view = viewOf({ ...f, hubState, teams });
    expect(detectFeature(loadProject(view.specs).value!, view, "bulk-order-export").steps.find((s) => s.id === "implement")!.status).not.toBe("running");
  });
});
