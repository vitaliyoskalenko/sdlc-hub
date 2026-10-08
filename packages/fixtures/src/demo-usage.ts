// A month of made-up token usage for the demo's Costs screen: who worked on which step of which feature, with which
// model. The demo encrypts it at start with a key it makes then; nothing secret is stored here.

export interface DemoUsage {
  user: string;
  role: string;
  team?: string;
  slug: string;
  step: string;
  model: string;
  /** Millions of tokens: input, cache writes (1h), cache reads, output. */
  m: [number, number, number, number];
}

const opus = "claude-opus-5-5";
const sonnet = "claude-sonnet-5-5";
const haiku = "claude-haiku-4-5-20251001";

export const DEMO_USAGE_MONTH = "2026-10";

export const DEMO_USAGE: DemoUsage[] = [
  // tasks-issues: the whole flow, many people.
  { user: "olena.k", role: "po", slug: "tasks-issues", step: "specify", model: opus, m: [0.01, 0.4, 3.1, 0.06] },
  { user: "olena.k", role: "po", slug: "tasks-issues", step: "clarify", model: opus, m: [0.01, 0.2, 1.8, 0.03] },
  { user: "daria.l", role: "designer", slug: "tasks-issues", step: "ux-flows", model: opus, m: [0.01, 0.3, 2.2, 0.05] },
  { user: "taras.m", role: "dev", team: "backend", slug: "tasks-issues", step: "tech-design", model: opus, m: [0.02, 0.6, 5.4, 0.09] },
  ...["taras.m:backend", "petro.v:web", "andrii.p:android", "sofiia.h:ios"].flatMap((x, i) => {
    const [user, team] = x.split(":") as [string, string];
    return [
      { user, role: "dev", team, slug: "tasks-issues", step: "tasks", model: sonnet, m: [0.01, 0.2, 1.2 + i * 0.1, 0.03] as [number, number, number, number] },
      { user, role: "dev", team, slug: "tasks-issues", step: "implement", model: opus, m: [0.05, 1.4 + i * 0.2, 18 + i * 3, 0.32 + i * 0.04] as [number, number, number, number] },
      { user, role: "dev", team, slug: "tasks-issues", step: "review", model: sonnet, m: [0.02, 0.4, 4.2, 0.07] as [number, number, number, number] },
      { user, role: "dev", team, slug: "tasks-issues", step: "fix", model: haiku, m: [0.01, 0.1, 0.9, 0.02] as [number, number, number, number] },
    ];
  }),
  { user: "iryna.s", role: "qa", slug: "tasks-issues", step: "plan-tests", model: opus, m: [0.01, 0.3, 2.4, 0.05] },
  { user: "iryna.s", role: "qa", slug: "tasks-issues", step: "verify", model: opus, m: [0.03, 0.9, 9.6, 0.14] },
  // bulk-order-export: implement is running in four teams.
  ...["taras.m:backend", "petro.v:web", "andrii.p:android", "sofiia.h:ios"].map((x, i) => {
    const [user, team] = x.split(":") as [string, string];
    return { user, role: "dev", team, slug: "bulk-order-export", step: "implement", model: opus, m: [0.03, 0.8, 11 + i * 2, 0.18] as [number, number, number, number] };
  }),
  // returns-portal: one person so far, so its totals stay inside "other".
  { user: "olena.k", role: "po", slug: "returns-portal", step: "specify", model: opus, m: [0.01, 0.5, 3.8, 0.07] },
];
