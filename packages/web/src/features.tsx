// Features: every feature as a list, or as a graph with one track per feature on the role-lane flow.

import { useState } from "preact/hooks";
import type { FlowStep, StepStatus, Summary } from "./api.ts";
import { ChangedBar, FeatureTable } from "./home.tsx";
import { LEGEND, roleOf, STATUS } from "./text.ts";
import { Cmd, names, teamName, useApp, waitingTeams } from "./ui.tsx";
import { hubCmd } from "./text.ts";

const FILTERS: [string, string, (f: Summary, myRoles: string[]) => boolean][] = [
  ["all", "All", () => true],
  ["mine", "Waiting on my role", (f, r) => !f.released && f.role !== null && r.includes(f.role)],
  ["waiting", "A team waits for another", (f) => f.crossWaits.length > 0],
  ["recheck", "To recheck", (f) => f.rechecks.length > 0],
  ["progress", "In progress", (f) => !f.released],
  ["released", "Released", (f) => f.released],
];

const ACTIVE: StepStatus[] = ["running", "signoff", "blocked", "ready", "returned", "missed"];

/** Where each step box sits on the role-lane map. */
export function layout(steps: FlowStep[], lanes: string[], left: number, laneW: number, top: number, rowH: number) {
  const P: Record<string, { cx: number; cy: number; w: number }> = {};
  steps.forEach((s, i) => {
    P[s.id] = { cx: left + (Math.max(0, lanes.indexOf(s.role)) + 0.5) * laneW, cy: top + i * rowH + rowH / 2, w: Math.round(s.id.length * 7 + 16) };
  });
  const v = P["verify"];
  if (v) P["fix"] = { cx: left + (lanes.indexOf("dev") + 0.5) * laneW, cy: v.cy, w: 40 };
  return P;
}

function Graph({ list }: { list: Summary[] }) {
  const { project, go } = useApp();
  const steps = project.flow.steps;
  const lanes = project.flow.lanes;
  const FW = 540, gap = 16, TW = 112, head = 86, rowH = 30, numW = 20;
  const laneW = (FW - numW - 6) / lanes.length;
  const W = FW + gap + list.length * TW + 4;
  const H = head + steps.length * rowH + 10;
  const y = (i: number) => head + i * rowH + rowH / 2;
  const tx = (k: number) => FW + gap + k * TW + TW / 2;
  const P = layout(steps, lanes, numW, laneW, head, rowH);
  const here = new Set(list.map((f) => f.current));
  const ids = steps.map((s) => s.id);
  return (
    <svg class="fgraph" viewBox={`0 0 ${W} ${H}`} style={{ width: `min(${Math.round(W * 1.3)}px, 100%)` }} role="group" aria-label={`All ${list.length} features on the flow: twenty steps in six role lanes, one track per feature`}>
      <defs>
        <marker id="ga" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0 1L7.5 4L0 7Z" fill="var(--wire)" />
        </marker>
        <marker id="gb" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0 1L7.5 4L0 7Z" fill="var(--bad)" />
        </marker>
      </defs>
      {ids.map((id, i) => here.has(id) && <rect key={`b${id}`} class="rowband" x={FW + 4} y={y(i) - rowH / 2 + 2} width={W - FW - 6} height={rowH - 4} rx="6" />)}
      {lanes.map((r, i) => (
        <g key={r}>
          <rect class={`band role-${roleOf(r).css}`} x={numW + i * laneW + 2} y={head - 8} width={laneW - 4} height={H - head + 6} rx="7" />
          <text class={`lanehead role-${roleOf(r).css}`} x={numW + (i + 0.5) * laneW} y={head - 14} text-anchor="middle">
            {roleOf(r).s}
          </text>
        </g>
      ))}
      {ids.map((id, i) => (
        <text key={`n${id}`} class="rownum" x={numW / 2} y={y(i) + 3} text-anchor="middle">
          {i + 1}
        </text>
      ))}
      {ids.slice(0, -1).map((id, i) => {
        const a = P[id]!, b = P[ids[i + 1]!]!, y1 = a.cy + 11, y2 = b.cy - 12, my = (y1 + y2) / 2;
        return <path key={`w${id}`} class="wire" d={Math.abs(a.cx - b.cx) < 1 ? `M${a.cx} ${y1}V${y2}` : `M${a.cx} ${y1}V${my}H${b.cx}V${y2}`} marker-end="url(#ga)" />;
      })}
      {P["fix"] && P["verify"] && <Loop v={P["verify"]} fx={P["fix"]} marker="gb" />}
      {[...steps, ...(P["fix"] ? [{ id: "fix", role: "dev", kind: "engine" } as FlowStep] : [])].map((s) => {
        const p = P[s.id]!;
        return (
          <g key={`g${s.id}`} class={`gnode role-${roleOf(s.role).css}${here.has(s.id) ? " on" : ""}`}>
            <rect x={p.cx - p.w / 2} y={p.cy - 11} width={p.w} height="22" rx={s.kind === "engine" ? 6 : 11} />
            <text x={p.cx} y={p.cy + 3.8} text-anchor="middle">
              {s.id}
            </text>
          </g>
        );
      })}
      {list.map((f, k) => {
        const x = tx(k);
        const ci = f.released ? ids.length - 1 : Math.max(0, ids.indexOf(f.current));
        const cut = f.slug.length > 14 ? f.slug.lastIndexOf("-", 13) + 1 : 0;
        const parts = cut > 0 ? [f.slug.slice(0, cut), f.slug.slice(cut)] : [f.slug];
        // Who holds the feature now: the people its step waits on, else who runs it, else the role.
        const holder = f.released ? "released" : f.waitingOn.length ? names(project, f.waitingOn.slice(0, 1)) + (f.waitingOn.length > 1 ? ` +${f.waitingOn.length - 1}` : "") : f.by ? names(project, [f.by]) : roleOf(f.role ?? "").n;
        const waitsFor = [...new Set(f.crossWaits.map((w) => teamName(project, w.on.split(":")[0]!)))];
        return (
          <g key={f.slug}>
            <g class="fhd" data-slug={f.slug} tabIndex={0} role="button" aria-label={`Open ${f.title}, ${f.released ? "released" : `${f.progress} percent, with ${holder}`}${waitsFor.length ? `, waits for ${waitsFor.join(" and ")}` : ""}`} onClick={() => go(`/features/${f.slug}`)} onKeyDown={(e) => e.key === "Enter" && go(`/features/${f.slug}`)}>
              <rect class="hit" x={x - TW / 2 + 3} y="2" width={TW - 6} height={head - 12} rx="7" />
              {parts.map((t, j) => (
                <text key={j} x={x} y={parts.length === 1 ? 21 : 15 + j * 12} text-anchor="middle">
                  {t}
                </text>
              ))}
              <text class="pc" x={x} y={41} text-anchor="middle">
                {f.released ? "released" : `${f.progress}%`}
              </text>
              {!f.released && (
                <text class="holder" x={x} y={54} text-anchor="middle">
                  {holder}
                </text>
              )}
              {waitsFor.length > 0 && (
                <text class="waits" x={x} y={67} text-anchor="middle">
                  waits for {waitsFor.join(", ")}
                </text>
              )}
            </g>
            <line class="trk" x1={x} y1={y(0)} x2={x} y2={y(ids.length - 1)} />
            <line class="trk done" x1={x} y1={y(0)} x2={x} y2={y(ci)} />
            {ids.map((id, i) => {
              const m = f.statuses[i] ?? "todo";
              const big = ACTIVE.includes(m);
              const waits = id === f.current && waitsFor.length > 0;
              const tip = `${f.slug} · ${i + 1} ${id} · ${STATUS[m][1]}${waits ? ` · ${waitingTeams(f).length} teams wait for ${waitsFor.join(", ")}` : ""}`;
              return (
                <g key={id} class={`fm m-${m}${waits ? " waits" : ""}`} data-slug={f.slug} tabIndex={big ? 0 : -1} role="button" aria-label={tip} onClick={() => go(`/features/${f.slug}`, { step: id })} onKeyDown={(e) => e.key === "Enter" && go(`/features/${f.slug}`, { step: id })}>
                  <title>{tip}</title>
                  <rect class="hit" x={x - TW / 2 + 3} y={y(i) - rowH / 2 + 2} width={TW - 6} height={rowH - 4} rx="6" />
                  {waits && <circle class="ring" cx={x} cy={y(i)} r="12" />}
                  {waits && (
                    <text class="waitcount" x={x + 15} y={y(i) + 4}>
                      ⧗{waitingTeams(f).length}
                    </text>
                  )}
                  {m === "skipped" ? <line x1={x - 4} y1={y(i)} x2={x + 4} y2={y(i)} /> : <circle cx={x} cy={y(i)} r={big ? 7.5 : m === "done" ? 4.5 : 3.5} />}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

export function Loop({ v, fx, marker }: { v: { cx: number; cy: number; w: number }; fx: { cx: number; cy: number; w: number }; marker: string }) {
  return (
    <>
      <path class="loopw" d={`M${v.cx - v.w / 2 - 1} ${v.cy - 4}H${fx.cx + fx.w / 2 + 2}`} marker-end={`url(#${marker})`} />
      <path class="loopw" d={`M${fx.cx + fx.w / 2 + 1} ${fx.cy + 4}H${v.cx - v.w / 2 - 2}`} marker-end={`url(#${marker})`} />
    </>
  );
}

export function Features({ params }: { params: URLSearchParams }) {
  const { features, me, go, assistant } = useApp();
  const graph = params.get("view") === "graph";
  const flt = FILTERS.find((x) => x[0] === params.get("filter")) ?? FILTERS[0]!;
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = features.filter((f) => flt[2](f, me.roles) && words.every((w) => `${f.title} ${f.slug} ${f.current}`.toLowerCase().includes(w)));
  const set = (p: Record<string, string | undefined>) => go("/features", { view: graph ? "graph" : undefined, filter: flt[0] === "all" ? undefined : flt[0], ...p });
  return (
    <>
      <div class="ph">
        <div>
          <h1>Features</h1>
          <p class="sub">
            Every feature in <code>docs/features/</code>, with the step the hub detected from the files.
          </p>
        </div>
        <div class="row">
          <div class="seg" role="group" aria-label="How to show the features">
            <button type="button" data-fview="list" aria-pressed={!graph} onClick={() => set({ view: undefined })}>
              List
            </button>
            <button type="button" data-fview="graph" aria-pressed={graph} onClick={() => set({ view: "graph" })}>
              Graph
            </button>
          </div>
          {me.roles.includes("po") && <Cmd text={hubCmd(assistant, "new", "<slug>")} />}
        </div>
      </div>
      <div class="fpick" role="group" aria-label="Filter">
        {FILTERS.map(([id, label, test]) => (
          <button type="button" key={id} class="chipbtn" data-ffilter={id} aria-pressed={id === flt[0]} onClick={() => set({ filter: id === "all" ? undefined : id })}>
            {label} · {features.filter((f) => test(f, me.roles)).length}
          </button>
        ))}
        {features.length > 3 && <input type="search" id="fsearch" class="fsearch" placeholder="Find a feature" aria-label="Find a feature by title, slug or step" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />}
      </div>
      {!list.length ? (
        <div class="lockbox">{q ? `No feature matches "${q}".` : "No feature matches this filter."}</div>
      ) : graph ? (
        <div class="card">
          <p class="scrollhint">Scroll sideways: the feature tracks are to the right of the lanes.</p>
          <div class="mapwrap">
            <Graph list={list} />
          </div>
          <div class="legend">
            {LEGEND.map(([s, l]) => (
              <span key={s}>
                <i class={`ld ${s}`} />
                {l}
              </span>
            ))}
            <span>
              <i class="ld waitring" />a team waits for another
            </span>
            <span class="muted">Each column on the right is one feature, with who holds it now. Select a mark to open that feature at that step.</span>
          </div>
        </div>
      ) : (
        <>
          <ChangedBar list={list} />
          <FeatureTable list={list} />
        </>
      )}
      <p class="note">The step is derived from evidence: SDD files, the task tracker, review verdicts, test runs and sign-offs. Nobody types a status.</p>
    </>
  );
}
