// Open totals for everyone, published by the admin's or the PM's machine at sync: by feature, step, role, team,
// model, assistant, and feature with step. A group of fewer than three people is merged into "other", so a total
// never shows one person; an "other" that still has fewer than three is left out, since it could be read back too.

import { costOf, addTokens, ZERO, type Price, type Tokens } from "./prices.ts";
import type { UsageRecord } from "./collect.ts";

export const DIMENSIONS = ["feature", "step", "role", "team", "model", "assistant", "feature-step"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export interface TotalRow {
  month: string;
  dimension: Dimension;
  /** The feature, step, role and so on; "other" for the small groups; "feature/step" for feature-step. */
  key: string;
  /** How many people, never who. */
  people: number;
  messages: number;
  tokens: Tokens;
  /** USD at list prices; null when a model in the group has no price. */
  cost: number | null;
}

export const MIN_GROUP = 3;

const keyOf = (r: UsageRecord, d: Dimension): string => {
  switch (d) {
    case "feature":
      return r.slug ?? "(no feature)";
    case "step":
      return r.step ?? "(no step)";
    case "role":
      return r.role;
    case "team":
      return r.team ?? "(no team)";
    case "model":
      return r.model;
    case "assistant":
      return r.assistant;
    case "feature-step":
      return `${r.slug ?? "(no feature)"}/${r.step ?? "(no step)"}`;
  }
};

interface Group {
  people: Set<string>;
  messages: number;
  tokens: Tokens;
  cost: number | null;
}

const add = (g: Group | undefined, user: string, r: UsageRecord, prices?: Record<string, Price>): Group => {
  const c = costOf(r.model, r.tokens, prices);
  const base = g ?? { people: new Set<string>(), messages: 0, tokens: ZERO, cost: 0 };
  base.people.add(user);
  return { people: base.people, messages: base.messages + r.messages, tokens: addTokens(base.tokens, r.tokens), cost: base.cost === null || c === undefined ? null : base.cost + c };
};
const merge = (a: Group | undefined, b: Group): Group => {
  if (!a) return { ...b, people: new Set(b.people) };
  return { people: new Set([...a.people, ...b.people]), messages: a.messages + b.messages, tokens: addTokens(a.tokens, b.tokens), cost: a.cost === null || b.cost === null ? null : a.cost + b.cost };
};

/** The records of one month, each with its person, into the open totals. */
export function openTotals(month: string, records: { user: string; record: UsageRecord }[], prices?: Record<string, Price>): TotalRow[] {
  const rows: TotalRow[] = [];
  for (const d of DIMENSIONS) {
    const groups = new Map<string, Group>();
    for (const { user, record } of records) groups.set(keyOf(record, d), add(groups.get(keyOf(record, d)), user, record, prices));
    let other: Group | undefined;
    for (const [key, g] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
      if (g.people.size >= MIN_GROUP) rows.push({ month, dimension: d, key, people: g.people.size, messages: g.messages, tokens: g.tokens, cost: g.cost });
      else other = merge(other, g);
    }
    if (other && other.people.size >= MIN_GROUP) rows.push({ month, dimension: d, key: "other", people: other.people.size, messages: other.messages, tokens: other.tokens, cost: other.cost });
  }
  return rows;
}
