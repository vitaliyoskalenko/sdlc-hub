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
