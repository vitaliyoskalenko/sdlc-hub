// Releases: Ops' view across features. Every feature from staging on, and a released one until its watch period
// ends: where it is, the smoke check, the go or no-go, the versions, the rollout and the watch. Read only; each
// feature's Release tab changes it.

import { useEffect, useState } from "preact/hooks";
import { api, type ReleaseInfo, type Summary } from "./api.ts";
import { Link, Pill, StatusPill, useApp } from "./ui.tsx";

type Row = { summary: Summary; release: Omit<ReleaseInfo, "now"> };

const day = (iso: string) => iso.slice(0, 10);

export function Releases() {
  const { version, me } = useApp();
  const [rows, setRows] = useState<{ releases: Row[]; now: string } | null>(null);
  useEffect(() => {
    let live = true;
    api.releases().then((r) => live && setRows(r), () => live && setRows({ releases: [], now: "" }));
    return () => {
      live = false;
    };
  }, [version]);
  return (
    <>
      <div class="ph">
        <div>
          <h1>Releases</h1>
          <p class="sub">Every feature from staging on, and a released one until its watch period ends. {me.roles.includes("ops") ? "Open a feature's Release tab to record what you did." : "Ops records each step on the feature's Release tab."}</p>
        </div>
      </div>
      {!rows ? (
        <p class="muted">Loading…</p>
      ) : !rows.releases.length ? (
        <div class="lockbox">No feature is at staging or in release now.</div>
      ) : (
        <div class="card scroll">
          <table id="releases">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Step</th>
                <th>Smoke</th>
                <th>Go</th>
                <th>Versions</th>
                <th>Rollout</th>
                <th>Watch</th>
              </tr>
            </thead>
            <tbody>
              {rows.releases.map(({ summary: f, release: r }) => {
                const left = r.watchEnds ? Math.ceil((Date.parse(r.watchEnds) - Date.parse(rows.now)) / 86_400_000) : null;
                return (
                  <tr key={f.slug} data-release={f.slug}>
                    <td class="wide">
                      <Link to={`/features/${f.slug}/release`}>{f.title}</Link>
                    </td>
                    <td class="nw">
                      {f.released ? <Pill kind="ok">released</Pill> : <><code>{f.current}</code> <StatusPill status={f.status} /></>}
                    </td>
                    <td class="nw">
                      <Pill kind={r.staging?.smoke === "passed" ? "ok" : r.staging?.smoke === "failed" ? "bad" : "mute"}>{r.staging?.smoke ?? "not run"}</Pill>
                    </td>
                    <td class="nw">{r.go ? <Pill kind={r.go.value === "go" ? "ok" : "bad"}>{r.go.value}</Pill> : <span class="muted">not yet</span>}</td>
                    <td>{r.versions && Object.keys(r.versions).length ? Object.entries(r.versions).map(([t, v]) => `${t} ${v}`).join(", ") : <span class="muted">none</span>}</td>
                    <td class="nw">{r.rollout?.stage ?? 0}%</td>
                    <td class="nw">{r.watchEnds ? (left !== null && left <= 0 ? <Pill kind="ok">over</Pill> : `until ${day(r.watchEnds)}`) : <span class="muted" title="The watch period starts when the rollout reaches 100%">not started</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
