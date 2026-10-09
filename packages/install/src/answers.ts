// What the five setup screens collect, and the files it becomes. Nothing here talks to the host.

import { DEFAULT_FLOW_YAML, DEFAULT_SDD_ENGINE_YAML, DEFAULT_PLAIN_ENGINE_YAML, PLAIN_PROMPTS, parseConfig, parseRoles, type Issue } from "@sdlc-hub/core";

export interface SetupAnswers {
  host: "gitlab" | "github";
  /** gitlab.example.com, or a full address such as http://localhost:8929 */
  address: string;
  namespace: string;
  repoMode: "existing" | "new";
  repo: string;
  teams: { name: string; repo: string; kind: "backend" | "web" | "android" | "ios" | "desktop" | "other" }[];
  /** Index of the team that publishes the API contract, or -1. */
  contract: number;
  project: string;
  tracker: { type: "none" | "jira"; url?: string; key?: string; mirror?: boolean };
  links: { confluence?: string; figma?: string };
  assistants: { claude: true; codex: boolean; cursor: boolean };
  engine: "sdd" | "plain" | "custom";
  headless: boolean;
}

export const hostUrl = (address: string) => (/^https?:\/\//.test(address) ? address.replace(/\/+$/, "") : `https://${address.replace(/\/+$/, "")}`);

/** A team id made from its name, used in references such as backend:T2. */
export function teamId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "team";
}

/** What blocks the screen from moving on, in plain words; empty when it may. */
export function problem(a: SetupAnswers, screen: number): string {
  if (screen === 1) {
    if (!a.namespace.trim()) return `Enter the ${a.host === "gitlab" ? "group" : "organization"}`;
    if (!a.repo.trim()) return "Name the specifications repository";
    if (!a.teams.length) return "Add at least one team repository";
    if (a.teams.some((t) => !t.name.trim() || !t.repo.trim())) return "Every team needs a name and a repository";
    const repos = a.teams.map((t) => t.repo.trim().toLowerCase());
    if (repos.includes(a.repo.trim().toLowerCase())) return "A team repository cannot be the specifications repository";
    if (new Set(repos).size < repos.length) return "Two rows use the same repository";
    const ids = a.teams.map((t) => teamId(t.name));
    if (new Set(ids).size < ids.length) return "Two teams have the same name";
  }
  if (screen === 2) {
    if (!a.project.trim()) return "Enter the project name";
    if (a.tracker.type === "jira" && (!a.tracker.url?.trim() || !a.tracker.key?.trim())) return "Jira needs an address and a project key";
  }
  return "";
}

const q = (s: string) => (/^[\w./:@-]+$/.test(s) ? s : JSON.stringify(s));

export function configYaml(a: SetupAnswers): string {
  const ns = a.namespace.trim();
  const L = [
    "schema_version: 1",
    "git:",
    `  provider: ${a.host}`,
    `  host: ${q(a.address.trim())}`,
    `  namespace: ${q(ns)}`,
    `  repo: ${q(a.repo.trim())}`,
    "project:",
    `  name: ${q(a.project.trim())}`,
    "teams:",
  ];
  a.teams.forEach((t, i) => {
    L.push(`  - id: ${teamId(t.name)}`, `    name: ${q(t.name.trim())}`, `    repo: ${q(`${ns}/${t.repo.trim()}`)}`, `    kind: ${t.kind}`);
    if (a.contract === i) L.push("    api_contract: true");
  });
  L.push("tracker:", `  type: ${a.tracker.type}`);
  if (a.tracker.type === "jira") L.push(`  url: ${q(a.tracker.url!.trim())}`, `  project_key: ${q(a.tracker.key!.trim())}`, `  mirror_bugs: ${!!a.tracker.mirror}`);
  if (a.links.confluence?.trim() || a.links.figma?.trim()) {
    L.push("links:");
    if (a.links.confluence?.trim()) L.push(`  confluence: ${q(a.links.confluence.trim())}`);
    if (a.links.figma?.trim()) L.push(`  figma: ${q(a.links.figma.trim())}`);
  }
  const assts = ["claude", ...(a.assistants.codex ? ["codex"] : []), ...(a.assistants.cursor ? ["cursor"] : [])];
  L.push(`assistants: [${assts.join(", ")}]`, `engine: ${a.engine}`, "headless:", `  enabled: ${a.headless}`);
  return L.join("\n") + "\n";
}

export function rolesYaml(admin: { user: string; name: string }): string {
  return `schema_version: 1\npeople:\n  - user: ${q(admin.user)}\n    name: ${q(admin.name)}\n    role: admin\n`;
}

const CUSTOM_ENGINE = `# Fill in one command per stage before the first feature. See the specification, "Engine adapter".
id: custom
source: your/engine
version: "0.0.0"
artifacts: docs/features/{slug}
invoke:
  claude: "/engine:{stage} {slug}"
  codex: "$engine-{stage} {slug}"
  cursor: "/engine-{stage} {slug}"
${DEFAULT_SDD_ENGINE_YAML.slice(DEFAULT_SDD_ENGINE_YAML.indexOf("steps:"))}`;

/** The files of .hub/ for these answers, checked with core's validators. */
export function hubFiles(a: SetupAnswers, admin: { user: string; name: string }): { files: Record<string, string>; issues: Issue[] } {
  const files: Record<string, string> = {
    ".hub/config.yaml": configYaml(a),
    ".hub/roles.yaml": rolesYaml(admin),
    ".hub/flow.yaml": DEFAULT_FLOW_YAML,
    [`.hub/engines/${a.engine}.yaml`]: a.engine === "sdd" ? DEFAULT_SDD_ENGINE_YAML : a.engine === "plain" ? DEFAULT_PLAIN_ENGINE_YAML : CUSTOM_ENGINE,
  };
  // The plain engine's stages are prompt files the hub's stage command runs.
  if (a.engine === "plain") for (const [stage, text] of Object.entries(PLAIN_PROMPTS)) files[`.hub/engines/plain/${stage}.md`] = text;
  const issues = [...parseConfig(files[".hub/config.yaml"]!, ".hub/config.yaml").issues, ...parseRoles(files[".hub/roles.yaml"]!, ".hub/roles.yaml").issues];
  return { files, issues };
}

// --- sections the hub adds to files it does not own

const START = "<!-- sdlc-hub:start -->";
const END = "<!-- sdlc-hub:end -->";

/** Adds or replaces the hub's block in a Markdown file, leaving the rest as it was. */
export function withBlock(existing: string | null, block: string): string {
  const body = `${START}\n${block.trim()}\n${END}\n`;
  if (!existing) return body;
  const s = existing.indexOf(START);
  const e = existing.indexOf(END);
  if (s >= 0 && e > s) return existing.slice(0, s) + body + existing.slice(e + END.length).replace(/^\n/, "");
  return existing.replace(/\n*$/, "\n\n") + body;
}

export const CLAUDE_BLOCK = `## SDLC Hub

This repository holds the specifications and the SDLC Hub. Run \`node hub/cli.js serve\` to open the site at http://127.0.0.1:4173. The flow, roles and engine are in \`.hub/\`. Feature documents live in \`docs/features/<slug>/\`.

Work on a feature through the hub commands: \`/hub:status\` shows where every feature is and \`/hub:next <slug>\` runs your next step through the engine after the hub checks the gate. Sign-offs, returns and bugs go through \`/hub:signoff\`, \`/hub:return\` and \`/hub:bug\`, which save them through merge requests in your name. Never edit \`.hub/\`, \`hub/\` or \`signoffs.yaml\` by hand.`;

/** Adds a line to .gitignore once. */
export function withIgnore(existing: string | null, line: string): string {
  const text = existing ?? "";
  if (text.split("\n").some((l) => l.trim() === line)) return text;
  return text.replace(/\n*$/, text ? "\n" : "") + line + "\n";
}
