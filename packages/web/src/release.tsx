// The Release screen of a feature: the staging smoke check, acceptance and the go or no-go, the checklist, the
// rollout and the watch period. Ops records the smoke check, ticks the checklist and sets the rollout; the PO
// accepts; the PM gives the go or the no-go. Each change is a merge request in the person's name.

import { useEffect, useState } from "preact/hooks";
import type { FeatureDetail } from "./api.ts";
import { PendingList, SignoffBox, useAction, usePending } from "./saves.tsx";
import { personName, Pill, StatusPill, useApp } from "./ui.tsx";

const STAGES = [0, 10, 25, 50, 100];
const day = (iso: string) => iso.slice(0, 10);

export function Release({ detail }: { detail: FeatureDetail }) {
  const { me, project } = useApp();
  const slug = detail.state.slug;
  const r = detail.release;
  const ops = me.roles.includes("ops");
  const pm = me.roles.includes("pm");
  const { run, busy, problem } = useAction();
  const pending = usePending(slug, "release");
  const [item, setItem] = useState("");
  // A ticked item shows as ticked while its merge request waits, until main has it.
  const [want, setWant] = useState<Record<string, boolean>>({});
  useEffect(() => setWant((w) => Object.fromEntries(Object.entries(w).filter(([k, v]) => r.checklist.find((c) => c.item === k)?.done !== v))), [r.checklist.map((c) => `${c.item}:${c.done}`).join("|")]);
  const st = (id: string) => detail.state.steps.find((s) => s.id === id);
  const owner = (id: string) => detail.awaiting.includes(id) && (st(id)?.waitingOn ?? []).includes(me.user);
  const edit = (e: object) => void run("release", { slug, edit: e });
  const left = r.watchEnds ? Math.ceil((Date.parse(r.watchEnds) - Date.parse(r.now)) / 86_400_000) : null;
  // One change to release.yaml at a time: a second one would conflict with the first until it merges.
  const waiting = pending.some((p) => p.state === "pending");
  const opsOnly = ops ? (waiting ? "Waiting for your last change to merge." : "") : "Only Ops changes this.";
  const wait = busy || waiting;

  return (
    <div class="stack" id="release">
      <div class="row">
        {["staging", "accept", "release"].map((id) => (
          <span class="row" key={id}>
            <code>{id}</code> {st(id) && <StatusPill status={st(id)!.status} />}
          </span>
        ))}
      </div>
      {problem}
      <PendingList saves={pending} />

      <div class="grid2">
        <div class="card" id="staging">
          <h3>Staging</h3>
          <p>
            Smoke check on every client:{" "}
            <Pill kind={r.staging?.smoke === "passed" ? "ok" : r.staging?.smoke === "failed" ? "bad" : "mute"}>{r.staging?.smoke ?? "not run"}</Pill>
            {r.staging?.at ? <span class="muted"> {day(r.staging.at)}</span> : null}
          </p>
          <div class="row">
            <button type="button" class="btn" data-smoke="passed" disabled={!ops || wait || r.staging?.smoke === "passed"} onClick={() => edit({ kind: "smoke", value: "passed" })}>
              Smoke passed
            </button>
            <button type="button" class="btn" data-smoke="failed" disabled={!ops || wait || r.staging?.smoke === "failed"} onClick={() => edit({ kind: "smoke", value: "failed" })}>
              Smoke failed
            </button>
            {opsOnly && <span class="reason">{opsOnly}</span>}
          </div>
        </div>

        <div class="card" id="go">
          <h3>Acceptance and go</h3>
          <p>
            PO acceptance: {st("accept") && (st("accept")!.status === "done" || r.go) ? <Pill kind="ok">recorded</Pill> : <Pill kind="mute">not yet</Pill>}
          </p>
          {owner("accept") && <SignoffBox slug={slug} step="accept" />}
          <p>
            Go or no-go:{" "}
            {r.go ? (
              <>
                <Pill kind={r.go.value === "go" ? "ok" : "bad"}>{r.go.value}</Pill> <span class="muted">{personName(project, r.go.user)}, {day(r.go.at)}</span>
              </>
            ) : (
              <Pill kind="mute">not given</Pill>
            )}
          </p>
          <div class="row">
            <button type="button" class="btn pri" data-go="go" disabled={!pm || wait || r.go?.value === "go"} onClick={() => edit({ kind: "go", value: "go" })}>
              Go
            </button>
            <button type="button" class="btn" data-go="no-go" disabled={!pm || wait || r.go?.value === "no-go"} onClick={() => edit({ kind: "go", value: "no-go" })}>
              No-go
            </button>
            {!pm ? <span class="reason">Only the PM gives the go or the no-go.</span> : waiting ? <span class="reason">Waiting for your last change to merge.</span> : null}
          </div>
        </div>
      </div>

      <section>
        <h2>Checklist</h2>
        <ol class="checklist" id="checklist">
          {r.checklist.map((c) => (
            <li key={c.item}>
              <label class="switch">
                <input
                  type="checkbox"
                  data-item={c.item}
                  checked={want[c.item] ?? c.done}
                  disabled={!ops || wait || c.item in want}
                  onChange={(e) => {
                    const done = e.currentTarget.checked;
                    setWant((w) => ({ ...w, [c.item]: done }));
                    edit({ kind: "check", item: c.item, done });
                  }}
                />{" "}
                {c.item}
              </label>
              {c.item in want && <span class="muted"> · saving</span>}
              {c.done && c.user ? <span class="muted"> · {personName(project, c.user)}{c.at ? `, ${day(c.at)}` : ""}</span> : null}
            </li>
          ))}
        </ol>
        {ops ? (
          <div class="row">
            <input type="text" id="new-item" value={item} placeholder="Another item" aria-label="Another checklist item" onInput={(e) => setItem(e.currentTarget.value)} />
            <button type="button" class="btn" id="add-item" disabled={!item.trim() || wait} onClick={() => (edit({ kind: "add-item", item }), setItem(""))}>
              Add
            </button>
          </div>
        ) : (
          <p class="reason">Ops ticks the checklist.</p>
        )}
        {ops && waiting && <p class="reason">Waiting for your last change to merge.</p>}
      </section>

      <section>
        <h2>Rollout</h2>
        <div class="row" id="rollout">
          <span>
            Stage: <b>{r.rollout?.stage ?? 0}%</b>
          </span>
          <span class="fpick">
            {STAGES.map((s) => (
              <button type="button" key={s} class="chipbtn" data-stage={s} aria-pressed={(r.rollout?.stage ?? 0) === s} disabled={!ops || wait} onClick={() => edit({ kind: "rollout", stage: s })}>
                {s}%
              </button>
            ))}
          </span>
          {opsOnly && <span class="reason">{opsOnly}</span>}
        </div>
        <p id="watch">
          {r.watch && r.watchEnds ? (
            left !== null && left <= 0 ? (
              <>
                <Pill kind="ok">watch period over</Pill> {r.watch.days} days from {day(r.watch.started)}
              </>
            ) : (
              <>
                <Pill kind="info">watching</Pill> until {day(r.watchEnds)}, {left} day{left === 1 ? "" : "s"} left
              </>
            )
          ) : (
            <span class="muted">The watch period of {project.flow.watchDays} days starts when the rollout reaches 100%.</span>
          )}
        </p>
        <p class="muted">The hub never starts a production job itself; it records what Ops did.</p>
      </section>
    </div>
  );
}
