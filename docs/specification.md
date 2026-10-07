# SDLC Hub Specification

Oct 7, 2026 · @Vitaliy · revision 51

This file in the repository is the source of truth. The published copy is a snapshot. Every decision that changed it is logged with its date and reason in `docs/decisions.md`.

SDLC Hub is a local web app and an assistant plugin that live inside the `product-specs` repository and show the whole AI-assisted development flow of every feature: stage by role, documents, tasks, QA, release and token cost. Git is the only database, the code assistant does all LLM work, and `genkovich/sdd` runs the stages behind a replaceable adapter.

## At a glance

&#91;embedded content: architecture · a local machine and GitLab, seven parts\]

Each person runs the same parts on their own machine. Human edits reach `main` only through a merge request that the guard job must pass, and machine data goes straight to `hub-state`.

## Goals and non-goals

The hub makes the flow from the AI-SDLC map visible and operable for every role, without adding a server anyone has to run.

**Goals**

- Show the current state of every feature on a local website: stage by role, documents, tasks with dependencies, QA, autotests and release.
- Give each role its own dashboard: next actions, progress, estimates against actuals, tokens and cost.
- Keep all LLM work in the code assistant. The site hands over ready prompts and, when the admin allows it, starts the assistant itself.
- Allow small edits on the site that need no LLM, and flag every document a change may have invalidated.
- Wrap `genkovich/sdd` behind an adapter, so another engine can replace it through configuration.
- Offer the same commands and files in Claude Code, Codex and Cursor. How much usage data each one reports differs.
- Set a person up with one script the admin generates for their role and operating system.
- Enforce who may change which files on self-managed GitLab Free.

**Non-goals**

- No central server, database or separate sign-in.
- No replacement for Jira, Confluence or Figma. The hub links to them and can mirror data one way.
- No LLM calls from the browser and no API keys in the site.
- No change to how the SDD stages work inside.

## Decisions taken

Eight answers from the kickoff fix the shape of the system.

| Question | Decision | What it implies |
| --- | --- | --- |
| How state reaches everyone | Through git | State is files. People see changes after a pull. Human edits go to `main`, machine data to a `hub-state` branch. |
| Git host | GitLab, self-managed, Free tier. Asked at init, with GitHub as the other choice | No Code Owners, required approvals or push rules. Enforcement is a CI path guard plus "Pipelines must succeed", with an optional server hook. |
| LLM runs from the site | Both ways | Copying a prompt is the default. Starting the assistant from the site is a setting only the admin turns on. |
| Tasks and bugs | Repository first, Jira optional | Bugs, sign-offs and release state are files. Jira gets links or a one-way mirror. |
| Stack | Node.js and TypeScript | One codebase for the CLI, server, web app and MCP server. Node 20 or newer on every machine. |
| Autotests | GitLab CI and local runs | CI is the gate. Local runs are recorded and labelled as local. |
| Per-person spend | Admin and PM only | Totals by feature, step and role are open. Per-person records are encrypted to the admin and PM keys. |
| Language | English | Specification, UI and generated files are in English. `artifact_language` for SDD documents stays configurable. |

## Architecture

Five components share one Node.js codebase, and none of them is a hosted service.

| Component | Where it runs | Responsibility |
| --- | --- | --- |
| `hub` CLI | Each person's machine | `init`, `setup`, `serve`, `sync`, `guard`, `doctor`, `script`, `usage`. Every plugin command ends in a CLI or server call. |
| Local server | `127.0.0.1:4173`, started by `hub serve` | Reads the working tree and the `hub-state` branch, watches files, serves the web app with a REST and SSE API, makes git and GitLab API calls, starts the assistant headless when allowed. |
| Web app | The browser, served by the local server | Dashboards, flow map, documents, tasks graph, QA, release, costs and admin screens. |
| Assistant plugin | Inside Claude Code, Codex or Cursor | Commands, hooks that record stage start, finish and usage, and an MCP server through which the assistant asks the local server what to do next. |
| CI jobs | GitLab runners | `hub-guard` checks changed paths against roles, `hub-validate` checks file schemas, `hub-fanout` copies shared files to the team repositories, `hub-report` in each team repository publishes tasks, merge request, pipeline and test state. |

**How a change travels**

1. A person saves an edit on the site or the assistant commits a stage result.
2. The local server puts it on a branch, pushes it and opens a merge request set to merge when the pipeline succeeds.
3. `hub-guard` passes if every changed path is allowed for that person's role, and the merge request merges itself.
4. Machine data (test runs, team snapshots, usage) skips the merge request and goes straight to the `hub-state` branch.
5. Every other local server picks both up on its next sync and updates the page over SSE.

The local server binds to the loopback address only and never accepts connections from the network.

## Repository layout

One clone of `product-specs` contains the specifications, the hub's own data and a pinned release of the hub itself.

```text
product-specs/                             branch: main (human edits, through merge requests)
├─ CONTEXT.md                               project-wide glossary (SDD glossary, root level)
├─ docs/
│  ├─ roadmap.md  design-system.md
│  └─ features/<slug>/
│     ├─ spec.md  .size  .route             written by specify; .size and .route are one bare word each
│     ├─ CONTEXT.md                         feature glossary (SDD glossary, feature level)
│     ├─ ux-flows.md  screens.md  test-plan.md     test-plan.md for size M and up only
│     ├─ sad.md  adr/  data-model.md  migrations/  _audit/  contracts/
│     │                                     published by merge request from the contract team's repository
│     └─ hub/
│        ├─ feature.yaml                    title, owner, teams and leads, links, estimates
│        ├─ signoffs.yaml                   gates passed or returned: who, when, content hash
│        ├─ bugs/BUG-0012.md                one file per bug
│        ├─ release.yaml                    staging, checklist, go or no-go, versions, rollout
│        └─ validation/2026-10-07.md        reports from /hub:validate
├─ .hub/
│  ├─ config.yaml                           project, repositories, assistants, integrations, prices
│  ├─ roles.yaml                            people, roles, path rules
│  ├─ flow.yaml                             steps, lanes, gates, return paths, watch period
│  ├─ engines/sdd.yaml                      adapter for genkovich/sdd
│  ├─ prompts/<step>.md                     prompt templates
│  ├─ keys/<user>-<machine>.pub             age public keys for per-person usage
│  └─ install.log                           steps of the first install, for a resumed run
├─ hub/                                     vendored release of the hub
│  ├─ cli.js                                one bundled file: CLI, server, web app, MCP server
│  └─ plugin/                               Claude Code plugin: skills, hooks, .mcp.json
├─ .claude-plugin/marketplace.json          lists the hub plugin from ./hub/plugin
├─ .claude/settings.json                    marketplaces, enabled plugins, shared rules
├─ .agents/skills/hub-*/                    generated for Codex
├─ .codex/config.toml  .codex/hooks.json
├─ .cursor/skills/hub-*/  .cursor/mcp.json  .cursor/hooks.json
├─ .gitignore                               includes .claude/sdd.local.md, added by setup
└─ AGENTS.md  CLAUDE.md

each team repository, docs/features/<slug>/ (written by the SDD stages there)
├─ spec.md  ux-flows.md  screens.md  test-plan.md  contracts/   read-only copies from hub-fanout
├─ sad.md  adr/                             the team's own design (client teams at the tasks step)
├─ tasks.json  tasks/_epic.md  tasks/tracker.md  tasks/<task>.md
├─ _review/review-<date>.md                 review record with the verdict PASS or CHANGES REQUESTED
├─ _fixes/<date>-<short-slug>.md            fix records
└─ in the contract team only: sad.md, adr/, data-model.md, migrations/, _audit/, contracts/
   for steps 5 to 7, before the contract merge request carries them to product-specs

branch: hub-state (machine-written, never merged into main)
├─ features/<slug>/teams/<team>.json        tasks, tracker statuses, cross-team references, review verdict, merge request, pipeline
├─ features/<slug>/tests/<run>.json         CI and local test runs
├─ features/<slug>/events.jsonl             stage start and finish, returns; no username, no token counts
├─ metrics/<yyyy-mm>/usage.jsonl            open totals by feature, step, role, assistant
├─ metrics/<yyyy-mm>/<user>.jsonl.age       per-person usage, one file per person and month, encrypted
└─ people/<user>.json                       setup state, last sync, hub version
```

Two choices in this tree matter:

- The hub is vendored as one bundled file, `hub/cli.js`, with no runtime dependencies; the web app is embedded in it. Setup copies a tagged release of the `sdlc-hub` package into `hub/`, and every later command runs as `node hub/cli.js <command>`, so nothing is fetched from a registry on a person's machine. Only the first install uses `npx sdlc-hub init`, from the public npm registry or the company's own. `hub upgrade` arrives as a reviewable merge request.
- **There is no `.gitlab-ci.yml` in the repository.** The project's "CI/CD configuration file" setting points to `ci/product-specs.yml@<group>/hub-ci`. People who can change specifications cannot remove the guard job.

## Data model

State is kept in small text files: one per bug, per test run and per person-month of usage, so two people rarely write the same file. `signoffs.yaml` and `release.yaml` are shared and append-only; when two saves meet there, the local server rebases and retries once before asking the person.

| File | Branch | Written by | Holds |
| --- | --- | --- | --- |
| `.hub/config.yaml` | main | Admin | Project name, GitLab host, repositories, allowed assistants, engine, integrations, price table, headless switch |
| `.hub/roles.yaml` | main | Admin | People (GitLab username, name, role, team, lead flag) and the path rules of each role |
| `.hub/flow.yaml` | main | Admin | Steps, role lanes, sign-off gates, return paths, token estimate per step |
| `docs/features/<slug>/hub/feature.yaml` | main | PO, PM | Title, owner, teams involved and the lead of each, Jira, Confluence and Figma links, estimates |
| `.../hub/signoffs.yaml` | main | The role named in the gate | One entry per gate passed or returned: step, person, time, content hash of the approved file; for a return also the reason, the bugs and the cycle |
| `.../hub/bugs/BUG-NNNN.md` | main | QA; the owning team changes the status | Front matter (AC, platform, team, severity, status) and the steps as text |
| `.../hub/release.yaml` | main | Ops; the PM for the go or no-go | Staging state, ordered checklist, the go or no-go, versions, rollout stage |
| `.../hub/validation/<date>.md` | main | The local server, for the PO or a team lead | Validation report from a read-only run |
| `features/<slug>/teams/<team>.json` | hub-state | `hub-report` CI job in the team repository | The team's `tasks.json`, statuses and cross-team references from `tasks/tracker.md`, the latest review verdict, the SDD artifacts present, merge request and latest pipeline |
| `features/<slug>/tests/<run>.json` | hub-state | CI job or `/hub:test` | Source (ci or local), platform, passed, failed, link |
| `features/<slug>/events.jsonl` | hub-state | Plugin hooks | Stage started, finished or returned, with role and assistant. No username and no token counts: the site names the person from the git author of the commit that added the event |
| `metrics/<yyyy-mm>/usage.jsonl` | hub-state | The admin's or PM's machine at sync | Open totals by feature, step, role, team, model and assistant |
| `metrics/<yyyy-mm>/<user>.jsonl.age` | hub-state | `hub usage`, at sync | One person's usage for the month, encrypted |

`.size` and `.route` in the feature folder are the source of truth for size and route. `feature.yaml` does not repeat them.

SDD keeps task status in `tasks/tracker.md`, not in `tasks.json`, so the team snapshot joins the two. In SDD 2.3 the files look like this:

- `tasks.json` is `{slug, tasks: [{id, title, layer, deps, acs, dod, files_hint, file}]}`. Ids are `T1`, `T2` and so on. `deps` may name only ids in the same file, because `implement` builds its order from this file alone.
- `tasks/tracker.md` is a table with the columns `#`, `Task`, `Layer`, `Owner`, `Estimate`, `Blocked by` and `Status`. The status is one of `todo`, `in_progress`, `blocked`, `review` or `done`, and `implement` sets `done` as it commits each task.

A wait on another team is written in the free-text `Blocked by` column of the waiting team's tracker as `<team-id>:<task-id>`, for example `backend:T2`, where the team id is the team's `id` in `config.yaml`. SDD does not read that column, so its own order is unchanged. `hub-report` checks each reference against the other team's `tasks.json`. An unknown reference reaches the site as a warning on the Tasks screen and is never dropped. The order between teams is derived from these references.

```yaml
# docs/features/tasks-issues/hub/feature.yaml
title: Tasks & issues in the Marketplace admin
owner: olena.k
teams:                    # set at the epic step by the PM
  backend: { lead: taras.m }
  web:     { lead: petro.v }
  android: { lead: andrii.p }
  ios:     { lead: sofiia.h }
links:
  jira: https://jira.example.com/browse/SHOP-412
  confluence: https://confluence.example.com/display/SHOP/Tasks+and+issues
  figma: https://www.figma.com/file/EXAMPLE
estimate:
  days: 15
  tokens_m: [52, 118]     # from flow.yaml, adjusted by the PM
```

```markdown
---
id: BUG-0012
title: Task visible after access to the order was revoked
ac: AC-4
platforms: [web, android, ios]
team: backend
severity: high
status: retest            # open | fixing | retest | closed | rejected
found_by: iryna.s
found_in: verify
---
Steps, expected result, actual result and evidence follow as plain text.
```

```yaml
# docs/features/tasks-issues/hub/signoffs.yaml (append-only)
- step: clarify
  user: olena.k
  at: 2026-09-18T10:12:00Z
  file: docs/features/tasks-issues/spec.md
  hash: sha256:3f1c…            # content hash of the approved file, line endings normalised
- step: epic
  user: maksym.d
  at: 2026-09-19T08:40:00Z
  decision: return              # a gate that can return: epic (PM to PO) and qa-final (QA to the team)
  reason: "Size M is too small: the iOS offline mode adds a second module"
  cycle: 1
- step: qa-final
  user: iryna.s
  at: 2026-10-06T15:02:00Z
  decision: return
  reason: "BUG-0012 reproduces on Android"
  bugs: [BUG-0012]
  target: fix
  cycle: 1
```

```yaml
# docs/features/tasks-issues/hub/release.yaml (excerpt)
go:                             # the only place of the go or no-go
  value: go                     # go | no-go
  user: maksym.d
  at: 2026-10-09T09:00:00Z
watch:
  started: 2026-10-10
  days: 7                       # from flow.yaml, release.watch_days
```

## Plugin design

The plugin adds a small set of `hub` commands and hands every development stage to the engine named in the configuration.

### Commands

The same commands exist in all three assistants: `/hub:name` in Claude Code, `$hub-name` in Codex, `/hub-name` in Cursor.

| Command | Typical role | What it does | Uses the LLM |
| --- | --- | --- | --- |
| `start` | Everyone | Starts the local server and opens the site | No |
| `status [slug]` | Everyone | Says where the feature is and what your role should do next | No |
| `next [slug]` | Everyone | Runs the next stage for your role through the engine, with the hub's prompt template and links | Yes |
| `run <step> <slug>` | Everyone | Runs one named stage through the engine | Yes |
| `new <slug>` | PO | Creates the feature folder and `feature.yaml`, then starts the interview or the spec stage | Yes |
| `validate <slug>` | PO, team leads | After a spec change, checks the documents downstream and writes a report. Changes nothing | Yes |
| `signoff <step> <slug>` | Gate owner | Records a human sign-off after the person confirms it | No |
| `bug <slug>` | QA | Files a bug with AC, platform, team and severity | Optional |
| `verify <slug>` | QA | AI-assisted check on staging through Playwright and Maestro, recorded as a test run | Yes |
| `test <slug>` | QA, developers | Runs the autotests locally and records the result | No |
| `decide <step> <slug>` | QA, PM | At a gate that can return, records pass or return with a reason: `qa-final` (QA: pass to release or return to development) and `epic` (PM: pass, or return to the PO) | No |
| `release <slug>` | Ops | Walks the release checklist. Never starts a production job itself | Yes |
| `sync` | Everyone | Pulls both branches and publishes your usage | No |
| `doctor` | Everyone | Checks the engine, MCP servers, git identity, role and GitLab token | No |

### How proxying works

1. The command's skill calls the MCP tool `hub_next` on the local server.
2. The server checks the gate: the required files exist, the previous sign-off is recorded, and the caller's role owns the step. If not, it returns what is missing and the skill stops.
3. Otherwise it returns the engine command for this assistant, for example `/sdd:specify tasks-issues`, with the filled prompt template.
4. The assistant runs that engine command unchanged.
5. When the stage prints its handoff block, the skill calls `hub_record`, and a hook publishes the usage of the session.

### Engine adapter

```yaml
# .hub/engines/sdd.yaml
id: sdd
source: genkovich/sdd
version: "2.3.x"            # checked against v2.3.0
artifacts: docs/features/{slug}
invoke:
  claude: "/sdd:{stage} {slug}"
  codex:  "$sdd-{stage} {slug}"
  cursor: "/sdd-{stage} {slug}"
steps:                      # hub step id -> engine stage(s), where the evidence is, and the evidence that it ran
  specify:     { stage: specify,                  in: specs,    done_when: ["file:spec.md", "file:.size", "file:.route"] }
  clarify:     { stage: clarify,                  in: specs,    optional: true, done_when: ["signoff:clarify"] }
  ux-flows:    { stage: ux-flows,                 in: specs,    optional: true, done_when: ["file:ux-flows.md"] }
  tech-design: { stages: [design, sequences],     in: contract, done_when: ["file:sad.md", "file:adr/*.md"] }
  data-model:  { stage: data-model,               in: contract, optional: true, done_when: ["file:data-model.md"] }
  api:         { stage: api,                      in: contract, optional: true, done_when: ["file:contracts/*", "mr:contract"] }
  screens:     { stage: screens,                  in: specs,    optional: true, done_when: ["file:screens.md"] }
  tasks:       { stage: tasks,                    in: teams,    done_when: ["file:tasks.json", "file:tasks/tracker.md"] }
  plan-tests:  { stage: plan-tests,               in: specs,    optional: true, done_when: ["file:test-plan.md | section:spec.md#Test plan"] }
  implement:   { stage: implement,                in: teams,    done_when: ["tracker:all-done"] }
  review:      { stage: review,                   in: teams,    done_when: ["review:PASS"] }
  ship:        { stage: ship,                     in: teams,    done_when: ["mr:open"] }
returns:                    # return paths, not steps
  fix:         { stage: fix, from: verify,        in: owning-team, done_when: ["file:_fixes/*.md"] }
```

Rules of the adapter:

- The key is the hub's step id and `stage` is the engine's own name, so the two can differ (`tech-design` runs `design`). Every engine step of the flow has an entry. The hub steps (`epic`, `sprint`, `staging`, `verify`, `autotests`, `qa-final`, `accept` and `release`) have none, because they belong to the hub and stay the same with any engine.
- `in` says where the evidence is: `specs` is `main` of product-specs, `contract` is the snapshot of the team that publishes the API contract, `teams` is the snapshot of every team of the feature, and `owning-team` is the team that owns the bug.
- `done_when` lists evidence that must all hold. `file:<glob>` means a file exists, and `a | b` means either is enough. `signoff:<step>` means the gate entry is recorded and its hash is current. `section:<file>#<heading>` means the heading exists in that file. `tracker:all-done` means every row of `tasks/tracker.md` is `done`. `review:PASS` means the latest `_review/review-<date>.md` gives `PASS`. `mr:open` means the snapshot shows an open merge request for the feature branch. `mr:contract` means the contract merge request in product-specs.
- `optional: true` marks a stage that SDD may skip by route. SDD leaves no marker on disk when it skips a stage, so the hub infers a skip (see "How the current step is detected").
- `fix` is a return path from verify and is listed under `returns`, apart from the twenty steps.

Replacing the engine means adding another file under `.hub/engines/` and changing `engine: sdd` in `config.yaml`.

### The three assistants

|  | Claude Code | Codex | Cursor |
| --- | --- | --- | --- |
| Hub commands arrive as | A plugin from the repository's own marketplace, pre-enabled in `.claude/settings.json` | Skills in `.agents/skills/hub-*` | Skills in `.cursor/skills/hub-*` |
| The engine arrives as | Plugin `sdd@sdd` | `install.sh codex` from the SDD repository | `install.sh cursor` |
| Project instructions | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md`, `.cursor/rules` |
| MCP server config | The plugin's `.mcp.json` | `.codex/config.toml` | `.cursor/mcp.json` |
| Hooks used | `SessionStart`, `PostToolUse` on Skill, `Stop` | `SessionStart`, `Stop`, `SessionEnd` | `sessionStart`, `stop`, `sessionEnd` |
| Headless run | `claude -p ... --output-format json` | `codex exec ... --json` | `agent -p ... --output-format json` |
| Path rules for edits | `permissions` in `.claude/settings.local.json` | Permission profile in `config.toml` | `.cursor/cli.json` |

Claude Code is the reference assistant and gets every feature first. Codex and Cursor read the same files, so a team can mix assistants on one feature.

## Feature lifecycle

A feature moves through 20 steps, the 18 of the AI-SDLC map plus Autotests and the QA final check, and the hub derives the current step from evidence in the repository, never from a status someone types.

### The twenty steps

Each step belongs to one role. An engine step is passed to the engine; a hub step is run or recorded by the hub. The first column is the step id used in `flow.yaml`, `signoffs.yaml` and commands such as `/hub:run tech-design <slug>`. Fix is not a step: it is the return path from verify, run by the team that owns the bug.

| # | Step id | Role | Kind | Writes (where) | Gate before the next step |
| --- | --- | --- | --- | --- | --- |
| 1 | `specify` | PO / Analyst | engine `specify` | `spec.md`, `.size`, `.route` | None |
| 2 | `clarify` | PO / Analyst | engine `clarify`, optional | `spec.md`, `CONTEXT.md` | PO / Analyst: the spec is ready: every open question closed or deferred |
| 3 | `epic` | PM | hub, no LLM | `hub/feature.yaml` (teams and leads), `hub/signoffs.yaml` | PM: size, route and the team leads, or a return to the PO with a reason |
| 4 | `ux-flows` | Designer | engine `ux-flows`, optional | `ux-flows.md` | PO / Analyst: the flows match the user stories |
| 5 | `tech-design` | Engineering | engine `design`, then `sequences` | `sad.md`, `adr/*`, in the contract team's repository | Engineering: architecture review by the other teams' leads |
| 6 | `data-model` | Engineering | engine `data-model`, optional | `data-model.md`, staged `migrations/`, `_audit/`, in the contract team's repository | Engineering: the schema and the rollback migration |
| 7 | `api` | Engineering | engine `api`, optional | `contracts/*` in the contract team's repository, then the contract merge request to product-specs | Engineering: the contract merge request, approved by the other teams' leads |
| 8 | `screens` | Designer | engine `screens`, optional | `screens.md` | PO / Analyst: every state can be built on each platform |
| 9 | `tasks` | Engineering | engine `tasks` | `tasks.json`, `tasks/`, in each team repository | Engineering: the task split, by each team lead |
| 10 | `sprint` | PM | hub | `hub/feature.yaml` | PM: sprint contents, and confirms the order between teams that the hub derives from the cross-team references |
| 11 | `plan-tests` | QA | engine `plan-tests`, optional | `test-plan.md`, or a `## Test plan` section in `spec.md` for size XS or S and on the quick route | QA: every criterion is covered on every platform |
| 12 | `implement` | Engineering | engine `implement` | `tasks/tracker.md`, in each team repository | Automatic: tests and lint on every task |
| 13 | `review` | Engineering | engine `review` | `_review/review-<date>.md`, in each team repository | Engineering: the team lead approves each merge request |
| 14 | `ship` | Engineering | engine `ship` | changelog and merge request, in each team repository | Engineering: the part was run for real against its criteria |
| 15 | `staging` | Ops | hub | `hub/release.yaml` | Ops: the smoke check passed on every client |
| 16 | `verify` | QA | hub | `hub/bugs/`, `test-plan.md` | QA: every criterion passes or is not applicable on every platform |
| 17 | `autotests` | QA | hub, no LLM | `tests/<run>.json` | Automatic: the latest CI run is green in every team repository |
| 18 | `qa-final` (final check) | QA | hub, no LLM | `hub/signoffs.yaml` | QA: pass to release, or return to development with a reason |
| 19 | `accept` | PO / Analyst, then PM | hub, no LLM | `hub/signoffs.yaml` (PO acceptance), `hub/release.yaml` (PM go or no-go) | PO accepts, then the PM gives the go or the no-go |
| 20 | `release` | Ops | hub | `hub/release.yaml` | Ops: every production deploy and every rollout stage, then the watch period |

The contract team is the team with `api_contract: true` in `config.yaml`. Steps 5 to 7 run in its repository. The site reads them from that team's `hub-report` snapshot, and the contract merge request in product-specs completes step 7. When no team publishes a contract, steps 5 and 6 run in the single team repository and step 7 is skipped. Client teams write their own short `sad.md` at step 9; it stays in their repositories.

A gate that can return keeps every decision as an entry in `signoffs.yaml` with the decision (pass or return), the reason and a cycle number. The QA entry also lists the bugs it returns and the target step. A return opens the next cycle and earlier entries stay as history. Two gates can return:

- **qa-final.** QA returns the feature to the team that owns the bugs, which runs the fix stage. QA then retests.
- **epic.** If the PM disagrees with the size or the route, the PM does not edit `.size` or `.route`. The PM returns the step to the PO with a reason, the PO runs `classify-size` again, and the PM decides again. Epic therefore uses no LLM: the PM names the teams and their leads in `feature.yaml` and records the decision with `/hub:decide epic <slug>`.

The go or no-go lives in `release.yaml` only. `signoffs.yaml` keeps the PO acceptance and every other gate.

### How the current step is detected

Each step's evidence comes from the engine adapter for engine steps and from `flow.yaml` for hub steps. The hub reads the evidence for every step from these sources:

- `main` of product-specs, for the specification files, sign-offs, bugs and `release.yaml`.
- The `hub-state` snapshot of each team. When a team has no valid snapshot, its local clone is the fallback, and the site marks the step "from your local copy".
- The host's API, when a gate is decided, for the latest CI run and the state of merge requests. `hub-state` is never trusted for a gate.

When the evidence of several steps is present, the latest step wins. The hub checks from the end of the flow backwards and stops at the first match:

1. `release.yaml` says the rollout finished and the watch period is over: released.
2. The QA decision in `signoffs.yaml`: passed to release, or returned.
3. Bugs on main and test runs on `hub-state`: verification and autotests.
4. Team snapshots: an open merge request (ship), the latest review verdict (review), the tracker (implement), a `tasks.json` (tasks).
5. The specification files and the contract team's snapshot, in flow order.

Four refinements sit on top:

- **Skipped.** SDD leaves no marker when it skips an optional stage by route. An optional step with no evidence shows as skipped when a later step has evidence, on any route. Without later evidence it is still to do. `.route` only explains the skip.
- **Sign-off.** A step whose evidence holds but whose sign-off is missing, or whose content hash no longer matches, shows as waiting for sign-off, with the person's name.
- **Running.** A started event without a finished event shows the step as running.
- **Returned.** The latest return entry of a gate shows that step as returned, with the reason, until the next decision.

The site names the person on a running or finished step from git: the author of the commit that added the event to `hub-state`, or the author of the merge request that carried the evidence. Names on steps are not spend data, and the privacy rule in "Metrics" does not cover them.

### QA, autotests and release

&#91;embedded content: QA and release flow · 6 steps, 1 decision, 1 fix loop\]

Bugs found during verification and a "return" at the final check both go to the team that owns the bug, and the feature comes back for a retest.

| Stage | Who | Recorded in | Moves on when |
| --- | --- | --- | --- |
| Staging ready | Ops | `release.yaml`, staging section | The smoke check passed on every client |
| AI-assisted verification | QA | One test run per platform, a verdict per criterion | Every criterion has a verdict |
| Bugs | QA files, the owning team fixes | `bugs/BUG-NNNN.md` | No open bug of severity high or above |
| Autotests | CI in each repository, plus local runs | `tests/<run>.json` | The latest CI run is green in every team repository of the feature, read from the host when the decision is made |
| Final check | QA | `signoffs.yaml`, entry `qa-final` | QA records pass or return |
| Return to development | QA | The decision, the bugs and the target step | The owning team runs the fix stage and QA retests |
| Acceptance and go or no-go | PO, then PM | PO acceptance in `signoffs.yaml`, the go or no-go in `release.yaml` | Both are recorded |
| Release | Ops | `release.yaml` checklist | Rollout at 100% and the watch period is over |

A local test run never satisfies the autotest gate. It is shown next to the CI runs with a "local" label.

## Web app

There is one site for everyone; the role decides the home page and which buttons are enabled.

### Screens

| Screen | Shows | Actions on the site |
| --- | --- | --- |
| Home | Project statistics first, then the next actions for your role beside the role's numbers, then the features in progress | Open an action as a task page over the screen, copy a command, sign off, open a feature |
| Features | Every feature in two views. List: stage, progress, what it waits on, cost. Graph: the role-lane flow with one track per feature | Switch between list and graph, open a feature at a chosen step |
| Feature: Flow | The role-lane map with a live status per step: done, running, waiting for sign-off, blocked, skipped | Open a step for its files, the prompt for your assistant and the sign-off |
| Feature: Documents | Rendered documents with "needs validation" and "changed since sign-off" badges | Light edits, start a validation |
| Feature: Tasks | Dependency graph and list per team, with cross-team waits from the `<team-id>:<task-id>` references. An unknown reference shows as a warning | Filter by team, open the task file |
| Feature: QA | Criterion by platform matrix, bugs, test runs, the final decision | Add a bug, change its status, record the decision |
| Feature: Release | Go or no-go, ordered checklist, rollout, watch period | Tick checklist items, record the rollout stage |
| Feature: Costs | Tokens and API-equivalent cost by step, role, model and assistant, against the estimate | Per-person view for admin and PM |
| People and roles | Users, roles, teams, setup state | Add or change a person, generate a setup script, download or copy it (admin) |
| Settings | Engine, assistants, integrations, headless switch, prices, GitLab checklist | Admin only |
| Your guide | What your role does in the assistant and on the site, and how to start next time | None |

Every feature header carries buttons to its Jira epic, Confluence page, Figma file, merge requests and staging address. A button appears only when its address is configured.

The side menu has two items for everyone, Home and Features, and an Admin group with People and roles and Settings, which other roles see as read only. Your guide is a button in the top bar. The first install is the separate setup site and has no menu item in the hub. A feature opens from Features and a setup script from People and roles, and both show a breadcrumb back.

An action on Home opens as a task page over the current screen. It shows the feature and its current step, the detail the action needs (open bugs and test runs, team tasks, the step with its sign-off, or the estimate against actuals), the command for the assistant and the button for the site.

Every command shown on the site has an "i" button. It opens a help dialog with what the command does, how to write it in the person's assistant and in the other two, examples, the prompt the hub passes and a sample of the output for the person's own role.

Several things help a first-time user. Each feature page starts with a Now strip: the current step, who has it, what it waits on and, when it is the viewer's turn, a button to the place where they act. Features can be filtered to those waiting on the viewer's role. A disabled control always shows the reason beside it. Controls that exist only in the prototype (view as, assistant, git host) sit in a dashed frame.

### What each role sees first

| Role | Numbers on the home page | Typical next action |
| --- | --- | --- |
| PO / analyst | Features by stage, specs waiting for sign-off, open questions, changes after sign-off, acceptance queue | Sign off a spec, answer a QA question, accept |
| PM | Progress per feature, blocked tasks, days clients waited for backend, estimate against actual, cost per feature, per-person spend | Plan the sprint, give go or no-go |
| Designer | Screens waiting, state coverage, design bugs | Run the screens stage, fix a mismatch |
| Developer | The team's tasks by status, merge request and pipeline, waiting on backend, bugs on the team | Run the next stage, fix a bug |
| QA | Criteria covered, open bugs by severity and platform, autotest pass rate, retest queue | Verify, file a bug, decide |
| Ops | Staging state, pipelines in every team repository, release checklist, rollout | Deploy to staging, release |
| Admin | People set up, last sync per person, spend, engine version, enforcement checklist | Add a person, generate a script |

### Edits that need no LLM

| What can be changed on the site | Who |
| --- | --- |
| Feature title, links, owner, estimates | PO, PM |
| Wording of a story or criterion, when its meaning stays the same | PO |
| A bug: create, edit, assign a team, change status | QA; the owning team for status |
| Sign-offs and the decisions at `epic` and `qa-final` | The owner of that gate |
| Release checklist and rollout stage | Ops |
| The go or no-go | PM |
| People, roles, settings | Admin |

Everything else, such as a new criterion, changed behaviour, the contract or the tasks, goes through the assistant.

### After a product owner changes the spec

1. On save the product owner marks the edit as wording only or as a change of meaning. Adding or removing a story or criterion always counts as a change of meaning.
2. A wording-only edit is saved and nothing else is touched.
3. After a change of meaning, every document that references the changed ids is marked "needs validation": flows, screens, contract, each team's tasks and the test plan. References are found by id, such as `AC-4`, `US-2` or `SCR-02`.
4. The site offers `/hub:validate tasks-issues` to copy. When the admin has enabled headless runs, a Validate button starts the assistant in read-only mode instead.
5. The assistant writes `validation/<date>.md`: for each document, either consistent or a list of conflicts with a proposed fix. It edits nothing.
6. Each owner clears their badge by running their stage again, or by confirming "no change needed", which is recorded as a sign-off.

## Roles and access

The admin assigns roles in `roles.yaml`, and a CI job on protected `main` is what actually stops a change outside a role.

### Roles and the paths they may change

| Role | May change |
| --- | --- |
| Admin | Everything, including `.hub/roles.yaml`, `.hub/config.yaml` and `.hub/flow.yaml` |
| PO / analyst | `docs/features/*/spec.md`, `.size`, `.route`, `CONTEXT.md` at the root and in each feature folder, `hub/feature.yaml`, `hub/validation/**`, own sign-offs |
| PM | `docs/roadmap.md`, `hub/feature.yaml`, the go or no-go in `hub/release.yaml`, own sign-offs and the decision at `epic` |
| Designer | `docs/design-system.md`, `ux-flows.md`, `screens.md`, own sign-offs |
| Developer | Own sign-offs and the status of bugs on their team |
| Team lead (a developer with `lead: true`) | Also `hub/validation/**`. The lead of the contract team also `sad.md`, `adr/**`, `data-model.md`, `migrations/**`, `_audit/**` and `contracts/**`, which arrive by the contract merge request |
| QA | `test-plan.md`, the `## Test plan` section of `spec.md`, `hub/bugs/**`, the decision at `qa-final` |
| Ops | `hub/release.yaml` except the go or no-go and, by merge request to the admin, the `hub-ci` project |

Everyone can read everything in the repository. The rules restrict writing only. A person may hold several roles; `roles.yaml` takes `role` for one and `roles` for a list.

```yaml
# .hub/roles.yaml (excerpt)
people:
  - { user: olena.k, name: Olena K., role: po }
  - { user: taras.m, name: Taras M., role: dev, team: backend, lead: true }
  - { user: iryna.s, name: Iryna S., roles: [qa, ops] }
roles:
  po:
    write:
      - docs/features/*/spec.md
      - docs/features/*/hub/feature.yaml
      - CONTEXT.md
      - docs/features/*/CONTEXT.md
  qa:
    write:
      - docs/features/*/test-plan.md
      - docs/features/*/spec.md#Test plan     # one section only, checked by the guard
      - docs/features/*/hub/bugs/**
```

### Enforcement on self-managed GitLab Free

| Layer | What it does | Strength |
| --- | --- | --- |
| Protected `main` | "Allowed to push and merge" is split: push is set to No one and merge to Developers and Maintainers, so every change is a merge request that the pipeline must pass. Only the admin holds Maintainer | Hard |
| `hub-guard` job with "Pipelines must succeed" | Reads `roles.yaml` from `main`, lists changed files with `git diff --name-only $CI_MERGE_REQUEST_DIFF_BASE_SHA`, and fails unless every changed path is allowed for the merge request author and for every person who pushed to the branch. The guard script itself comes from the hub-ci project, never from the merge request | Hard, at merge |
| Pipeline config in the `hub-ci` project | The "CI/CD configuration file" setting points outside the repository, so an author cannot delete the guard in their own merge request | Hard |
| Optional pre-receive server hook | Runs the same check at push time using `GL_USERNAME`. Needs access to the GitLab server | Hard, at push |
| Site and assistant rules | The site disables buttons, and the setup script writes path rules for the assistant | Guidance only |

This tier has no Code Owners, required approvals, push rules or per-user branch permissions. The hub therefore records sign-offs itself, and the guard checks that each sign-off entry was added by the role that owns the gate.

The `hub-state` branch accepts pushes from Developers and Maintainers. It holds machine data only and is a display cache: gates read the host's API, not this branch. A scheduled job validates it, and it never merges into `main`.

### The same rules on GitHub

This project runs on self-managed GitLab, so the rest of this document uses GitLab words. The hub asks for the host at init and keeps every difference in one host adapter. In version 1 only the GitLab install is built. The GitHub column below is the design for a later phase; until then the setup site says on the GitHub path that install on GitHub is not available yet, and stops before Install.

| Concern | GitLab | GitHub |
| --- | --- | --- |
| Change request | Merge request, `!12` | Pull request, `#12` |
| Namespace | Group | Organization |
| Command-line tool | `glab` | `gh` |
| CI | GitLab CI pipeline | GitHub Actions workflow run |
| Only change requests reach `main` | Protected branch: push set to No one, merge allowed for Developers | Ruleset on `main` that requires a pull request, with no bypass |
| The guard must pass | "Pipelines must succeed" | Required status check `hub-guard` |
| The author cannot edit the guard | The pipeline config lives in the `hub-ci` project | The workflow runs on `pull_request_target`, so its file always comes from the default branch |
| Who the author is | Merge request API, because CI has no author variable | `github.event.pull_request.user.login` |
| Self-merge | Merge when the pipeline succeeds | Auto-merge |
| Credential for `hub-report` | Project access token in a masked group variable, created by init | Fine-grained token in an organization secret, created by hand |
| Check at push time | Pre-receive hook, self-managed only | Pre-receive hook, Enterprise Server only |
| Assistant access | GitLab MCP server | GitHub MCP server |
| Plan needed | Free is enough | Private repositories need Team or higher |

On GitHub Free, private repositories have no protected branches or rulesets. init stops there and asks whether to continue in advisory mode, in which the guard reports a violation and cannot block it.

The GitHub guard never checks out or runs code from the pull request. It reads the list of changed files through the API and compares it with `roles.yaml` on `main`, which keeps `pull_request_target` safe to use.

GitHub Team also has push rulesets that restrict file paths. The hub does not depend on them, so both hosts behave the same.

## Installer

Setup has two parts: the admin initialises the project once, then generates one script per person.

### Admin: initialise the project

1. Run `npx sdlc-hub init` in a terminal. The command starts a local server and opens the setup page at `http://127.0.0.1:4173/setup`. The terminal asks nothing.
2. Answer five screens on that page: git host, repositories, project and tracker, assistants and engine, then a review. The first choice is the git host, GitLab or GitHub.
3. Press Install on the review screen. Nothing is written before this point.
4. Setup vendors the hub into `hub/`, writes `.hub/*`, the assistant files and the `.gitignore` line for `.claude/sdd.local.md`, makes the first commit and creates the `hub-state` branch.
5. It stores `HUB_STATE_TOKEN`, applies the host settings through the API and opens one merge request in each team repository to add the `hub-report` job. Anything it may not change is listed as left for people.

Install grows with the delivery phases and is run again to catch up. In phase 1b it writes the files, vendors the hub, creates `hub-state`, stores `HUB_STATE_TOKEN` and opens the `hub-report` merge requests; the assistant files are only the `CLAUDE.md` and `AGENTS.md` sections, because the plugin does not exist yet. In phase 2 a second run adds the plugin files, creates `hub-ci`, protects `main`, turns on "Pipelines must succeed" and points the CI/CD configuration file at `hub-ci`, together with `hub-guard`.
6. The page shows the result and a button that opens the hub on the People screen.

### What the setup page asks

Setup is a web page with five screens, and every field except the sign-in has a suggested value. Keys in the last column are in `.hub/config.yaml` unless another place is named.

| Screen | The admin enters | Example | Saved to |
| --- | --- | --- | --- |
| 1 Git host | GitLab or GitHub | GitLab | `git.provider` |
| 1 Git host | Host address | `gitlab.example.com` | `git.host` |
| 1 Git host | Sign-in through the browser, the host's command-line tool or an access token | Browser | System keychain, never the repository |
| 2 Repositories | Group, or organization on GitHub | `shop` | `git.namespace` |
| 2 Repositories | Repository for specifications and the hub, existing or new | `product-specs` | `git.repo` |
| 2 Repositories | Team repositories: any number of rows with team name, repository and kind. Each team gets an `id` made from its name, used in references such as `backend:T2` | Backend `backend`, Web `web-admin`, Android `android-app`, iOS `ios-app` | `teams[]`: `id`, `name`, `repo`, `kind` |
| 2 Repositories | Team that publishes the API contract, or none | Backend | `teams[].api_contract` |
| 3 Project and tracker | Project name | Marketplace | `project.name` |
| 3 Project and tracker | Issue tracker: none or Jira. Jira adds an address, a project key and an optional one-way copy of bugs | None | `tracker.*` |
| 3 Project and tracker | Optional links to Confluence and Figma | Empty | `links.*` |
| 4 Assistants and engine | Assistants allowed. Claude Code is always on | Claude Code, Codex | `assistants` |
| 4 Assistants and engine | Engine: `genkovich/sdd` or a custom adapter | `genkovich/sdd` | `engine` |
| 4 Assistants and engine | Whether the site may start the assistant | Off | `headless.enabled` |
| 5 Review and install | Install |  | Nothing; it starts the write |

The person who runs setup becomes the admin, and no second admin is asked for at this stage. Before starting, that person needs Owner rights on the group or organization, git and Node.js 20 or newer, and the repository names.

The list of team repositories is free: one row for a single-repository product, two for backend and web, or more. The flow, the task graph and the `hub-report` jobs follow this list. The examples in this document use four teams.

With no tracker chosen, tasks and bugs live only in the repository and the site shows no tracker links. Jira can be added later in Settings.

Before the review screen, setup checks what the install needs: Owner rights, a CI runner that is online (without one no change could ever merge), the host version, and that forking of the specifications repository is off. On GitHub it stops before Install in version 1 (see "The same rules on GitHub"). When the GitHub install is built, GitHub Free will stop on the first screen and ask whether to continue in advisory mode.

Install can be run again. Every step is written to `.hub/install.log`, and a second run continues from the first step that did not finish. The first commit is pushed before branch protection is turned on.

After Install the page lists what it did and what is left for people:

- Each team lead merges the merge request that adds `hub-report` to their repository.
- On a self-managed server, the optional pre-receive hook needs someone with access to the server.
- On GitHub, someone creates the `HUB_STATE_TOKEN` secret by hand, because a fine-grained token cannot be created through the API.

The SDLC Hub Setup prototype plays these screens for both hosts.

### Admin: add people and generate scripts

1. Add each person: GitLab username, name, role, team, team-lead flag, operating system and assistant.
2. Saving writes `roles.yaml` through a merge request that only the admin role can pass.
3. Choose a person and press Generate script. The site shows it for macOS and Linux (bash) or for Windows (PowerShell), to copy or download.
4. Send the script to the person through any channel.

### What the script carries

| Value | Example |
| --- | --- |
| Git host and repository | `gitlab`, `gitlab.example.com`, `shop/product-specs` |
| Person and role | `iryna.s`, QA |
| Team repositories for that role | `shop/web-admin`, `shop/android-app`, `shop/ios-app` |
| Assistant | Claude Code |
| Hub release | `v1.0.0` and the commit it expects |
| Work folder | `~/work/shop` |

It never carries tokens, keys or passwords, so it can travel by chat or email.

```bash
#!/usr/bin/env bash
# SDLC Hub setup for iryna.s (QA). Generated 2026-10-07 by the admin. Contains no secrets.
set -euo pipefail
HUB_GIT_PROVIDER="gitlab"
HUB_GIT_HOST="https://gitlab.example.com"
HUB_REPO="shop/product-specs"
HUB_USER="iryna.s"
HUB_ROLE="qa"
HUB_TEAM_REPOS="shop/web-admin shop/android-app shop/ios-app"
HUB_ASSISTANT="claude"
HUB_RELEASE="v1.0.0"
WORK="$HOME/work/shop"
# 1 prerequisites  2 sign-in to the git host  3 clone  4 hub setup  5 role files  6 doctor and start
```

### What the script does

1. Checks git, Node 20 or newer and the assistant. For anything missing it prints the install command for the person's system and stops.
2. Signs in to GitLab through the git credential manager or an SSH key. The credential stays in the operating system's keychain.
3. Clones `product-specs` and the team repositories of the role into the work folder.
4. Runs `hub setup`. It confirms on `main` that the username really has the role named in the script, and stops if it does not.
5. Writes the role's local files: path rules for the assistant, the MCP entry and, for Codex or Cursor, the engine's skills.
6. Runs `hub doctor`, starts the server and opens Your guide for the role.

The script is safe to run again, because each step checks before it acts.

### Every day after that

The person types `/hub:start` in the assistant, or runs `node hub/cli.js serve` in the repository. The site opens at `http://127.0.0.1:4173`.

## Metrics

Token counts come from the assistant's own session data on each machine. Cost is tokens multiplied by a price table, so it is an API-equivalent estimate and not an invoice.

### Where token counts come from

| Assistant | Interactive sessions | Headless runs | Reliability |
| --- | --- | --- | --- |
| Claude Code | A `Stop` hook receives `transcript_path`, and `hub usage` sums the usage records per model since its last mark | `total_cost_usd` and `usage` in the JSON result | Good. The transcript format is internal and may change, so OpenTelemetry export is the fallback |
| Codex | A `Stop` hook with `transcript_path`, and session files under `~/.codex/sessions` | `turn.completed.usage` in the JSON events | Fair. The session file layout is not officially documented |
| Cursor | No token data on the machine | An optional `usage` object in the JSON result | Weak. Team totals come from Cursor's Admin API |

Each record is tagged with the feature and step of the last `hub` command in that session, plus role, team, model and assistant.

### What the site calculates

- Tokens and API-equivalent cost per step, feature, role, team, model and assistant.
- Estimate against actual per step. Estimates start from `flow.yaml`, and the PM can adjust them per feature.
- Lead time per step and per feature from the event log, and the days teams waited for the team that publishes the API contract.
- Bugs per feature by severity and by the step that found them, autotest pass rate, and criteria covered.

On Team seats the work is not billed per step. The cost shows what the same work would cost at API list prices.

### Who sees what

| Data | Visible to |
| --- | --- |
| Totals by feature, step, role, team, model and assistant | Everyone |
| Tokens and cost per person | Admin and PM |
| A person's own usage | That person |

The privacy rule covers spend only: no per-person totals, tables or rankings of tokens or cost outside the admin and the PM, and usage records stay encrypted per person. Names on steps, sign-offs, bugs and merge requests are work records that the team already sees in git; the event log carries no username and no token counts, so it cannot be joined to spend.

Usage records are encrypted with `age` before they are committed, each to three public keys: the person's own, the admin's and the PM's. `hub setup` creates the key pair on the person's machine, keeps the private key in the system keychain and adds the public key to `.hub/keys/` through a merge request. Usage is one file per person and month, published at sync and not after every turn.

Open totals are published by the admin's or the PM's machine during sync. A group of fewer than three people is merged into "other", so a total never shows one person, and the event log carries no username. When the PM changes, `hub usage rekey` re-encrypts the records for the new key. The former PM can still read what was encrypted before; that is accepted.

## Integrations

Only the git host is required; Jira, Confluence and Figma are links that the hub opens and the assistant can write to.

| System | Used for | How | Required |
| --- | --- | --- | --- |
| GitLab | Clone, merge requests that merge themselves, pipeline and merge request state, files from the team repositories | REST API with the person's own token: `read_api` to view, `api` to open merge requests. The GitLab MCP server serves the assistant | Yes |
| Jira | A link from each feature and bug, and an optional one-way mirror of bugs and stories | Link in `feature.yaml`; the mirror runs from the assistant through the Atlassian MCP server | No |
| Confluence | Links to the spec page and the release notes | Link; the assistant publishes copies | No |
| Figma | Links to the file and to the frame of each screen | Links read from `screens.md`; Figma MCP in the assistant | No |
| Claude admin console | Seat spend per person, to cross-check the hub's numbers | Manual export | No |

The hub stores no Jira, Confluence or Figma credential. Those connections belong to the assistant, under each person's own sign-in.

## Security

The design keeps secrets off the repository and treats the local machine as untrusted for anything that affects other people.

- **Secrets.** None in the repository, the setup script or the site. Host credentials stay in the operating system's keychain. CI holds two kinds of token as masked, protected variables: `HUB_STATE_TOKEN`, which can only push to `hub-state`, and one fan-out token per team repository. Neither grants more than a Developer already has.
- **Local server.** It listens on the loopback address only and rejects any request whose Host or Origin is not its own address, so another site in the browser cannot call it. The session token is created at each start, kept in an HttpOnly cookie for the page and in a file only the person can read for the assistant's MCP server. The port is 4173 by default, can be changed, and falls back to a free one. Assistants are started with an argument list, never through a shell.
- **Roles.** They are checked at merge against `roles.yaml` on `main`. Editing a local file changes only what that person's own site shows.
- **Headless runs.** Off by default. In version 1 the only headless run is validation: read-only tools, a turn limit, the person's own seat, and the result shown before anything is saved. Stages stay copy-and-run. Running a stage from the site is a later step behind a second admin switch.
- **Untrusted text.** Jira tickets, Confluence pages and bug descriptions are data. Prompt templates pass them as quoted material, and validation runs that read them have no write tools. A sign-off or a QA decision that the assistant prepares is recorded only after the person confirms it, on the site or at a prompt in the terminal, so injected text cannot approve a gate.
- **Machine branch.** Any developer can push to `hub-state`, so nothing on it is trusted for a gate. The site shows it as a cache, and the autotest gate and the state of merge requests are read from the host's API when the decision is made. A scheduled job validates the files, the site ignores malformed records, and sign-offs and bugs never live there.
- **Supply chain.** The hub is vendored at a tag and upgrades arrive as a merge request. The engine version is pinned in the adapter.

## Delivery plan

Seven phases, each usable on its own; the first needs no hub at all. Phase 1 is split in two so that something usable lands early.

| Phase | Scope | Done when |
| --- | --- | --- |
| 0. Pilot by hand | The hub-and-sync repository layout from the map and SDD on one feature, without the hub | One feature has shipped through all the steps |
| 1a. Core and read-only site | Data model and validators, the engine adapter, step detection, `hub serve`, and `hub report`, which builds a team snapshot from a team repository. The read-only site: Home, Features list and graph, Feature Flow, Documents and Tasks, Your guide, command help and copy-prompt. It reads product-specs, `hub-state` snapshots and local clones of the team repositories, and runs on fixture repositories | Every screen shows the correct state of every fixture feature, and of a pilot checkout when one exists |
| 1b. Setup site and GitLab install | `npx sdlc-hub init` and the five-screen setup site. The GitLab install: files, the vendored hub, `hub-state`, `HUB_STATE_TOKEN` and the `hub-report` merge requests in the team repositories. On GitHub the site says that install is not available yet and stops before Install | The admin installs on the team's GitLab, and every role sees the real state of the pilot feature on their machine |
| 2. Plugin and writing | The `hub` plugin for Claude Code with `next`, `status`, `signoff`, `decide` and `bug`; saves through merge requests; `hub-guard`; a second Install run that protects `main` and points the CI configuration at `hub-ci`; People, roles and setup scripts | A new person is working 15 minutes after receiving a script, and an edit outside a role is refused at merge |
| 3. QA and release | Test runs from CI and local, bugs, the QA decision, the release checklist | A feature goes from staging to released with the site as the only tracker |
| 4. Metrics | Usage hooks, the Costs screen, estimates against actuals, encrypted per-person records | Cost per feature is within 10% of the provider's report for the same period |
| 5. Other assistants, GitHub and headless | Codex and Cursor skills, the GitHub install, headless validation, a second engine adapter as proof | The same step of one feature runs from all three assistants |

`hub-report` is in phase 1 because steps 5 to 7 and steps 9 to 14 are read from team snapshots: tech-design, data-model and api happen in the contract team's repository, and tasks, implement, review and ship happen in every team repository. Phase 1a builds the snapshot and reads it, and phase 1b puts the job into the team repositories. Phase 2 also has the task page, sign-off and light edits. Until phase 2 lands, branch protection stays off and the site is read only. The phase 4 check is against the admin console's monthly export for the team, since seats are not billed per feature.

## Hardening and lifecycle

This section closes gaps found in a review of the design: what the guard checks beyond paths, what happens when a save fails, how the hub reaches team repositories, and what happens to people, teams and versions over time.

### Guard rules

- The default is deny. A path that no role is allowed to change can be changed only by the admin. That covers `hub/**`, `.hub/**`, the assistant folders (`.claude/**`, `.agents/**`, `.codex/**`, `.cursor/**`, `CLAUDE.md`, `AGENTS.md`) and CI files, because they run on every machine.
- The guard script and its tests live in the `hub-ci` project on GitLab, or come from the default branch on GitHub. The merge request is only data: the list of changed files and their contents.
- `signoffs.yaml` is append-only. A new entry must name the merge request author as the person, and its step must be a gate of the author's role. Existing entries cannot be edited or removed.
- A sign-off records the content hash of the file it approves, not a commit. It stays current while the hash matches; a wording-only edit carries it forward and is logged.
- `release.yaml` and bug files are checked field by field: the PM writes the go or no-go, Ops the checklist and the rollout, a developer the status of a bug on their own team, QA everything in a bug.
- Two rules work below the file level. QA may change only the `## Test plan` section of `spec.md`, which `plan-tests` writes for small features. The PO may change only the `feature_size:` field in the front matter of `sad.md`, which `classify-size` keeps in step with `.size`. The guard compares the rest of the file with `main`.
- Renames, deletions and symbolic links count as changes to both paths.
- Forking of `product-specs` is turned off, and `hub-ci` has its own protected `main` that only the admin merges into.

### Saving, conflicts and work offline

- The local server commits in its own git worktree and never touches the checkout the assistant works in.
- A save is pending until its merge request merges. The site shows it as pending with a link.
- If the guard refuses the change, the merge request is closed, the branch is deleted and the site shows the path and the rule.
- If the change conflicts, the server rebases once. If that fails, the person chooses between their version and the newer one.
- Without a connection, saves queue locally and are sent at the next sync.
- Sync fast-forwards `main` only when the tree is clean, and says so otherwise.

### Team repositories and fan-out

- `hub-fanout` runs on `main` of `product-specs`. For each team in `config.yaml` it opens a merge request in the team repository with the shared files of the features that team takes part in: the API contract, the handoff block of the feature and the hub command files of the assistants. It uses one token per team repository, stored as a protected variable.
- In a team repository the assistant finds the feature from the slug argument, or from the branch name `feat/<slug>`.
- `hub-report` in a team repository writes the team snapshot to `hub-state` with `HUB_STATE_TOKEN`: a project access token with the Developer role and write access to the repository only.
- The validation report is written by the local server to `docs/features/<slug>/hub/validation/<timestamp>.md` from the output of the read-only run. The PO and the team leads may add these files.

### People, teams and versions

| Event | What happens |
| --- | --- |
| A person is added | The admin adds them on People and roles and to the group on the host. The hub checks the membership and warns when it is missing |
| A role changes | The admin edits the role and the person runs the setup script again, so the local path rules match. Open merge requests are judged by the new role |
| A person leaves | The admin removes them from `roles.yaml` and from the group. Their sign-offs stay as history |
| A second machine | The same setup script. A new key pair is added beside the first |
| A person holds two roles | `roles.yaml` takes a list of roles, and the site asks which role to work in |
| A team is added later | Settings, Add a team: the hub opens the `hub-report` merge request there and includes the team in fan-out. Features already running are not changed |
| The hub is upgraded | `hub upgrade` opens a merge request that replaces `hub/` and raises `schema_version`. A site older than the repository turns read only and asks to pull |
| Uninstall | One merge request removes `hub/`, `.hub/` and the assistant folders, then the admin lifts the branch settings. The documents stay |
| The admin is unavailable | A second admin is the only protection. Add one on People and roles soon after the first install |

### Claims to check during the build

- GitLab: a merge request set to merge automatically merges with the rights of the person who set it, which is why merge is allowed for Developers; how pipelines run for merge requests from forks; group and project access tokens on the Free tier.
- GitHub: the required check must be tied to GitHub Actions as its source, so that a status of the same name posted by a person does not count.
- Codex and Cursor: how a skill is invoked (`$hub-name`, `/hub-name`), which hooks exist and what they receive, and whether Cursor reports usage outside headless runs.
- Claude Code: whether one plugin can declare another as a dependency.

`docs/open-items.md` tracks these claims, the further claims found while planning phase 1, and which phase each one blocks.

## Risks and open questions

The largest risks come from building on things the hub does not control: SDD's file layout and each assistant's session data.

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| SDD keeps no state file and leaves no marker for a skipped stage | Stage detection relies on artifacts, the tracker and review files, and infers a skip from later evidence | Hooks add explicit events, and the adapter holds all detection rules in one place |
| SDD's file formats are templates, not a schema | A new SDD release can rename a file or a tracker column | The adapter pins the version; fixtures copied from a real run are checked on every upgrade |
| SDD assumes one repository | Team repositories need the shared files locally | The fan-out job from the map; prove it in phase 0 |
| Transcript and session formats are internal | Token collection can break when an assistant updates | Version checks in `hub doctor`; OpenTelemetry and headless JSON as fallbacks |
| Cursor reports little usage | Costs for Cursor users are partial | Label them as partial and take totals from the Admin API |
| Git as the database | State is as fresh as the last pull, and shared files can conflict | One file per bug and per run, append-only logs, automatic sync every few minutes |
| A CI guard instead of Code Owners | A wrong rule blocks a valid change or admits a wrong one | Only the admin changes `roles.yaml`; the guard has its own tests; the server hook is the stricter option |
| Self-merging merge requests | Many small merge requests in the history | One merge request per save action, squashed, with no reviewer needed |
| Plugin dependency on SDD | How one Claude Code plugin declares another must be confirmed during the build | `hub doctor` checks the engine is installed either way |

**Open questions**

- [ ] Who is the admin, when is a second admin added, and who holds the keys for per-person spend?
- [ ] Which GitLab version is installed? On the Free tier the GitLab MCP server needs 19.2 or newer.
- [ ] Does anyone have access to the GitLab server to install the optional pre-receive hook?
- [ ] Which assistant does each team start with? The plan assumes Claude Code first.
- [ ] Does the team start with Jira connected, and with the one-way copy of bugs on or off? Setup asks both.
- [ ] How long is the watch period after a rollout before a feature counts as released? The default is 7 days, set as `release.watch_days` in `flow.yaml`.

## Sources

Pages read for this design on 7 October 2026.

- SDD engine: [genkovich/sdd](https://github.com/genkovich/sdd), release v2.3.0 (README, skill files, `install.sh`). The files each stage writes were checked against the skill files and templates at tag v2.3.0 (commit `4403913`) on 7 October 2026; the findings are in `docs/decisions.md`.
- Claude Code: [plugins](https://code.claude.com/docs/en/plugins), [plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces), [hooks](https://code.claude.com/docs/en/hooks), [headless mode](https://code.claude.com/docs/en/headless), [costs](https://code.claude.com/docs/en/costs), [permissions](https://code.claude.com/docs/en/permissions), [MCP](https://code.claude.com/docs/en/mcp)
- Codex: [skills](https://learn.chatgpt.com/codex/skills), [non-interactive mode](https://developers.openai.com/codex/noninteractive.md), [hooks](https://developers.openai.com/codex/hooks.md), [config reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- Cursor: [headless CLI](https://cursor.com/docs/cli/headless), [output format](https://cursor.com/docs/cli/reference/output-format.md), [hooks](https://cursor.com/docs/agent/hooks), [CLI permissions](https://cursor.com/docs/cli/reference/permissions), [skills](https://cursor.com/help/customization/skills.md)
- GitLab: [protected branches](https://docs.gitlab.com/user/project/repository/branches/protected/), [server hooks](https://docs.gitlab.com/administration/server_hooks/), [Code Owners](https://docs.gitlab.com/user/project/codeowners/), [push rules](https://docs.gitlab.com/user/project/repository/push_rules/), [predefined CI variables](https://docs.gitlab.com/ci/variables/predefined_variables/), [project access tokens](https://docs.gitlab.com/user/project/settings/project_access_tokens/), [pipelines API](https://docs.gitlab.com/api/pipelines/), [MCP server](https://docs.gitlab.com/user/model_context_protocol/mcp_server/)

Two details come from community sources and are marked as risks above: the layout of Codex session files and the `usage` object in Cursor's headless result.

The GitHub column was checked on the same day against [about protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [about rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) and the [pull\_request\_target change note](https://github.blog/changelog/2025-11-07-actions-pull_request_target-and-environment-branch-protections-changes/). The auto-merge page could not be opened, so that row and the author field are from memory and need a check during the build.
