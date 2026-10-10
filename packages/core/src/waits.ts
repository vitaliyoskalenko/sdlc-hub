// The days a team waited for another, usually for the team that publishes the API contract. A task waits on another
// team when the tracker says blocked and its Blocked by names a task of that team (backend:T2). hub-report carries
// the start of each wait from one snapshot to the next, and keeps the waits that ended.

import type { TeamSnapshot } from "./schema/feature.ts";

const crossTeam = (refs: string[]) => refs.filter((r) => r.includes(":"));

/** The snapshot about to be written, with its waits carried from the one before it. */
export function carryWaits(prev: TeamSnapshot | undefined, next: TeamSnapshot, now: string): TeamSnapshot {
  const before = new Map((prev?.waits ?? []).map((w) => [w.task, w]));
  const waits = (next.tracker ?? [])
    .filter((r) => r.status === "blocked" && crossTeam(r.blocked_by).length > 0)
    .map((r) => ({ task: r.id, on: crossTeam(r.blocked_by), since: before.get(r.id)?.since ?? now }));
  const still = new Set(waits.map((w) => w.task));
  const ended = (prev?.waits ?? []).filter((w) => !still.has(w.task)).map((w) => ({ task: w.task, on: w.on, from: w.since, to: now }));
  return { ...next, waits, waited: [...(prev?.waited ?? []), ...ended] };
}

/** Days each team waited for `on`, ended and current waits together; teams that never waited are left out. */
export function waitedFor(teams: { id: string; snapshot?: TeamSnapshot | null }[], on: string, now: string): { team: string; days: number; waiting: boolean }[] {
  const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000;
  const mine = (refs: string[]) => refs.some((r) => r.startsWith(`${on}:`));
  return teams
    .filter((t) => t.id !== on && t.snapshot)
    .map((t) => {
      const ended = (t.snapshot!.waited ?? []).filter((w) => mine(w.on)).reduce((n, w) => n + days(w.from, w.to), 0);
      const open = (t.snapshot!.waits ?? []).filter((w) => mine(w.on));
      const total = ended + open.reduce((n, w) => n + days(w.since, now), 0);
      return { team: t.id, days: Math.round(total * 10) / 10, waiting: open.length > 0 };
    })
    .filter((x) => x.days > 0 || x.waiting);
}
