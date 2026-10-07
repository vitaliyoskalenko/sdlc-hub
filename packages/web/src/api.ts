// The read-only API of the local server, and the live change events.

export type StepStatus = "done" | "running" | "signoff" | "returned" | "blocked" | "ready" | "todo" | "skipped" | "missed";
export type Assistant = "claude" | "codex" | "cursor";

export interface Person {
  user: string;
  name: string;
  roles: string[];
  team: string | null;
  lead: boolean;
  assistant?: Assistant;
}

export interface Session {
  me: (Person & { assistant: Assistant }) | null;
  demo: boolean;
  people: Person[];
  problem?: string;
}

export interface FlowStep {
  id: string;
  role: string;
  kind: "engine" | "hub";
  llm: boolean;
  gate: { role: string; by: string; text: string; returns_to?: string } | null;
  stages: string[];
}

export interface Team {
  id: string;
  name: string;
  repo: string;
  kind: string;
  api_contract?: boolean;
}

export interface ProjectInfo {
  project: { name: string; provider: "gitlab" | "github"; host: string; namespace: string; repo: string };
  flow: { lanes: string[]; watchDays: number; steps: FlowStep[] };
  teams: Team[];
  people: (Person & { assistant: Assistant })[];
  engine: { id: string; source: string; version: string; invoke: Record<Assistant, string> };
  tracker: { type: "none" | "jira"; url?: string; project_key?: string };
  headless: boolean;
  rules: { roles: Record<string, string[]>; lead: string[]; contractLead: string[] };
}

export interface Summary {
  slug: string;
  title: string;
  size: string | null;
  route: string;
  routeDefaulted: boolean;
  current: string;
  index: number;
  status: StepStatus;
  role: string | null;
  waitingOn: string[];
  by: string | null;
  reason: string | null;
  released: boolean;
  progress: number;
  waits: number;
  blockingBugs: string[];
  cycle: number;
  warnings: number;
  statuses: StepStatus[];
}

export interface StepState {
  id: string;
  role: string;
  status: StepStatus;
  by?: string;
  source?: "specs" | "hub-state" | "local-clone";
  waitingOn?: string[];
  reason?: string;
  stale?: boolean;
}

export interface TrackerRow {
  id: string;
  title?: string;
  status: "todo" | "in_progress" | "blocked" | "review" | "done";
  blocked_by: string[];
}

export interface SddTask {
  id: string;
  title: string;
  layer: string;
  deps: string[];
  acs: string[];
}

export interface TeamState {
  id: string;
  source: "hub-state" | "local-clone" | "none";
  snapshot?: { files: string[]; tasks: SddTask[] | null; tracker: TrackerRow[] | null; review: { verdict: string } | null; mr: { iid: number; state: string; author?: string } | null };
}

export interface FeatureState {
  slug: string;
  title?: string;
  size?: string;
  route: string;
  routeDefaulted: boolean;
  steps: StepState[];
  current: string;
  cycle: number;
  contractTeam: string | null;
  teams: TeamState[];
  waits: { team: string; task: string; on: string; known: boolean; done: boolean }[];
  testRuns: { source: "ci" | "local"; team: string; passed: number; failed: number; at: string }[];
  blockingBugs: string[];
  warnings: string[];
  issues: { level: string; file: string; line?: number; message: string }[];
}

export interface FeatureFile {
  title: string;
  owner: string;
  teams?: Record<string, { lead: string }>;
  links?: { jira?: string; confluence?: string; figma?: string; staging?: string };
  estimate?: { days?: number; tokens_m?: [number, number] };
  ui?: boolean;
}

export interface FeatureDetail {
  feature: FeatureFile | null;
  state: FeatureState;
  summary: Summary;
  documents: { path: string; owner: string; signoff: "current" | "stale" | "none" }[];
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

export const api = {
  session: (as?: string) => get<Session>(`/api/session${as ? `?as=${encodeURIComponent(as)}` : ""}`),
  project: () => get<ProjectInfo>("/api/project"),
  features: () => get<{ features: Summary[]; now: string }>("/api/features"),
  feature: (slug: string) => get<FeatureDetail>(`/api/features/${encodeURIComponent(slug)}`),
  async file(slug: string, path: string): Promise<string | null> {
    const r = await fetch(`/api/features/${encodeURIComponent(slug)}/file?path=${encodeURIComponent(path)}`, { credentials: "same-origin" });
    return r.ok ? r.text() : null;
  },
};

/** Calls `onChange` whenever the server says the files changed. Returns a function that stops listening. */
export function onChanges(onChange: () => void, onLive: (live: boolean) => void): () => void {
  const es = new EventSource("/api/events");
  es.addEventListener("changed", onChange);
  es.onopen = () => onLive(true);
  es.onerror = () => onLive(false);
  return () => es.close();
}
