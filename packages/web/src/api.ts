// The API of the local server, and the live change events. Saves go through actions that push a merge request.

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
  crossWaits: { on: string; teams: string[]; tasks: { team: string; task: string }[] }[];
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

export interface TestRun {
  source: "ci" | "local";
  team: string;
  platform?: string;
  result: "passed" | "failed";
  passed?: number;
  failed?: number;
  at: string;
  url?: string;
  ref?: string;
  user?: string;
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
  testRuns: TestRun[];
  bugs: { id: string; title: string; ac?: string; platforms?: string[]; team: string; severity: string; status: string }[];
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
  /** Steps whose gate waits for a sign-off now. */
  awaiting: string[];
  qa: { matrix: Matrix; decisions: SignoffEntry[] };
  release: ReleaseInfo;
}

export interface VerdictRecord {
  ac: string;
  platform: string;
  verdict: "pass" | "fail" | "na";
  bugs?: string[];
  user: string;
  at: string;
}

export interface Matrix {
  platforms: string[];
  criteria: { id: string; text: string; cells: Record<string, VerdictRecord | null> }[];
  complete: boolean;
  open: string[];
}

export interface SignoffEntry {
  step: string;
  user: string;
  at: string;
  decision: "pass" | "return" | "confirm";
  reason?: string;
  bugs?: string[];
  cycle?: number;
}

export interface ReleaseInfo {
  staging?: { smoke: "pending" | "passed" | "failed"; at?: string };
  checklist: { item: string; done: boolean; user?: string; at?: string }[];
  go?: { value: "go" | "no-go"; user: string; at: string };
  rollout?: { stage: number; at?: string };
  watch?: { started: string; days: number };
  watchEnds: string | null;
  now: string;
}

export interface Finding {
  user: string;
  path: string;
  reason: string;
  line?: number;
}

export interface Save {
  branch: string;
  title: string;
  user: string;
  paths: string[];
  at: string;
  state: "pending" | "merged" | "refused";
  meta?: Record<string, string>;
  mr?: { iid: number; url: string };
  findings?: Finding[];
}

export interface PersonRow {
  user: string;
  name: string;
  roles: string[];
  team: string | null;
  lead: boolean;
  os: "macos" | "linux" | "windows" | null;
  assistant: Assistant;
  /** What hub setup reported from the person's machine, through hub-state. */
  setup: { setup_at: string; release: string; assistant: string; platform: string } | null;
}

export interface PersonInput {
  user: string;
  name: string;
  roles: string[];
  team?: string;
  lead?: boolean;
  os?: string;
  assistant?: string;
}

/** The answer to an action: the save, or why it was not made. */
export type ActionResult = { ok: true; save: Save } | { ok: false; error: string; findings?: Finding[] };

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

const asQuery = (as?: string) => (as ? `?as=${encodeURIComponent(as)}` : "");

/** A save through the server: a branch whose merge request merges itself, or why it was not made. */
async function action(name: string, as: string | undefined, body: unknown): Promise<ActionResult> {
  const r = await fetch(`/api/actions/${name}${asQuery(as)}`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await r.json().catch(() => ({}))) as { save?: Save; error?: string; findings?: Finding[] };
  return r.ok && data.save ? { ok: true, save: data.save } : { ok: false, error: data.error ?? `The server answered ${r.status}`, ...(data.findings ? { findings: data.findings } : {}) };
}

export const api = {
  /** My saves; `as` matters only in the demo. */
  saves: (as?: string) => get<{ saves: Save[]; enabled: boolean }>(`/api/saves${asQuery(as)}`),
  signoff: (as: string | undefined, body: { slug: string; step: string; decision: "pass" | "return"; reason?: string }) => action("signoff", as, body),
  person: (as: string | undefined, body: { kind: "set"; person: PersonInput } | { kind: "remove"; user: string }) => action("person", as, body),
  people: () => get<{ people: PersonRow[]; release: string }>("/api/people"),
  /** Any other save: verdicts, bug, bug-edit, release. */
  act: (name: "verdicts" | "bug" | "bug-edit" | "release" | "signoff", as: string | undefined, body: unknown) => action(name, as, body),
  script: (user: string, shell: "bash" | "powershell", as?: string) =>
    get<{ name: string; text: string; release: string }>(`/api/script?user=${encodeURIComponent(user)}&shell=${shell}${as ? `&as=${encodeURIComponent(as)}` : ""}`),
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
  es.addEventListener("saves", onChange);
  es.onopen = () => onLive(true);
  es.onerror = () => onLive(false);
  return () => es.close();
}
