# SDLC Hub Specification

Oct 10, 2026 · @Vitaliy · revision 70

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
| Stack | Node.js and TypeScript | One codebase for the CLI, server, web app and MCP server. Node 22 or newer on every machine: the oldest Node.js LTS line still supported (Node 20 reached end of life on 30 April 2026; Node 22 is supported until 30 April 2027). |
| Autotests | GitLab CI and local runs | CI is the gate. Local runs are recorded and labelled as local. |
| Per-person spend | Admin and PM only | Totals by feature, step and role are open. Per-person records are encrypted to the admin and PM keys. |
| Language | English | Specification, UI and generated files are in English. `artifact_language` for SDD documents stays configurable. |

## Architecture

Five components share one Node.js codebase, and none of them is a hosted service.

| Component | Where it runs | Responsibility |
| --- | --- | --- |
| `hub` CLI | Each person's machine | `init`, `setup`, `serve`, `sync`, `report`, `guard`, `doctor`, `script`, `usage`, `upgrade`. Every plugin command ends in a CLI or server call. |
| Local server | `127.0.0.1:4173`, started by `hub serve` | Reads the working tree and the `hub-state` branch, watches files, serves the web app with a REST and SSE API, makes git and GitLab API calls, starts the assistant headless when allowed. |
| Web app | The browser, served by the local server | Dashboards, flow map, documents, tasks graph, QA, release, costs and admin screens. |
| Assistant plugin | Inside Claude Code, Codex or Cursor | Commands, hooks, and an MCP server (`node hub/cli.js mcp`) that the assistant asks what to do next. The MCP server reads the product-specs checkout itself and saves through the same code as the site, so it works whether or not the site is running. |
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
│     ├─ ux-flows.md  screens.md  test-plan.md     test-plan.md for size M and up, except on the quick route
│     ├─ sad.md  data-model.md  contracts/  published by the contract merge request from the contract team's repository
│     └─ hub/
│        ├─ feature.yaml                    title, owner, teams and leads, links, estimates
│        ├─ signoffs.yaml                   gates passed or returned: who, when, content hash
│        ├─ bugs/BUG-0012.md                one file per bug
│        ├─ release.yaml                    staging, checklist, go or no-go, versions, rollout
│        ├─ verification.yaml               QA's verdict per criterion and platform, newest per cell counts
│        └─ validation/<timestamp>.md       reports from /hub:validate, written by the local server
├─ .hub/
│  ├─ config.yaml                           project, repositories, assistants, integrations, prices
│  ├─ roles.yaml                            people, roles, path rules
│  ├─ flow.yaml                             steps, lanes, gates, return paths, watch period
│  ├─ engines/sdd.yaml                      adapter for genkovich/sdd
│  ├─ prompts/<step>.md                     prompt templates
│  ├─ keys/<user>/<machine>.pub             age public keys for per-person usage, a folder per person
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
├─ spec.md  ux-flows.md  screens.md  test-plan.md  contracts/   read-only copies from hub-fanout, with the handoff block
├─ sad.md  adr/                             the team's own design (client teams at the tasks step)
├─ tasks.json  tasks/_epic.md  tasks/tracker.md  tasks/<task>.md
├─ _review/review-<date>.md                 review record with the verdict PASS or CHANGES REQUESTED
├─ _fixes/<date>-<short-slug>.md            fix records
└─ in the contract team only, for steps 5 to 7: sad.md, adr/, data-model.md, migrations/, _audit/, contracts/.
   The contract merge request copies sad.md, data-model.md and contracts/ to product-specs;
   adr/, migrations/ and _audit/ stay in the contract team's repository

branch: hub-state (machine-written, never merged into main)
├─ features/<slug>/teams/<team>.json        tasks, tracker statuses, cross-team references, review verdict, merge request, pipeline
├─ features/<slug>/tests/<run>.json         CI and local test runs
├─ features/<slug>/events.jsonl             stage start and finish, returns; no username, no token counts
├─ metrics/<yyyy-mm>/usage.jsonl            open totals by feature, step, role, assistant
├─ metrics/<yyyy-mm>/<user>/<machine>.jsonl.age   per-person usage, one file per person, machine and month, encrypted
└─ people/<user>.json                       setup state, last sync, hub version
```

Two choices in this tree matter:

- The hub is vendored as one bundled file, `hub/cli.js`, with no runtime dependencies; the web app is embedded in it. Setup copies a tagged release of the `sdlc-hub` package into `hub/`, and every later command runs as `node hub/cli.js <command>`, so nothing is fetched from a registry on a person's machine. Only the first install uses `npx sdlc-hub init`, from the public npm registry or the company's own. `hub upgrade` arrives as a reviewable merge request.
- **There is no `.gitlab-ci.yml` in the repository.** The project's "CI/CD configuration file" setting points to `ci/product-specs.yml@<group>/hub-ci`. People who can change specifications cannot remove the guard job.

## Data model

State is kept in small text files: one per bug, per test run and per person-month of usage, so two people rarely write the same file. `signoffs.yaml` is shared and append-only. `release.yaml` is shared and checked field by field (see "Guard rules"). When two saves meet in either file, the local server rebases and retries once before asking the person.

| File | Branch | Written by | Holds |
| --- | --- | --- | --- |
| `.hub/config.yaml` | main | Admin | Project name, GitLab host, repositories, allowed assistants, engine, integrations, price table, headless switch |
| `.hub/roles.yaml` | main | Admin | People (GitLab username, name, role or roles, team, lead flag) and the path rules of each role |
| `.hub/flow.yaml` | main | Admin | Steps, role lanes, sign-off gates, return paths, token estimate per step |
| `docs/features/<slug>/hub/feature.yaml` | main | PO, PM | Title, owner, teams involved and the lead of each, Jira, Confluence and Figma links, estimates |
| `.../hub/signoffs.yaml` | main | The role named in the gate | One entry per gate passed or returned: step, person, time, content hash of the approved file; for a return also the reason, the bugs and the cycle |
| `.../hub/bugs/BUG-NNNN.md` | main | QA; the owning team changes the status | Front matter (AC, platforms, team, severity, status) and the steps as text |
| `.../hub/release.yaml` | main | Ops; the PM for the go or no-go | Staging state, ordered checklist (the default list is `release.checklist` in `flow.yaml`), the go or no-go, versions, rollout stage, watch period |
| `.../hub/verification.yaml` | main | QA | One record per criterion and platform: pass, fail with its bugs, or na, with who and when. Records are appended; the newest per cell counts |
| `.../hub/validation/<timestamp>.md` | main | The local server, for the PO or a team lead | Validation report from a read-only run |
| `features/<slug>/teams/<team>.json` | hub-state | `hub-report` CI job in the team repository | The team's `tasks.json`, statuses and cross-team references from `tasks/tracker.md`, the latest review verdict, the SDD artifacts present, merge request and latest pipeline |
| `features/<slug>/tests/<run>.json` | hub-state | The hub job of a team pipeline (`hub-tests-passed`, `hub-tests-failed` or `hub-report`), or `/hub:test` | Source (ci or local), team, result (passed or failed), counts when known, the pipeline's address, the branch and commit, and for a local run who ran it |
| `features/<slug>/events.jsonl` | hub-state | Plugin hooks | Stage started, finished or returned, with role and assistant. No username and no token counts: the site names the person from the git author of the commit that added the event |
| `metrics/<yyyy-mm>/usage.jsonl` | hub-state | The admin's or PM's machine at sync | Open totals by feature, step, role, team, model, assistant and feature with step: people counted, never named; groups of three people or more |
| `metrics/<yyyy-mm>/<user>/<machine>.jsonl.age` | hub-state | `hub sync` on that machine | One person's usage on one machine for the month, encrypted with age |

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
ui: true                  # false for a feature with no user interface, set at epic
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
  decision: return              # written by /hub:return epic: the PM sends the size and route back to the PO
  reason: "Size M is too small: the iOS offline mode adds a second module"
  returns_to: clarify
  cycle: 1
- step: qa-final               # written by /hub:decide
  user: iryna.s
  at: 2026-10-06T15:02:00Z
  decision: return
  reason: "BUG-0012 reproduces on Android"
  bugs: [BUG-0012]
  returns_to: verify            # the owning team runs fix, then QA retests
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
| `validate <slug>` | PO, team leads | After a spec change, checks the documents downstream against the spec and reports per document: consistent, or conflicts with a proposed fix. Changes nothing; the person may save the report to `hub/validation/<time>.md` | Yes |
| `stage <stage> <slug>` | Everyone | The plain engine's stage: runs the prompt in `.hub/engines/plain/<stage>.md`. `hub_next` hands it over | Yes |
| `signoff <step> <slug>` | Gate owner | Records a human sign-off after the person confirms it | No |
| `bug <slug>` | QA | Files a bug with AC, platform, team and severity | Optional |
| `verify <slug>` | QA | AI-assisted check on staging through Playwright and Maestro, recorded as a test run | Yes |
| `test <slug>` | QA, developers | Runs the autotests locally and records the result | No |
| `decide <slug>` | QA | Final check (`qa-final`): pass to release, or return to development with a reason and the bugs | No |
| `return <step> <slug> <reason>` | Gate owner | Sends a step back instead of signing it off. `<step>` is the step whose gate the person owns; `flow.yaml` names where it goes back to (by default the step itself) | No |
| `release <slug>` | Ops | Walks the release checklist. Never starts a production job itself | Yes |
| `sync` | Everyone | Pulls both branches, publishes your usage encrypted, on the admin's or the PM's machine the open totals, and refreshes Claude Code's copy of the hub plugin | No |
| `hub usage rekey` (command line only) | Admin, PM | After the PM, an admin or a key changed: encrypts every usage record in `hub-state` again, to the person, the admins and the PMs that `roles.yaml` names now. A record not encrypted to this machine's key stays as it is, and the command says which | No |
| `doctor` | Everyone | Checks the engine, MCP servers, git identity, role and GitLab token | No |

### How proxying works

1. The command's skill calls the MCP tool `hub_next` of the hub's MCP server.
2. The server checks the gate: the steps before it are done or skipped, and the caller's role owns the step (for Engineering, a team of the feature). If not, it returns what is missing or whose step it is, and the skill stops.
3. Otherwise it returns the engine command for this assistant, for example `/sdd:specify tasks-issues`, with the filled prompt template from `.hub/prompts/<step>.md` when there is one, and says where to run it (product-specs, the contract team's repository, or each team's).
   A prompt template is plain Markdown in `.hub/prompts/<step>.md`, one per step, written by the admin. The placeholders `{slug}`, `{title}`, `{step}`, `{route}` and `{size}` are filled in for the feature; any other text, braces included, stays as written. A step with no template gets the engine command alone.
4. The assistant runs that engine command unchanged. It never runs a stage the hub did not give it.
5. A step whose gate waits for the person ends with "sign it with `/hub:signoff`"; only the person signs.
6. When `hub_next` hands out a stage, it records that the stage started. When the stage has run to its end, the skill calls `hub_record`, which records that it finished. Both events are queued in the git directory and pushed to `hub-state` at once in the person's name, or by the next `hub sync`. The hooks record the session's usage (phase 4).

The tools are `hub_status`, `hub_next`, `hub_record`, `hub_signoff`, `hub_return` and `hub_bug`, and the QA and release tools. A tool that saves (sign-off, return, bug) checks the change with the guard first and pushes it as a merge request in the person's name, like the site. The skill shows what will be saved and asks the person to confirm it in the chat before it calls the tool. Claude Code's permission prompt is not enough on its own: in auto mode it does not appear.

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
  clarify:     { stage: clarify,                  in: specs,    skippable_on: [quick, standard], done_when: ["signoff:clarify"] }
  ux-flows:    { stage: ux-flows,                 in: specs,    skippable_on: [quick, standard], done_when: ["file:ux-flows.md"] }
  tech-design: { stages: [design, sequences],     in: contract, done_when: ["file:sad.md", "file:adr/*.md", "file:_sequences-log.md | route:quick"] }
  data-model:  { stage: data-model,               in: contract, skippable_on: [quick, standard], done_when: ["file:data-model.md"] }
  api:         { stage: api,                      in: contract, skippable_on: [quick, standard], done_when: ["file:contracts/*", "mr:contract"] }
  screens:     { stage: screens,                  in: specs,    skippable_on: [quick, standard], done_when: ["file:screens.md"] }
  tasks:       { stage: tasks,                    in: teams,    done_when: ["file:tasks.json", "file:tasks/tracker.md"] }
  plan-tests:  { stage: plan-tests,               in: specs,    skippable_on: [quick, standard], done_when: ["file:test-plan.md | section:spec.md#Test plan"] }
  implement:   { stage: implement,                in: teams,    done_when: ["tracker:all-done"] }
  review:      { stage: review,                   in: teams,    done_when: ["review:PASS"] }
  ship:        { stage: ship,                     in: teams,    done_when: ["mr:open"] }
returns:                    # return paths, not steps
  fix:         { stage: fix, from: [verify, qa-final], in: owning-team, done_when: ["file:_fixes/*.md"] }
```

Rules of the adapter:

- The key is the hub's step id and `stage` is the engine's own name, so the two can differ (`tech-design` runs `design`). Every engine step of the flow has an entry. The hub steps (`epic`, `sprint`, `staging`, `verify`, `autotests`, `qa-final`, `accept` and `release`) have none, because they belong to the hub and stay the same with any engine.
- `in` says where the evidence is: `specs` is `main` of product-specs, `contract` is the snapshot of the team that publishes the API contract (every team's snapshot when there is no contract team), `teams` is the snapshot of every team of the feature, and `owning-team` is the team that owns the bug.
- `done_when` lists evidence that must all hold. `file:<glob>` means a file exists, and `a | b` means either is enough. `signoff:<step>` means the gate entry is recorded and its hash is current. `section:<file>#<heading>` means the heading exists in that file. `tracker:all-done` means every row of `tasks/tracker.md` is `done`. `review:PASS` means the latest `_review/review-<date>.md` gives `PASS`. `mr:open` means the snapshot shows an open merge request for the feature branch. `mr:contract` means the contract merge request in product-specs. `route:<route>` holds on that route, so `file:x | route:quick` asks for `x` everywhere except on the quick route. SDD's `sequences` writes no file of its own, only `_sequences-log.md`, so `tech-design` waits for that log, except on the quick route.
- `skippable_on` lists the routes on which SDD may skip the stage. It follows SDD's route table: on `quick` the stage skips itself when it does not apply, on `standard` the person chooses, and on `full` every stage runs. A missing `.route` counts as `standard`. A step without `skippable_on` is required on every route. SDD leaves no marker on disk when it skips a stage, so the hub infers a skip (see "How the current step is detected").
- `fix` is a return path from verify and from a return at `qa-final`, and is listed under `returns`, apart from the twenty steps.
- One rule belongs to the hub, not to the adapter: when no team publishes a contract, `api` is skipped on every route, whatever its `skippable_on` says, because there is no shared contract.

Replacing the engine means adding another file under `.hub/engines/` and changing `engine: sdd` in `config.yaml`. The hub ships a second engine as proof, `plain`: the same steps and evidence as SDD, each stage a prompt file in `.hub/engines/plain/<stage>.md`, run by the hub's `stage` command in any assistant. On the demo project every feature has the same state with either engine.

### The three assistants

|  | Claude Code | Codex | Cursor |
| --- | --- | --- | --- |
| Hub commands arrive as | A plugin from the repository's own marketplace (`.claude-plugin/marketplace.json`, plugin in `hub/plugin`), enabled in `.claude/settings.json`. Each person's setup registers the marketplace once at local scope, because a relative path in the shared settings does not install | Skills in `.agents/skills/hub-*/SKILL.md`, the same files Cursor reads. Saving skills carry `agents/openai.yaml` with `allow_implicit_invocation: false` | The same skills in `.agents/skills/hub-*/SKILL.md`, with `disable-model-invocation: true` on saving skills |
| The engine arrives as | Plugin `sdd@sdd` | `install.sh codex` from the SDD repository | `install.sh cursor` |
| Project instructions | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md`, `.cursor/rules` |
| MCP server config | The plugin's `.mcp.json`, `node ${CLAUDE_PROJECT_DIR}/hub/cli.js mcp` | `.codex/config.toml`: `sh -c 'node "$(git rev-parse --show-toplevel)/hub/cli.js" mcp'`, loaded only in a trusted project | `.cursor/mcp.json` with `${workspaceFolder}/hub/cli.js`; the person approves the server once |
| Hooks used | `SessionStart` tells the session who the person is and what waits for them. Later: `UserPromptSubmit` (a typed `/hub:x` arrives as its `prompt`), `PostToolUse` on the hub's MCP tools, and `Stop` | `SessionStart`, `Stop`, `SessionEnd` | `sessionStart`, `stop`, `sessionEnd` |
| Headless run | `claude -p ... --output-format json` | `codex exec ... --json` | `agent -p ... --output-format json` |
| Path rules for edits (local, never committed) | `permissions` in `.claude/settings.local.json` | A permission profile in the person's own `~/.codex/config.toml` | The person's own Cursor CLI permissions file |

Claude Code is the reference assistant and gets every feature first. Codex and Cursor read the same files, so a team can mix assistants on one feature. The Codex and Cursor files are built from the vendors' documentation of 9 October 2026 and have not yet run against either assistant (claim 7). Codex asks each person to trust the project and to approve the hooks again whenever they change. Cursor keeps no token counts on the machine, so its usage is not recorded; Codex's comes from its session files.

## Feature lifecycle

A feature moves through 20 steps, the 18 of the AI-SDLC map plus Autotests and the QA final check, and the hub derives the current step from evidence in the repository, never from a status someone types.

### The twenty steps

Each step belongs to one role, except `accept`, where the PO accepts and then the PM gives the go or the no-go. An engine step is passed to the engine; a hub step is run or recorded by the hub. The first column is the step id used in `flow.yaml`, `signoffs.yaml` and commands such as `/hub:run tech-design <slug>`. Fix is not a step: it is the return path from verify, run by the team that owns the bug.

| # | Step id | Role | Kind | Writes (where) | Gate before the next step |
| --- | --- | --- | --- | --- | --- |
| 1 | `specify` | PO / Analyst | engine `specify` | `spec.md`, `.size`, `.route` | None |
| 2 | `clarify` | PO / Analyst | engine `clarify`, skippable | `spec.md`, `CONTEXT.md` | PO / Analyst: the spec is ready: every open question closed or deferred |
| 3 | `epic` | PM | hub, no LLM | `hub/feature.yaml` (teams, leads, `ui`), `hub/signoffs.yaml` | PM: size, route and the team leads; or `return` to the PO with a reason |
| 4 | `ux-flows` | Designer | engine `ux-flows`, skippable | `ux-flows.md` | PO / Analyst: the flows match the user stories |
| 5 | `tech-design` | Engineering | engine `design`, then `sequences` | `sad.md`, `adr/*`, in the contract team's repository | Engineering: architecture review, signed off by the lead of every other team |
| 6 | `data-model` | Engineering | engine `data-model`, skippable | `data-model.md`, staged `migrations/`, `_audit/`, in the contract team's repository | Engineering: the contract team's lead, for the schema and the rollback migration |
| 7 | `api` | Engineering | engine `api`, skippable | `contracts/*` in the contract team's repository, then the contract merge request to product-specs | Engineering: the contract, signed off by the lead of every other team |
| 8 | `screens` | Designer | engine `screens`, skippable | `screens.md` | PO / Analyst: every state can be built on each platform |
| 9 | `tasks` | Engineering | engine `tasks` | `tasks.json`, `tasks/`, in each team repository | Engineering: the task split, signed off by each team lead |
| 10 | `sprint` | PM | hub | `hub/feature.yaml` | PM: sprint contents, and confirms the order between teams that the hub derives from the cross-team references |
| 11 | `plan-tests` | QA | engine `plan-tests`, skippable | `test-plan.md`, or a `## Test plan` section in `spec.md` for size XS or S and on the quick route | QA: every criterion is covered on every platform |
| 12 | `implement` | Engineering | engine `implement` | `tasks/tracker.md`, in each team repository | Automatic: tests and lint on every task |
| 13 | `review` | Engineering | engine `review` | `_review/review-<date>.md`, in each team repository | Engineering: each team lead signs off the review of their team's merge request |
| 14 | `ship` | Engineering | engine `ship` | changelog and merge request, in each team repository | Engineering: each team lead, for the part run for real against its criteria |
| 15 | `staging` | Ops | hub | `hub/release.yaml` | Ops: the smoke check passed on every client |
| 16 | `verify` | QA | hub | `hub/bugs/`, `hub/verification.yaml` (a verdict per criterion and platform) | QA: every criterion passes or is not applicable on every platform |
| 17 | `autotests` | QA | hub, no LLM | `tests/<run>.json` | Automatic: the latest CI run is green in every team repository |
| 18 | `qa-final` | QA | hub, no LLM | `hub/signoffs.yaml` | QA: pass to release, or return to development with a reason |
| 19 | `accept` | PO / Analyst, then PM | hub, no LLM | `hub/signoffs.yaml` (PO acceptance), `hub/release.yaml` (PM go or no-go) | PO accepts, then the PM gives the go or the no-go |
| 20 | `release` | Ops | hub | `hub/release.yaml` | Ops: every production deploy and every rollout stage, then the watch period |

The contract team is the team with `api_contract: true` in `config.yaml`. Steps 5 to 7 run in its repository. The site reads them from that team's `hub-report` snapshot, and the contract merge request in product-specs completes step 7. That merge request copies `sad.md`, `data-model.md` and `contracts/**` into the feature folder of product-specs, so the other teams and `hub-fanout` can use them. `adr/**`, `migrations/**` and `_audit/**` stay in the contract team's repository; the ADR index in `sad.md` links to them there. Client teams write their own short `sad.md` at step 9; it stays in their repositories.

When no team publishes a contract (one repository, or several with no shared API):

- Steps 5 and 6 run in every team repository of the feature, and their evidence is read from every team's snapshot.
- Step 7 shows as skipped on every route, because there is no shared contract to publish.
- Nothing from steps 5 to 7 is copied to product-specs, and no role may write `sad.md`, `data-model.md` or `contracts/**` there; the default-deny rule refuses them.
- The tech-design gate is signed by each team's own lead.

A gate of Engineering is signed by people, not approved on the host, because GitLab Free has no required approvals: `flow.yaml` says whose entries the gate needs (`by`: the role, every team lead, the lead of every team except the contract team, or the contract team's lead). The leads of a feature are the ones named in its `feature.yaml`; each must be a developer of that team with `lead: true` in `roles.yaml`, and the site warns when one is not. `roles.yaml` decides what a person may write; `feature.yaml` decides whose sign-off a gate of that feature waits for.

Every gate owner can send a step back instead of signing it off, with `/hub:return <step> <slug> "<reason>"`. A return is an entry in `signoffs.yaml` with `decision: return`, the reason and a cycle number. A return opens the next cycle and earlier entries stay as history. `flow.yaml` names, for each gate, the step and the role it goes back to (`returns_to`); by default it is the step itself and the role that runs it. The QA final check keeps its own command:

- **qa-final.** `/hub:decide <slug>` records pass, or return with a reason and the bugs; a return goes back to verify (`returns_to: verify`). The team that owns each bug runs the fix stage, and QA then retests.
- **epic.** If the PM disagrees with the size or the route, the PM does not edit `.size` or `.route`. The PM runs `/hub:return epic <slug> "<reason>"`; `flow.yaml` sends it back to the PO at clarify (`returns_to: clarify`), the PO runs `classify-size` again and signs off clarify again, and the PM signs off or returns again. A return can only go to a step with a human gate, because that sign-off is what answers it. Epic therefore uses no LLM: the PM names the teams and their leads in `feature.yaml` and signs off with `/hub:signoff epic <slug>`.

The go or no-go lives in `release.yaml` only. `signoffs.yaml` keeps the PO acceptance and every other gate.

### How the current step is detected

Each step's evidence comes from the engine adapter for engine steps and from `flow.yaml` for hub steps. The hub reads the evidence for every step from these sources:

- `main` of product-specs, for the specification files, sign-offs, bugs and `release.yaml`.
- The `hub-state` snapshot of each team. When a team has no valid snapshot, its local clone is the fallback, and the site marks the step "from your local copy".
- The host's API, when a gate is decided, for the latest CI run and the state of merge requests. `hub-state` is never trusted for a gate.

When the evidence of several steps is present, the latest step wins. The hub checks from the end of the flow backwards and stops at the first match:

1. `release.yaml`: the rollout reached 100% and the watch period is over (release), or a rollout stage is recorded (release running).
2. `signoffs.yaml` and `release.yaml`: the PO acceptance and the go or no-go (accept).
3. The QA decision in `signoffs.yaml`: passed to release, or returned (qa-final).
4. Test runs on `hub-state` and bugs on main (autotests, verify).
5. The staging section of `release.yaml` (staging).
6. Team snapshots: an open merge request (ship), the latest review verdict (review), the tracker (implement).
7. The test plan (plan-tests), the sprint sign-off (sprint) and the teams' `tasks.json` (tasks).
8. The specification files, the contract team's snapshot and the epic sign-off, in flow order back to specify.

The statuses are: done, running, waiting for sign-off, returned, blocked, ready (the steps before it are done or skipped and nothing has started), to do, skipped and missed. Six refinements sit on top:

- **Skipped.** SDD leaves no marker when it skips a stage by route. A step with no evidence while a later step has evidence shows as skipped when the feature's route is in the step's `skippable_on` list.
- **No user interface.** When `feature.yaml` says `ui: false`, ux-flows and screens show as skipped on every route. SDD records no signal of its own before ux-flows: its "no human-facing UI" condition is judged in a stage's handoff, and only screens has a recorded signal, `target_surfaces` in the front matter of `sad.md` (none of `web-frontend`, `mobile-app`, `desktop-app`), which appears at step 5. The hub compares the two and warns when they disagree.
- **Missed.** The same case on a route that requires the step shows as missed, with a warning that names the step and the route. A missed step is never counted as done. A step with no evidence and no later evidence is still to do.
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
| AI-assisted verification | QA | A verdict per criterion and platform in `hub/verification.yaml`. The platforms are the kinds of the feature's client teams, or of all its teams when it has none | Every cell passes or does not apply; the site refuses the verify sign-off until then |
| Bugs | QA files, the owning team fixes | `bugs/BUG-NNNN.md` | No bug of severity high or above that is not `closed` or `rejected` |
| Autotests | CI in each repository, plus local runs | `tests/<run>.json` on `hub-state`. One hub job runs per team pipeline. When the team has CI of its own, it runs at the end: `hub-tests-passed` when every earlier job passed, `hub-tests-failed` when one failed. Either one publishes the snapshot and the result. A repository with no CI gets `hub-report` as its whole pipeline, which counts as passed. No token and no setup per team; the hub's job may fail without turning the pipeline red, and its pushes to `hub-state` skip CI. A local run (`/hub:test`) runs the team's `test` command from `config.yaml` | The latest CI run is green in every team repository of the feature |
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
| Feature: Flow | The role-lane map with a live status per step: done, running, waiting for sign-off, returned, blocked, skipped, missed (with a warning) | Open a step for its files, the prompt for your assistant and the sign-off |
| Feature: Documents | Rendered documents with "needs validation" and "changed since sign-off" badges | Light edits, start a validation |
| Feature: Tasks | Dependency graph and list per team, with cross-team waits from the `<team-id>:<task-id>` references. An unknown reference shows as a warning | Filter by team, open the task file |
| Feature: QA | Criterion by platform matrix, bugs, test runs, the final decision | Add a bug, change its status, record the decision |
| Feature: Release | Go or no-go, ordered checklist, rollout, watch period | Tick checklist items, record the rollout stage |
| Feature: Costs | Tokens and API-equivalent cost by step, role, model and assistant, against the estimate | Per-person view for admin and PM |
| People and roles | Users, roles, teams, setup state | Add or change a person, generate a setup script, download or copy it (admin) |
| Settings | How strict `hub-guard` is, assistants, headless switch, links, prices, adding a team, and the host checklist (what install set up, read on the host with the admin's credential); the project and engine read only | Admin only |
| Your guide | What your role does in the assistant and on the site, and how to start next time | None |

A wait on another team (a `<team-id>:<task-id>` reference to a task that is not done) is the cost the hub exists to show, so it is never only on the Tasks screen. A red marker with the number of waiting teams ("3 teams wait") stands beside the current step in the Features list, on the feature's track in the Features graph and in the Now strip. On Home, the waits are actions for the lead whose task is waited for, for the leads who wait and for the PM, and the tile "Blocked by another team" counts the waiting teams. The step itself stays running while the waiting teams still have work, for example on the mock, and turns blocked only when a team has nothing else it can do.

The actions on Home are derived from the detected state of every feature: what waits for the person, what is returned to them, what their role runs and what blocks it. Nobody writes them by hand.

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
| Sign-offs, returns and the QA decision at `qa-final` | The owner of that gate |
| Release checklist and rollout stage | Ops |
| The go or no-go | PM |
| People, roles, settings | Admin |

Everything else, such as a new criterion, changed behaviour, the contract or the tasks, goes through the assistant.

### After a product owner changes the spec

1. On save the product owner marks the edit as wording only or as a change of meaning. Adding or removing a story or criterion always counts as a change of meaning.
2. A wording-only edit is saved and nothing else is touched.
3. After a change of meaning, every document that references the changed ids is marked "needs validation": flows, screens, contract, each team's tasks and the test plan. References are found by id, such as `AC-4`, `US-2` or `SCR-02`.
4. The site offers `/hub:validate tasks-issues` to copy. When the admin has enabled headless runs, a Validate button starts the assistant in read-only mode instead.
5. The assistant reports, for each document, either consistent or a list of conflicts with a proposed fix. It edits nothing. The local server writes the report to `hub/validation/<timestamp>.md`.
6. Each owner clears their badge by running their stage again, or by confirming "no change needed", which is recorded in `signoffs.yaml` as an entry with `decision: confirm` for their own step, with the file and its hash.

## Roles and access

The admin assigns roles in `roles.yaml`, and a CI job on protected `main` is what actually stops a change outside a role.

### Roles and the paths they may change

| Role | May change |
| --- | --- |
| Admin | Everything, including `.hub/roles.yaml`, `.hub/config.yaml` and `.hub/flow.yaml` |
| PO / analyst | `docs/features/*/spec.md`, `.size`, `.route`, `CONTEXT.md` at the root and in each feature folder, `hub/feature.yaml`, `hub/validation/**`, the `feature_size:` field in `sad.md` front matter; sign-offs and returns at clarify, ux-flows, screens and accept |
| PM | `docs/roadmap.md`, `hub/feature.yaml`, the go or no-go in `hub/release.yaml`; sign-offs and returns at epic and sprint |
| Designer | `docs/design-system.md`, `ux-flows.md`, `screens.md`; confirmations on their own steps |
| Developer | The status of bugs on their team; confirmations on their team's steps |
| Team lead (a developer with `lead: true`) | Also `hub/validation/**`. The lead of the contract team also `docs/features/*/sad.md`, `docs/features/*/data-model.md` and `docs/features/*/contracts/**`, the only files of steps 5 to 7 that live in product-specs (the PO also keeps `feature_size:` in `sad.md`). With no contract team, no one but the admin may write them. Leads sign off and return at the Engineering gates of the steps of their feature (see "The twenty steps") |
| QA | `test-plan.md`, the `## Test plan` section of `spec.md`, `hub/bugs/**`, `hub/verification.yaml`; sign-offs and returns at plan-tests and verify, and the decision at `qa-final` |
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
      - docs/features/*/sad.md#front:feature_size   # one front matter key only
  qa:
    write:
      - docs/features/*/test-plan.md
      - docs/features/*/spec.md#Test plan     # one section only, checked by the guard
      - docs/features/*/hub/bugs/**
```

A rule is a glob. `<glob>#<heading text>` allows one section of the file and `<glob>#front:<key>` one front matter key; the guard checks both structurally (see "Guard rules").

### Enforcement on self-managed GitLab Free

| Layer | What it does | Strength |
| --- | --- | --- |
| Protected `main` | "Allowed to push and merge" is split: push is set to No one and merge to Developers and Maintainers, so every change is a merge request that the pipeline must pass. Only the admin holds Maintainer | Hard |
| `hub-guard` job with "Pipelines must succeed" | Fetches `main` and reads `roles.yaml`, `config.yaml`, `flow.yaml` and each `feature.yaml` from it. Lists the changes with `git diff --name-status -M $CI_MERGE_REQUEST_DIFF_BASE_SHA HEAD` and fails unless every change is allowed for the merge request author and for every person who pushed to the branch. The author comes from the merge request API. The people who pushed come from the project's push events to the branch since its base. Both are read with `HUB_GUARD_TOKEN`, a read-only project access token (`read_api`, Reporter) stored as a masked project variable. The job's configuration comes from the hub-ci project and the code it runs is `hub/cli.js` on `main`, never the merge request's. A skipped pipeline (`[skip ci]`) does not count as passed | Hard, at merge |
| Pipeline config in the `hub-ci` project | The "CI/CD configuration file" setting points outside the repository, so an author cannot delete the guard in their own merge request | Hard |
| Optional pre-receive server hook | Runs the same check at push time using `GL_USERNAME`. Needs access to the GitLab server | Hard, at push |
| Site and assistant rules | The site disables buttons, and the setup script writes path rules for the assistant | Guidance only |

This tier has no Code Owners, required approvals, push rules or per-user branch permissions. The hub therefore records sign-offs itself, and the guard checks that each sign-off entry was added by the role that owns the gate.

The `hub-state` branch accepts pushes from Developers and Maintainers. It holds machine data only and is a display cache: gates read the host's API, not this branch. A scheduled job validates it, and it never merges into `main`.

### The same rules on GitHub

This project runs on self-managed GitLab, so the rest of this document uses GitLab words. The hub asks for the host at init and keeps every difference in one host adapter. The GitLab install is built and verified. The GitHub install is built in phase 5 from the column below. It was verified on github.com in a test organization with public repositories (claim 5).

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
| A save from the site opens its request | Push options: git alone, over HTTPS or SSH | No push options: after the push the hub opens the pull request and sets auto-merge through the API, with the person's own token from git's credential helper (an HTTPS clone, or `gh auth setup-git`) |
| Everyone who pushed to the branch | Push events of the project | The repository's activity API (push and force push) |
| Credential for `hub-report` | Project access token in a masked group variable, created by init | A deploy key of product-specs with write access, created by init; its private half is the repository secret `HUB_STATE_KEY` in each team repository |
| When `hub-report` runs | A job in the team's pipeline | A workflow on `workflow_run` of the team's workflows |
| Check at push time | Pre-receive hook, self-managed only | Pre-receive hook, Enterprise Server only |
| Assistant access | GitLab MCP server | GitHub MCP server |
| Plan needed | Free is enough on a self-managed server. On gitlab.com, project access tokens (for `HUB_STATE_TOKEN`) need Premium | Private repositories need Team or higher; public repositories work on Free |

On GitHub Free, private repositories have no protected branches, rulesets or auto-merge. Setup installs there only in advisory mode (see "Guard settings"):
- install adds no ruleset, and writes `git.auto_merge: false`;
- `hub-guard` only warns;
- each pull request, a save from the site included, waits for someone to merge it.

The GitHub guard never runs code from the pull request. The `hub-guard` workflow runs on `pull_request_target`, so the workflow file and `hub/cli.js` come from the default branch. It checks the pull request out into a separate folder only as data, with no credentials kept, and compares its changes with `roles.yaml` on the default branch. The author comes from the event, and the pushers from the activity API. A refusal is recorded in `hub-state` with the workflow's own token and the branch is deleted, as on GitLab. GitHub leaves a pull request open when its branch is deleted, so the guard also closes it; the workflow has `contents: write` and `pull-requests: write`.

GitHub Team also has push rulesets that restrict file paths. The hub does not depend on them, so both hosts behave the same.

## Installer

Setup has two parts: the admin initialises the project once, then generates one script per person.

### Admin: initialise the project

1. Run `npx sdlc-hub init` in a terminal. The command starts a local server and opens the setup page at `http://127.0.0.1:4173/setup`. The terminal asks nothing.
2. Answer five screens on that page: git host, repositories, project and tracker, assistants and engine, then a review. The first choice is the git host, GitLab or GitHub.
3. Press Install on the review screen. Nothing is written before this point.
4. Setup vendors the hub into `hub/` (`hub/cli.js`, one file with the web app inside, and `hub/package.json`, which makes Node load it as an ES module), writes `.hub/*`, the assistant files and the `.gitignore` line for `.claude/sdd.local.md` in one commit through the API, turns off forking of the repository, and creates the `hub-state` branch with no history.
5. It stores `HUB_STATE_TOKEN`, applies the host settings through the API and opens one merge request in each team repository to add the `hub-report` job. Anything it may not change is listed as left for people.

Install grows with the delivery phases and is run again to catch up. In phase 1b it writes the files, vendors the hub, creates `hub-state`, stores `HUB_STATE_TOKEN` and opens the `hub-report` merge requests; the assistant files are only the `CLAUDE.md` and `AGENTS.md` sections, because the plugin does not exist yet. In phase 2 a second run adds the plugin files, creates `hub-ci` (its `main` protected for Maintainers), stores `HUB_GUARD_TOKEN`, points the CI/CD configuration file at `hub-ci`, turns on "Pipelines must succeed" with skipped pipelines not counting, and protects `main` last. Once `main` is protected, the install's own file updates reach it through a merge request that merges itself when `hub-guard` passes, like every other change.
6. The page shows the result and a button that opens the hub on the People screen.

### What the setup page asks

Setup is a web page with five screens, and every field except the sign-in has a suggested value. Keys in the last column are in `.hub/config.yaml` unless another place is named.

| Screen | The admin enters | Example | Saved to |
| --- | --- | --- | --- |
| 1 Git host | GitLab or GitHub | GitLab | `git.provider` |
| 1 Git host | Host address | `gitlab.example.com` | `git.host` |
| 1 Git host | A personal access token of a group Owner with the `api` scope, pasted on the page | `glpat-…` | System keychain through git's credential helper, never the repository; memory only when no helper is set up |
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
| 4 Assistants and engine | How strict `hub-guard` is: Enforce or Advisory, and four checks that can be switched off (see "Guard settings") | Enforce, every check on | `guard.*` |
| 5 Review and install | Install |  | Nothing; it starts the write |

The person who runs setup becomes the admin, and no second admin is asked for at this stage. Before starting, that person needs Owner rights on the group or organization, git and Node.js 22 or newer, and the repository names.

The list of team repositories is free: one row for a single-repository product, two for backend and web, or more. The flow, the task graph and the `hub-report` jobs follow this list. The examples in this document use four teams.

With no tracker chosen, tasks and bugs live only in the repository and the site shows no tracker links. Jira can be added later in Settings.

Before the review screen, setup checks what the install needs: Owner rights, a CI runner that is online (without one no change could ever merge), the host version, and that forking of the specifications repository is off. On GitHub it checks that the person is an owner of the organization, the plan (Free with private repositories cannot install), that the organization allows deploy keys (a new one may not), the team repositories, and `ssh-keygen` for the deploy key. Setup on GitHub takes a fine-grained token of an owner, with the resource owner set to the organization and all repositories. Its repository permissions are Administration, Contents, Pull requests, Workflows and Secrets, read and write, and Actions, read. Its organization permissions are Members read, and Administration read and write.

Install can be run again. Each step first checks the host, so a second run skips what is done and continues from the first step that did not finish; the page shows each step as done, already done or failed. A team that merged an older hub-report job gets a merge request with the new one, and an open merge request with an older job is updated. The first commit is pushed before branch protection is turned on.

After Install the page lists what it did and what is left for people:

- Each team lead merges the merge request that adds `hub-report` to their repository.
- On a self-managed server, the optional pre-receive hook needs someone with access to the server.
- On GitHub, nothing is created by hand. Install makes the deploy key and stores its private half in each team repository. Older `sdlc-hub hub-state` keys can be removed once team CI uses the newest.

The SDLC Hub Setup prototype plays these screens for both hosts.

### Admin: add people and generate scripts

1. Add each person: GitLab username, name, role or roles, team, team-lead flag, operating system and assistant.
2. Saving writes `roles.yaml` through a merge request that only the admin role can pass. The file keeps its comments and style, and the site refuses an unknown role or team, a lead without a team, and removing the last admin before anything is pushed.
3. Choose a person and press Generate script. The site shows it for macOS and Linux (bash) or for Windows (PowerShell), to copy or download.
4. Send the script to the person through any channel.

### What the script carries

| Value | Example |
| --- | --- |
| Git host and repository | `gitlab`, `gitlab.example.com`, `shop/product-specs` |
| Person and role | `iryna.s`, QA |
| Team repositories for that role | `shop/web-admin`, `shop/android-app`, `shop/ios-app` |
| Assistant | Claude Code |
| Hub release | A short hash of `hub/cli.js` on `main` when the script was made; a newer hub on `main` is fine and only noted |
| Work folder | `~/work/shop` |

It never carries tokens, keys or passwords, so it can travel by chat or email.

```bash
#!/usr/bin/env bash
# SDLC Hub setup for iryna.s (qa). Generated 2026-10-08 by nazar.t. Contains no secrets. Safe to run again.
set -euo pipefail

HUB_GIT_PROVIDER="gitlab"
HUB_GIT_HOST="https://gitlab.example.com"
HUB_REPO="shop/product-specs"
HUB_USER="iryna.s"
HUB_ROLES="qa"            # one role, or several separated by spaces
HUB_TEAM_REPOS="shop/backend shop/web-admin shop/android-app shop/ios-app"
HUB_ASSISTANT="claude"
HUB_RELEASE="3f9c0a12be47"
WORK="${HUB_WORK:-$HOME/work/shop}"
# 1 prerequisites  2 sign-in to the git host  3 clone  4 hub setup  5 doctor  6 the site on Your guide
```

### What the script does

1. Checks git, Node 22 or newer and the assistant. For anything missing it prints the install command for the person's system and stops.
2. Signs in to the git host through the person's git credential manager or SSH key. The credential stays in the operating system's keychain; the script only checks that `git ls-remote` reaches the repository.
3. Clones `product-specs` and the team repositories of the role into the work folder, or pulls them when they are there. Engineering clones its own team's repository; QA, Ops and the admin clone every team's.
4. Runs `hub setup` in product-specs, which does four things:
   - It confirms on `main` that the username has exactly the roles named in the script, and stops if not.
   - It records who the checkout belongs to as `git config hub.user`, so the site and the plugin know the person whatever their git e-mail says.
   - It writes the local files for the assistant: path rules in `.claude/settings.local.json`, kept out of commits through `.git/info/exclude`. Then it runs `claude plugin marketplace add <the clone> --scope local` and `claude plugin install hub@product-specs --scope local`, and installs the engine's plugin.
   - It tells the admin by writing `people/<user>.json` to `hub-state`, which People and roles shows as "set up".
5. Runs `hub doctor`, which checks Node, `.hub/`, who the person is, the git host and `hub-state`, and the assistant's plugin.
6. Starts the site and opens Your guide. `HUB_NO_START=1` skips this step, and `HUB_WORK` sets another work folder.

The script is safe to run again, because each step checks before it acts.

### Every day after that

The person types `/hub:start` in the assistant, or runs `node hub/cli.js serve` in the repository. The site opens at `http://127.0.0.1:4173`.

## Metrics

Token counts come from the assistant's own session data on each machine. Cost is tokens multiplied by a price table, so it is an API-equivalent estimate and not an invoice.

### Where token counts come from

| Assistant | Interactive sessions | Headless runs | Reliability |
| --- | --- | --- | --- |
| Claude Code | The `Stop` hook reads the session's transcript (`transcript_path`), and its subagents' transcripts beside it (`<session>/subagents/agent-*.jsonl`), each since its last mark: each assistant message once, by its id, with `message.model` and `message.usage` (input, cache writes for 5 minutes and 1 hour, cache reads, output). It adds one record per model to this month's local file in the git directory. `UserPromptSubmit` (a typed `/hub:x`) and `PostToolUse` on the hub's tools note the feature and step | `total_cost_usd` and `usage` in the JSON result | Good. Verified against Claude Code 2.1.292: the cost from the transcript equals the run's own `total_cost_usd`. The transcript format is internal and may change, so OpenTelemetry export is the fallback |
| Codex | A `Stop` hook with `transcript_path`, and session files under `~/.codex/sessions` | `turn.completed.usage` in the JSON events | Fair. The session file layout is not officially documented |
| Cursor | No token data on the machine | An optional `usage` object in the JSON result | Weak. Team totals come from Cursor's Admin API |

Each record is tagged with the feature and step of the last `hub` command in that session, plus role, team, model and assistant.

### What the site calculates

- Tokens and API-equivalent cost per step, feature, role, team, model and assistant.
- Estimate against actual per step. Estimates start from `flow.yaml`, and the PM can adjust them per feature.
- Lead time per step and per feature from the event log. A step runs from its first start to its last finish, or to now while it runs. The feature runs from its first event to the release (the start of the watch period), or to now. The Flow tab shows both. The days each client team waited for the team that publishes the API contract: a task waits on another team when the tracker says blocked and its Blocked by names that team's task (`backend:T2`). `hub-report` keeps when each wait started, in the snapshot's `waits`, and moves it to `waited` with its end when the task is no longer blocked. The Flow tab shows the days per team.
- Bugs per feature by severity and by the step that found them, autotest pass rate, and criteria covered.

On Team seats the work is not billed per step. The cost shows what the same work would cost at API list prices.

### Who sees what

| Data | Visible to |
| --- | --- |
| Totals by feature, step, role, team, model and assistant | Everyone |
| Tokens and cost per person | Admin and PM |
| A person's own usage | That person |

The privacy rule covers spend only: no per-person totals, tables or rankings of tokens or cost outside the admin and the PM, and usage records stay encrypted per person. Names on steps, sign-offs, bugs and merge requests are work records that the team already sees in git; the event log carries no username and no token counts, so it cannot be joined to spend.

Usage records are encrypted with `age` (X25519 keys, armored) before they are published, each to every public key of the person, the admins and the PMs (one key per machine). `hub setup` creates the key pair on the person's machine, keeps the private key in the system keychain through git's credential helper (or a file only the owner can read where there is none), and proposes the public key as `.hub/keys/<user>/<machine>.pub` through a merge request. A folder per person matters: with `<user>-<machine>.pub`, a user named `olena` could add a key that reads as `olena-k`'s, and the hub would encrypt her usage to it. Usage is one file per person, machine and month, published at `hub sync` when it changed, never after every turn.

Open totals are published by the admin's or the PM's machine during sync, which decrypts every person's month. They are kept per dimension: feature, step, role, team, model, assistant, and feature with step. A group of fewer than three people is merged into "other", and an "other" that still has fewer than three people is left out, so a total never shows one person; the event log carries no username. When the PM changes, `hub usage rekey` re-encrypts the records for the new key (not built yet). The former PM can still read what was encrypted before; that is accepted.

Prices are the API list prices, by model, from Anthropic's pricing page on a known date, carried in the hub; `prices` in `config.yaml` overrides any model. Not modelled: fast mode, US-only inference, batch, and Haiku 5.5's higher tier for long prompts. Estimates: the admin sets `estimate_tokens_m` per step in `flow.yaml`; the PM sets the feature's `estimate.tokens_m` in `feature.yaml` on its Costs screen.

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

- **Secrets.** None in the repository, the setup script or the site. Host credentials stay in the operating system's keychain. CI holds three kinds of token as masked variables. They are not protected, because the jobs that need them run on unprotected branches. `HUB_STATE_TOKEN` (a group variable) writes `hub-state` for `hub-report`, and for `hub-guard` when it records a refused save and deletes its branch. `HUB_GUARD_TOKEN` (a variable of product-specs, `read_api`) lets `hub-guard` read who opened a merge request and who pushed to it. There is also one fan-out token per team repository. None grants more than a Developer already has. On GitLab Free a Developer token can push to any unprotected branch; since phase 2 `main` takes no pushes, so nothing a token writes reaches `main` without a merge request that passes `hub-guard` (`docs/open-items.md`, claim 13).
- **Local server.** It listens on the loopback address only and rejects any request whose Host or Origin is not its own address, so another site in the browser cannot call it. The session token is created at each start, kept in an HttpOnly cookie for the page and in a file only the person can read for the assistant's MCP server. The port is 4173 by default, can be changed, and falls back to a free one. Assistants are started with an argument list, never through a shell.
- **Roles.** They are checked at merge against `roles.yaml` on `main`. Editing a local file changes only what that person's own site shows.
- **Headless runs.** Off by default. In version 1 the only headless run is validation: read-only tools, a turn limit, the person's own seat, and the result shown before anything is saved. For Claude Code it is `claude -p "/hub:validate <slug>" --output-format json --permission-mode plan --max-turns 30 --disallowedTools Edit Write NotebookEdit Bash`, started by the local server for the PO and the team leads; the plugin's hooks record its usage like any session. A real run on the demo changed no file, took 9 turns and cost $0.26. Stages stay copy-and-run. Running a stage from the site is a later step behind a second admin switch.
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
| 2. Plugin and writing | The `hub` plugin for Claude Code with `next`, `status`, `signoff`, `return` and `bug`; saves through merge requests; `hub-guard`; a second Install run that protects `main` and points the CI configuration at `hub-ci`; People, roles and setup scripts | A new person is working 15 minutes after receiving a script, and an edit outside a role is refused at merge |
| 3. QA and release | Test runs from CI and local, bugs, the QA decision (`decide`), the release checklist | A feature goes from staging to released with the site as the only tracker |
| 4. Metrics | Usage hooks, the Costs screen, estimates against actuals, encrypted per-person records | Cost per feature is within 10% of the provider's report for the same period |
| 5. Other assistants, GitHub and headless | Codex and Cursor skills, the GitHub install, headless validation, a second engine adapter as proof | The same step of one feature runs from all three assistants |

`hub-report` is in phase 1 because steps 5 to 7 and steps 9 to 14 are read from team snapshots: tech-design, data-model and api happen in the contract team's repository, and tasks, implement, review and ship happen in every team repository. Phase 1a builds the snapshot and reads it, and phase 1b puts the job into the team repositories. Phase 1a also has the task page, read only. Phase 2 has sign-off and light edits. Until phase 2 lands, branch protection stays off and the site is read only. The phase 4 check is against the admin console's monthly export for the team, since seats are not billed per feature.

## Hardening and lifecycle

This section closes gaps found in a review of the design: what the guard checks beyond paths, what happens when a save fails, how the hub reaches team repositories, and what happens to people, teams and versions over time.

### Guard rules

- The default is deny. A path that no role is allowed to change can be changed only by the admin. That covers `hub/**`, `.hub/**`, the assistant folders (`.claude/**`, `.agents/**`, `.codex/**`, `.cursor/**`, `CLAUDE.md`, `AGENTS.md`) and CI files, because they run on every machine.
- The guard's job configuration lives in the `hub-ci` project on GitLab, and the code it runs is `hub/cli.js` on `main`, which only the admin changes. On GitHub both come from the default branch. The merge request is only data: the list of changed files and their contents.
- `signoffs.yaml` is append-only. A new entry must name the merge request author as the person. A pass or a return must be at a gate the author owns (see "Roles and the paths they may change"); a `confirm` entry must be for a step of the author's role, or of the author's team. Existing entries cannot be edited or removed.
- Each person may add their own public key files, `.hub/keys/<own user>-<machine>.pub`, and nothing else under `.hub/`. An existing key file is changed only by the admin.
- A sign-off records the content hash of the file it approves, not a commit. It stays current while the hash matches; a wording-only edit carries it forward and is logged.
- `release.yaml` and bug files are checked field by field: the PM writes the go or no-go, Ops the checklist and the rollout, a developer the status of a bug on their own team, QA everything in a bug.
- Two rules work below the file level. QA may change only the `## Test plan` section of `spec.md`: SDD's `plan-tests` writes the plan there, not into `test-plan.md`, for size XS or S and on the quick route. The PO may change only the `feature_size:` field in the front matter of `sad.md`, which `classify-size` keeps in step with `.size`.
- Such a rule is a structural check, not a text search. The guard parses both versions of the file (the one on `main` and the one in the merge request) into front matter and sections:
  - The front matter is the block between the first two `---` lines, split into top-level keys. A section runs from an ATX heading to the next heading of the same or a higher level. Headings inside fenced code blocks do not count.
  - The allowed region is either one front matter key or one section, matched by the exact heading text (`## Test plan`). A heading that appears more than once is refused as ambiguous.
  - With the allowed region cut out of both versions, the rest must be byte-identical.
  - The region must keep its place. An existing section keeps the heading it follows; a new section is allowed only as a whole new section between two existing ones or at the end; a front matter key keeps its order.
  - So a renamed heading (`## Test Plan`, `## 9. Test plan`), a section moved elsewhere in the file, an edit to any other section or key, and a heading renamed to `## Test plan` to capture its body are all refused, with the line that differs.
- Renames, deletions and symbolic links count as changes to both paths.
- **Rules change, results follow.** When `.hub/` changes on `main`, every open merge request runs `hub-guard` again, so a result that passed under the old roles cannot merge (claim 14). On GitLab a `hub-recheck` job on `main` starts a new pipeline per merge request with `HUB_RECHECK_TOKEN` (`api`, a protected variable, so merge request pipelines never see it). On GitHub a `hub-recheck` workflow re-runs each pull request's `hub-guard` job with its own token (`actions: write`).
- **Valid files.** Each hub file a change writes must load with the parser the site reads it with. That covers everything under `.hub/`, a key file, and in each feature `feature.yaml`, `signoffs.yaml`, `release.yaml`, `verification.yaml` and the bug files. A change under `.hub/` must leave `.hub/` loading as a whole, with no new warning, such as a person in a team that `config.yaml` does not list. An invalid file is refused in any guard mode. This is the specification's `hub-validate`; it runs inside `hub-guard`, so there is one required check.
- Forking of `product-specs` is turned off, and `hub-ci` has its own protected `main` that only the admin merges into.

### Guard settings

The admin sets how strict `hub-guard` is at install (screen 4) and later in Settings. The settings are stored in `config.yaml`:

```yaml
guard:
  mode: enforce        # or advisory
  checks:
    files: true        # who may change which files (roles.yaml)
    signoffs: true     # who signs which gate, and the QA decision
    pushers: true      # judge everyone who pushed to the branch, not only its author
    members: true      # refuse a change from someone who is not in roles.yaml
```

- **Advisory mode.** The guard lists what breaks a rule and passes, so the change merges by itself. The findings appear in the job log and, for a save from the site, in `hub-state` at the same path as a refusal, with `advisory: true`; the branch stays. The site shows the save as merged with warnings.
- **Switching a check off:**
  - `files`: anyone in `roles.yaml` may change any file.
  - `signoffs`: anyone in `roles.yaml` may sign any gate, still in their own name.
  - `pushers`: only the author is judged.
  - `members`: someone outside `roles.yaml` with access to the repository may change files.
- **Never relaxed.** Whatever the mode and the switches say, these stay admin-only, because they run on every machine:
  - `.hub/` and `hub/`;
  - the assistants' files: `.claude/`, `.claude-plugin/`, `.agents/`, `.codex/`, `.cursor/`, `CLAUDE.md`, `AGENTS.md`;
  - CI files: `.github/`, `.gitlab-ci.yml`, `ci/`.

  A change to them is refused even in advisory mode. `signoffs.yaml` stays append-only, and a new entry must name its author.
- **Who decides.** The settings on `main` judge each change, so a merge request cannot loosen its own check. The site's own buttons keep following roles: switching a check off widens what the guard lets through, not who sees a Sign off button.

### Saving, conflicts and work offline

- The local server commits in its own git worktree (`.git/sdlc-hub/worktree`) and never touches the checkout the assistant works in. Its record of saves is `.git/sdlc-hub/saves.json`, outside the repository.
- A save is one branch, `hub/<user>/<label>-<time>`, cut from `main` of the remote as it is at that moment. On GitLab it is pushed with push options that open the merge request and set it to merge when the pipeline succeeds. So git alone is enough, over HTTPS or SSH, and a person needs no API token.
- Before it pushes, the server runs the same guard on the change against `main` of the remote. A change the guard would refuse is not pushed, and the site shows the path and the rule at once.
- A save is pending until its merge request merges: until `main` has its commit, or the same contents after a squash. The site shows it as pending with a link.
- If `hub-guard` refuses the change at merge, the job writes the reason to `hub-state` at `saves/<user>/<label>-<time>.json` and deletes the branch with `HUB_STATE_TOKEN`, which closes the merge request. The person's site reads the record and shows the path and the rule. Only `hub/<user>/…` branches are closed this way; a refused merge request opened by hand just fails its pipeline.
- The site saves sign-offs and returns, People and roles, QA's verdicts, bugs (QA files and edits them, the owning team changes the status), the QA decision, and the release fields of each role. The plugin saves the same through its tools.
- One change per file at a time: while a person's save of a file waits to merge, a second save of that file is refused with the reason, because it would conflict with the first. The site's controls wait and say so.
- If the change conflicts with a newer `main` (`git merge-tree`, git 2.38 or later), the server moves it onto `main` once:
  - each file is merged three-way;
  - `signoffs.yaml`, which only grows, keeps both sides' entries;
  - the branch is force-pushed, which updates the open request.

  If lines still conflict, the save shows as "conflicts". The person chooses: Keep mine puts their version on the newest `main`, and Use the newer one drops the save (on GitHub its pull request is closed).
- Without a connection, a save is made on `main` as the machine last saw it and queued. It is sent at the next look at the saves (the site checks every few seconds) or at `hub sync`.
- Sync fast-forwards `main` only when the tree is clean, and says so otherwise.

### Team repositories and fan-out

- `hub-fanout` brings the shared files of each feature to the repositories of the teams its `feature.yaml` names (set at the epic step): `spec.md`, `ux-flows.md`, `screens.md`, `test-plan.md` and `contracts/`, unchanged, and `_handoff.md`, which says where they come from and that they change in product-specs. They arrive as a merge request on the branch `hub/fanout`, which the team lead merges; a second run with the same files changes nothing.
  - On GitLab, the job runs on `main` of `product-specs` and pushes with one project access token per team repository, the masked variable `HUB_FANOUT_TOKEN_<TEAM>`. Push options open the merge request.
  - On GitHub, a workflow in each team repository runs every hour and on demand. It reads `product-specs` with the deploy key it already has, and opens the pull request with its own token. Install allows the repository's workflows to open pull requests.
  - The hub command files of the assistants are not copied: the hub runs in product-specs.
- In a team repository the assistant finds the feature from the slug argument, or from the branch name `feat/<slug>`.
- `hub-report` in a team repository writes the team snapshot to `hub-state` with `HUB_STATE_TOKEN`: a project access token with the Developer role and write access to the repository only.
- The validation report is written by the local server to `docs/features/<slug>/hub/validation/<timestamp>.md` from the output of the read-only run. The PO and the team leads may add these files.

### People, teams and versions

| Event | What happens |
| --- | --- |
| A person is added | The admin adds them on People and roles and to the group on the host. The admin's People and roles marks a person who is not a member, asked with the admin's own git credential and kept for ten minutes |
| A role changes | The admin edits the role and the person runs the setup script again, so the local path rules match. Open merge requests are judged by the new role |
| A person leaves | The admin removes them from `roles.yaml` and from the group. Their sign-offs stay as history |
| A second machine | The same setup script. A new key pair is added beside the first |
| A person holds two roles | `roles.yaml` takes a list of roles, and the site asks which role to work in |
| A team is added later | Settings, Add a team: a save adds it to `config.yaml`. Then the admin runs `hub connect-teams`, which runs install's team steps with the admin's setup token: the `hub-report` merge request and the fan-out token on GitLab; the deploy key's secret and the workflows on GitHub. Teams already connected are skipped. Features already running are not changed |
| The hub is upgraded | The admin runs the newer hub's `hub upgrade` in their clone. It proposes `hub/cli.js`, `hub/package.json` with the version, the plugin, the assistants' files and, on GitHub, the `hub-guard` workflow, as one merge request in the admin's name; `.hub/` stays as it is. It never goes back to an older version. A site whose hub is older than the one in the checkout or on `main` turns read only and says to sync and start it again. A change of `schema_version` comes with a migration in the release that needs it; none does yet |
| Uninstall | The admin's `hub uninstall` proposes one merge request that removes `hub/`, `.hub/`, the plugin marketplace, the hub's skills, Codex and Cursor files and workflows, the hub's section of `CLAUDE.md` and `AGENTS.md`, and its plugin in `.claude/settings.json`. The documents stay. It then lists what install set up on the host, for the admin to lift by hand: protection, CI configuration, tokens, secrets, `hub-ci`, and the team repositories' jobs |
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
