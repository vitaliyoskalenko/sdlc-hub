# SDLC Hub

A local web site plus a code-assistant plugin that live inside a team's `product-specs` git repository and show the whole AI-assisted, spec-driven development flow of every feature. This repository is the product itself. It starts from a finished design: a specification and three clickable prototypes. No product code exists yet.

Write everything (code, comments, docs, UI text) in English. Talk to the owner in Ukrainian unless he writes in English.

## Read first

1. `docs/specification.md` — the specification, revision 56. The copy in this repository is the source of truth; the published copy is a snapshot. The two diagrams are missing from the export (placeholders in the text).
2. `docs/decisions.md` — a dated log of what was decided and why. Add an entry whenever a decision changes the specification.
3. `docs/open-items.md` — what is still not done or not verified, with the phase each unverified claim blocks.
4. `prototypes/` — what every screen looks like and how it behaves. Treat them as the UI reference, not as code to keep. They predate revision 51 and 52; where they differ, the specification wins.

## The product in ten lines

- Git is the only database. Human edits reach `main` through merge requests that merge by themselves when the `hub-guard` CI job passes. Machine data (test runs, team snapshots, usage) goes to a `hub-state` branch, which is a display cache and is never trusted for a gate.
- Four parts: `hub` CLI, local server (`node hub/cli.js serve`, loopback only, port 4173), web app, assistant plugin with an MCP server. One TypeScript codebase, Node 22+ (Node 20 reached end of life on 2026-04-30).
- The plugin gives the commands `start, status, next, run, new, validate, signoff, return, bug, verify, test, decide, release, sync, doctor` as `/hub:x` (Claude Code), `$hub-x` (Codex), `/hub-x` (Cursor).
- Stages are proxied to an engine through one adapter file. Default engine: `genkovich/sdd` 2.3.x. The engine must stay replaceable.
- A feature moves through 20 steps in six role lanes (PO/analyst, PM, designer, engineering, QA, Ops). The current step is derived from files, never typed. The table is in the specification, "The twenty steps".
- Roles decide which paths a person may change. Enforcement is the CI guard, because GitLab Free has no Code Owners.
- The team runs self-managed GitLab, Free tier. GitHub must work too; the host is chosen at the first install. The version 1 install is GitLab only; the GitHub install comes in phase 5.
- First install: `npx sdlc-hub init` opens a local setup page with five screens. After it the admin adds people and generates one setup script per person (no secrets in it).
- The hub is vendored into `product-specs/hub/` as one bundled file. Nothing is fetched from a registry on a person's machine after the first install.
- Per-person spend is visible to the admin and the PM only (records encrypted with `age`).

## Decisions already taken (do not reopen without asking)

| Topic | Decision |
|---|---|
| State | Shared through git, no server |
| Git host | GitLab self-managed Free for this team; GitHub supported |
| LLM from the site | Copy-prompt by default; headless only when the admin enables it; version 1 headless = validation only |
| Tasks and bugs | Files in the repository; Jira optional (none or Jira) |
| Stack | Node.js and TypeScript |
| Autotests | CI is the gate; local runs are recorded and labelled local |
| Spend | Per person: admin and PM only |
| Team repositories | A free list set at install, not fixed to four |
| Language | English everywhere |
| Later decisions | See `docs/decisions.md` (phase 1 split, step ids, epic, cross-team waits, go or no-go, sign-off hash, privacy scope) |

## Where to start

Follow the delivery plan in the specification. Phase 0 needs no code (one feature by hand with SDD). Phase 1a is built: `npm run demo -- --as <user>` starts the read-only site on the demo fixture (see `README.md`). The plan for phase 1:

1. Phase 1a. Scaffold the TypeScript workspace (npm workspaces): `packages/core` (data model, adapter, step detection, roles), `packages/git`, `packages/server`, `packages/web` (Preact + Vite), `packages/cli`.
2. `core`: types and validators for `.hub/config.yaml`, `roles.yaml`, `flow.yaml`, `engines/*.yaml`, `feature.yaml`, `signoffs.yaml`, bugs, `release.yaml` and the `hub-state` records; the SDD adapter; step detection from product-specs, team snapshots and local clones. Write it test-first against fixture repositories.
3. `server` + `web`: Home, Features (list and graph), Feature (Flow, Documents, Tasks), Your guide, command help. Read only. `hub report` builds a team snapshot.
4. Phase 1b: `packages/host` (GitLab), the setup site and the GitLab install. GitHub stops before Install.
5. Then phase 2: saving through merge requests, `hub-guard`, the plugin for Claude Code, People and setup scripts.

Before building anything that depends on a claim in "Claims to check during the build" (specification) or in `docs/open-items.md`, verify the claim against the real GitLab instance or the vendor's current documentation.

## Prototypes

Each prototype is one HTML fragment (title, style, markup, one script; no html/head/body tags), written for the Claude Artifact host.

| Folder | What | Published as |
|---|---|---|
| `prototypes/hub/` | The hub: Home, Features, Feature tabs, task page, command help, People, Settings | https://claude.ai/artifact/LpRJVwGi6dpGA8FQj9jT4M |
| `prototypes/setup/` | The first-install site, five screens, GitLab and GitHub | https://claude.ai/artifact/CRooJPqe8cPfLMk1m7z3FA |
| `prototypes/map/` | The AI-SDLC map the flow comes from: `ai-sdlc-v2.html` (current) and `ai-sdlc-compact.html` (version 1) | https://claude.ai/artifact/BtA2hz1Z5mMiucVJo1bwKQ and https://claude.ai/artifact/MBfGmAkdqb2Y4yFvQ93nQT |

The specification as a live document: https://claude.ai/code/artifact/7e0ef680-c527-4602-8dc1-ca47aa150bd6. The artifact links are private to the owner's account.

To open a prototype locally and run its checks (Python 3, `pip install playwright`, `playwright install chromium`):

```
python3 prototypes/hub/test_walk.py        # every person, page, task page and help dialog; writes preview.html
python3 prototypes/hub/test_scenarios.py   # sign-off, return, pass, release, GitHub wording, add person
python3 prototypes/setup/test_walk.py      # both hosts, validation, Free plan, install
python3 prototypes/map/build_v2.py         # rebuilds ai-sdlc-v2.html from its sources
```

Open the generated `preview.html` (or `setup-preview.html`) in a browser to click through. In the hub, "Prototype · view as" switches between ten sample people.

## Conventions

- Plain language in UI text: short sentences, the name the user knows, a reason beside every disabled control.
- Mono type for anything typed or stored (commands, paths, file names).
- Words on GitLab: merge request, pipeline, group. On GitHub: pull request, workflow run, organization. Keep host words in one adapter.
- Never put a token, key or password in the repository, a setup script or the site.
- Commits carry no `Co-Authored-By` line and no AI attribution. Never push unless the owner asks.
- Test first; commit after each green step. `npm test`, `npm run typecheck` and `npm run e2e` must pass.
- Assumptions about real SDD output are tagged `@assumed-sdd-format` and live only in `packages/core/src/sdd.ts` and its tests.
