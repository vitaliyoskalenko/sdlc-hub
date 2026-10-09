// Lead time from the stage events in hub-state: when each step first started and last finished, and the feature's
// time from its first start to its release. A step that is running counts up to now.

import type { HubEvent } from "./schema/feature.ts";

export interface StepTime {
  step: string;
  started: string;
  finished?: string;
  hours: number;
}

const hoursBetween = (a: string, b: string) => Math.round(((Date.parse(b) - Date.parse(a)) / 36e5) * 10) / 10;

/** Steps in the order they first started. */
export function stepTimes(events: Pick<HubEvent, "step" | "event" | "at">[], now: string): StepTime[] {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const out = new Map<string, StepTime>();
  for (const e of sorted) {
    const t = out.get(e.step);
    if (e.event === "started" && !t) out.set(e.step, { step: e.step, started: e.at, hours: 0 });
    if (e.event === "finished" && t) t.finished = e.at;
    if (e.event === "started" && t) delete t.finished; // started again after a return: running until it finishes
  }
  for (const t of out.values()) t.hours = hoursBetween(t.started, t.finished ?? now);
  return [...out.values()];
}

export function featureTime(events: Pick<HubEvent, "at">[], now: string, released?: string): { started: string; finished?: string; days: number } | undefined {
  const first = events.map((e) => e.at).sort()[0];
  if (!first) return undefined;
  return { started: first, ...(released ? { finished: released } : {}), days: Math.round((hoursBetween(first, released ?? now) / 24) * 10) / 10 };
}
