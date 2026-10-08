// The setup script the admin generates for one person, for macOS and Linux (bash) or Windows (PowerShell). It
// carries who the person is and where the repositories live, and never a token, key or password, so it can travel
// by chat or e-mail. Each step checks before it acts, so it is safe to run again. See "What the script does".

import type { Config, Person } from "./schema/project.ts";

export type ScriptShell = "bash" | "powershell";

export interface ScriptInput {
  config: Config;
  person: Person;
  shell: ScriptShell;
  /** The hub release the script expects: a short hash of hub/cli.js on main. */
  release: string;
  /** YYYY-MM-DD and the admin's user, for the header. */
  date: string;
  by: string;
}

const ASSISTANT: Record<string, { bin: string; name: string; bash: string; ps: string }> = {
  claude: { bin: "claude", name: "Claude Code", bash: "curl -fsSL https://claude.ai/install.sh | bash", ps: "irm https://claude.ai/install.ps1 | iex" },
  codex: { bin: "codex", name: "Codex", bash: "npm install -g @openai/codex", ps: "npm install -g @openai/codex" },
  cursor: { bin: "agent", name: "Cursor CLI", bash: "see https://cursor.com/cli", ps: "see https://cursor.com/cli" },
};

/** The address of the git host, with its scheme: config.yaml may hold a bare host name. */
export const hostAddress = (host: string) => (/^[a-z][a-z0-9+.-]*:\/\//.test(host) ? host.replace(/\/+$/, "") : `https://${host}`);

/** The team repositories a person clones: their own team's, or every team's for QA, Ops and the admin. */
export function reposFor(config: Config, person: Person): string[] {
  const all = config.teams.map((t) => t.repo);
  if (person.roles.some((r) => r === "qa" || r === "ops" || r === "admin")) return all;
  if (person.roles.includes("dev") && person.team) return config.teams.filter((t) => t.id === person.team).map((t) => t.repo);
  return [];
}

export const scriptName = (user: string, shell: ScriptShell) => `setup-${user}.${shell === "bash" ? "sh" : "ps1"}`;

/** Only plain values reach the script: a username, a path or a repository never needs quotes or a dollar sign. */
function plain(label: string, v: string): string {
  if (!/^[A-Za-z0-9 ._:/@-]*$/.test(v)) throw new Error(`${label} "${v}" has characters a setup script cannot carry`);
  return v;
}

export function setupScript(i: ScriptInput): string {
  const { config, person } = i;
  const a = ASSISTANT[person.assistant ?? "claude"]!;
  const specs = `${config.git.namespace}/${config.git.repo}`;
  const v = {
    provider: plain("provider", config.git.provider),
    host: plain("host", hostAddress(config.git.host)),
    specs: plain("repository", specs),
    user: plain("user", person.user),
    roles: plain("roles", person.roles.join(" ")),
    repos: reposFor(config, person).map((r) => plain("repository", r)),
    assistant: plain("assistant", person.assistant ?? "claude"),
    release: plain("release", i.release),
    group: plain("group", config.git.namespace.split("/").pop()!),
    dir: plain("repository", config.git.repo),
  };
  const header = `SDLC Hub setup for ${v.user} (${v.roles}). Generated ${plain("date", i.date)} by ${plain("admin", i.by)}. Contains no secrets. Safe to run again.`;
  if (i.shell === "bash")
    return `#!/usr/bin/env bash
# ${header}
set -euo pipefail

HUB_GIT_PROVIDER="${v.provider}"
HUB_GIT_HOST="${v.host}"
HUB_REPO="${v.specs}"
HUB_USER="${v.user}"
HUB_ROLES="${v.roles}"
HUB_TEAM_REPOS="${v.repos.join(" ")}"
HUB_ASSISTANT="${v.assistant}"
HUB_RELEASE="${v.release}"
WORK="\${HUB_WORK:-$HOME/work/${v.group}}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1. $2"; exit 1; }; }

echo "1/6 Checking what is installed"
need git "Install it from https://git-scm.com/downloads"
need node "Install Node.js 22 or newer from https://nodejs.org"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' || { echo "Node.js 22 or newer is needed; you have $(node --version). Install it from https://nodejs.org"; exit 1; }
need ${a.bin} "Install ${a.name}: ${a.bash}"

echo "2/6 Signing in to $HUB_GIT_HOST (your git credential manager or SSH key; nothing is stored in this script)"
git ls-remote "$HUB_GIT_HOST/$HUB_REPO.git" HEAD >/dev/null || { echo "Could not reach $HUB_REPO. Sign in to $HUB_GIT_HOST with git, or ask the admin to add you to the group."; exit 1; }

echo "3/6 Cloning into $WORK"
mkdir -p "$WORK"
cd "$WORK"
for r in "$HUB_REPO" $HUB_TEAM_REPOS; do
  d="$(basename "$r")"
  if [ -d "$d/.git" ]; then
    git -C "$d" pull --ff-only -q || echo "  $d has changes of its own; left as it is"
  else
    git clone -q "$HUB_GIT_HOST/$r.git" "$d"
  fi
done

echo "4/6 Checking your role on main, and writing the files for your role and assistant"
cd "$WORK/${v.dir}"
node hub/cli.js setup --user "$HUB_USER" --roles "$HUB_ROLES" --assistant "$HUB_ASSISTANT" --release "$HUB_RELEASE"

echo "5/6 Health check"
node hub/cli.js doctor

echo "6/6 Opening the site on your guide (Ctrl+C stops it; /hub:start starts it again)"
[ -n "\${HUB_NO_START:-}" ] || node hub/cli.js serve --open /guide
`;
  const list = v.repos.map((r) => `"${r}"`).join(", ");
  return `# ${header}
$ErrorActionPreference = "Stop"

$HubProvider  = "${v.provider}"
$HubGitHost   = "${v.host}"
$HubRepo      = "${v.specs}"
$HubUser      = "${v.user}"
$HubRoles     = "${v.roles}"
$HubTeamRepos = @(${list})
$HubAssistant = "${v.assistant}"
$HubRelease   = "${v.release}"
$Work         = if ($env:HUB_WORK) { $env:HUB_WORK } else { Join-Path $HOME "work\\${v.group}" }

function Need($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Write-Host "Missing: $cmd. $hint"; exit 1 }
}
function Run { & $args[0] $args[1..($args.Count - 1)]; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }

Write-Host "1/6 Checking what is installed"
Need git "winget install Git.Git"
Need node "winget install OpenJS.NodeJS.LTS"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'
if ($LASTEXITCODE -ne 0) { Write-Host "Node.js 22 or newer is needed. winget install OpenJS.NodeJS.LTS"; exit 1 }
Need ${a.bin} "Install ${a.name}: ${a.ps}"

Write-Host "2/6 Signing in to $HubGitHost (Git Credential Manager or SSH key; nothing is stored in this script)"
git ls-remote "$HubGitHost/$HubRepo.git" HEAD | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "Could not reach $HubRepo. Sign in to $HubGitHost with git, or ask the admin to add you to the group."; exit 1 }

Write-Host "3/6 Cloning into $Work"
New-Item -ItemType Directory -Force -Path $Work | Out-Null
Set-Location $Work
foreach ($r in @($HubRepo) + $HubTeamRepos) {
  $d = Split-Path $r -Leaf
  if (Test-Path (Join-Path $d ".git")) {
    git -C $d pull --ff-only -q
    if ($LASTEXITCODE -ne 0) { Write-Host "  $d has changes of its own; left as it is" }
  } else { Run git clone -q "$HubGitHost/$r.git" $d }
}

Write-Host "4/6 Checking your role on main, and writing the files for your role and assistant"
Set-Location (Join-Path $Work "${v.dir}")
Run node hub/cli.js setup --user $HubUser --roles $HubRoles --assistant $HubAssistant --release $HubRelease

Write-Host "5/6 Health check"
Run node hub/cli.js doctor

Write-Host "6/6 Opening the site on your guide (Ctrl+C stops it; /hub:start starts it again)"
if (-not $env:HUB_NO_START) { node hub/cli.js serve --open /guide }
`;
}
