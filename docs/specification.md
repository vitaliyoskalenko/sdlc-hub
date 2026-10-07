# SDLC Hub Specification

Oct 7, 2026 · @Vitaliy

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
├─ docs/
│  ├─ roadmap.md  design-system.md
│  └─ features/<slug>/
│     ├─ spec.md  .size  .route             written by the SDD stages
│     ├─ ux-flows.md  screens.md  test-plan.md
│     ├─ contracts/openapi.yaml  sad.md  data-model.md     published by backend
│     └─ hub/
│        ├─ feature.yaml                    title, owner, teams, links, estimates
│        ├─ signoffs.yaml                   who approved which step, and when
│        ├─ bugs/BUG-0012.md                one file per bug
│        ├─ release.yaml                    checklist, versions, rollout
│        └─ validation/2026-10-07.md        reports from /hub:validate
├─ .hub/
│  ├─ config.yaml                           project, repositories, assistants, integrations, prices
│  ├─ roles.yaml                            people, roles, path rules
│  ├─ flow.yaml                             steps, lanes, gates, return paths
│  ├─ engines/sdd.yaml                      adapter for genkovich/sdd
│  └─ prompts/<step>.md                     prompt templates
├─ hub/                                     vendored release of the hub
│  ├─ cli/  server/  web/  mcp/
│  └─ plugin/                               Claude Code plugin: skills, hooks, .mcp.json
├─ .claude-plugin/marketplace.json          lists the hub plugin from ./hub/plugin
├─ .claude/settings.json                    marketplaces, enabled plugins, shared rules
├─ .agents/skills/hub-*/                    generated for Codex
├─ .codex/config.toml  .codex/hooks.json
├─ .cursor/skills/hub-*/  .cursor/mcp.json  .cursor/hooks.json
└─ AGENTS.md  CLAUDE.md

branch: hub-state (machine-written, never merged into main)
├─ features/<slug>/teams/<team>.json        tasks, statuses, merge request, pipeline
├─ features/<slug>/tests/<run>.json         CI and local test runs
├─ features/<slug>/events.jsonl             stage start and finish, returns
├─ metrics/<yyyy-mm>/usage.jsonl            usage by feature, step, role, assistant
├─ metrics/<yyyy-mm>/people.jsonl.age       per-person usage, encrypted
└─ people/<user>.json                       setup state, last sync, hub version
```

Two choices in this tree matter:

- The hub is vendored as one bundled file with no runtime dependencies. Setup copies a tagged release of the `sdlc-hub` package into `hub/`, and every later command runs as `node hub/cli.js <command>`, so nothing is fetched from a registry on a person's machine. Only the first install uses `npx sdlc-hub init`, from the public npm registry or the company's own. `hub upgrade` arrives as a reviewable merge request.
- **There is no `.gitlab-ci.yml` in the repository.** The project's "CI/CD configuration file" setting points to `ci/product-specs.yml@<group>/hub-ci`. People who can change specifications cannot remove the guard job.

## Data model

State is kept in small text files: one per bug, per test run and per person-month of usage, so two people rarely write the same file. `signoffs.yaml` and `release.yaml` are shared and append-only; when two saves meet there, the local server rebases and retries once before asking the person.

| File | Branch | Written by | Holds |
| --- | --- | --- | --- |
| `.hub/config.yaml` | main | Admin | Project name, GitLab host, repositories, allowed assistants, engine, integrations, price table, headless switch |
| `.hub/roles.yaml` | main | Admin | People (GitLab username, name, role, team, lead flag) and the path rules of each role |
| `.hub/flow.yaml` | main | Admin | Steps, role lanes, sign-off gates, return paths, token estimate per step |
| `docs/features/<slug>/hub/feature.yaml` | main | PO, PM | Title, owner, teams involved, Jira, Confluence and Figma links, estimates |
| `.../hub/signoffs.yaml` | main | The role named in the gate | Step, person, time, commit that was approved |
| `.../hub/bugs/BUG-NNNN.md` | main | QA; the owning team changes the status | Front matter (AC, platform, team, severity, status) and the steps as text |
| `.../hub/release.yaml` | main | Ops, PM | Go or no-go, ordered checklist, versions, rollout stage |
| `features/<slug>/teams/<team>.json` | hub-state | `hub-report` CI job in the team repository | The team's `tasks.json`, statuses from `tasks/tracker.md`, merge request and latest pipeline |
| `features/<slug>/tests/<run>.json` | hub-state | CI job or `/hub:test` | Source (ci or local), platform, passed, failed, link |
| `features/<slug>/events.jsonl` | hub-state | Plugin hooks | Stage started, finished or returned, with role and assistant and no username |
| `metrics/<yyyy-mm>/usage.jsonl` | hub-state | `hub usage`, after each session | Tokens by feature, step, role, model and assistant |

SDD keeps task status in `tasks/tracker.md`, not in `tasks.json`, so the team snapshot joins the two.

```yaml
# docs/features/tasks-issues/hub/feature.yaml
title: Tasks & issues in the Marketplace admin
owner: olena.k
size: M
route: standard
teams: [backend, web, android, ios]
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
| `decide <slug>` | QA | Final check: return to development or pass to release | No |
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
version: "2.3.x"
artifacts: docs/features/{slug}
invoke:
  claude: "/sdd:{stage} {slug}"
  codex:  "$sdd-{stage} {slug}"
  cursor: "/sdd-{stage} {slug}"
steps:                      # hub step -> engine stage, and the evidence that it ran
  specify:   { stage: specify,   done_when: "spec.md" }
  clarify:   { stage: clarify,   done_when: "signoff:clarify" }
  uxflows:   { stage: ux-flows,  done_when: "ux-flows.md" }
  design:    { stage: design,    done_when: "sad.md" }
  tasks:     { stage: tasks,     done_when: "tasks.json" }
  implement: { stage: implement, done_when: "tasks/tracker.md: all done" }
  review:    { stage: review,    done_when: "_review/review-*.md: PASS" }
  ship:      { stage: ship,      done_when: "merge request open" }
  fix:       { stage: fix,       done_when: "_fixes/*.md" }
```

Replacing the engine means adding another file under `.hub/engines/` and changing `engine: sdd` in `config.yaml`. Steps with no engine stage (sprint, staging, verify, accept, release) belong to the hub and stay the same.

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

Each step belongs to one role. An engine step is passed to the engine; a hub step is run or recorded by the hub. Fix is not a step: it is the return path from verify, run by the team that owns the bug.

| # | Step | Role | Kind | Writes | Gate before the next step |
| --- | --- | --- | --- | --- | --- |
| 1 | specify | PO / Analyst | engine `specify` | `spec.md`, `.size`, `.route` | None |
| 2 | clarify | PO / Analyst | engine `clarify` | `spec.md`, `CONTEXT.md` | PO / Analyst: the spec is ready: every open question closed or deferred |
| 3 | epic | PM | engine `classify-size` | `docs/roadmap.md`, `hub/feature.yaml` | PM: size, route and the team leads |
| 4 | ux-flows | Designer | engine `ux-flows` | `ux-flows.md` | PO / Analyst: the flows match the user stories |
| 5 | tech-design | Engineering | engine `design` | `sad.md`, `adr/*` | Engineering: architecture review by the Web, Android and iOS leads |
| 6 | data-model | Engineering | engine `data-model` | `data-model.md`, `migrations/` | Engineering: the schema and the rollback migration |
| 7 | api | Engineering | engine `api` | `contracts/openapi.yaml` | Engineering: the contract merge request, approved by the client leads |
| 8 | screens | Designer | engine `screens` | `screens.md` | PO / Analyst: every state can be built on each platform |
| 9 | tasks | Engineering | engine `tasks` | `tasks.json`, `tasks/tracker.md` | Engineering: the task split, by each team lead |
| 10 | sprint | PM | hub | `hub/feature.yaml` | PM: sprint contents and the order between teams |
| 11 | plan-tests | QA | engine `plan-tests` | `test-plan.md` | QA: every criterion is covered on every platform |
| 12 | implement | Engineering | engine `implement` | `tasks/tracker.md` | Automatic: tests and lint on every task |
| 13 | review | Engineering | engine `review` | `_review/review-*.md` | Engineering: the team lead approves each merge request |
| 14 | ship | Engineering | engine `ship` | `CHANGELOG` | Engineering: the part was run for real against its criteria |
| 15 | staging | Ops | hub | `hub/release.yaml` | Ops: the smoke check passed on every client |
| 16 | verify | QA | hub | `hub/bugs/`, `test-plan.md` | QA: every criterion passes or is not applicable on every platform |
| 17 | autotests | QA | hub, no LLM | `tests/<run>.json` | Automatic: the latest CI run is green in every team repository |
| 18 | final check | QA | hub, no LLM | `hub/signoffs.yaml` | QA: pass to release, or return to development with a reason |
| 19 | accept | PO / Analyst | hub, no LLM | `hub/signoffs.yaml` | PO accepts, then the PM gives the go or the no-go |
| 20 | release | Ops | hub | `hub/release.yaml` | Ops: every production deploy and every rollout stage, then a watch period of 7 days |

The final QA entry holds the decision (pass or return), the reason, the bugs it returns and a cycle number. A return opens the next cycle and earlier entries stay as history. The go or no-go lives in `release.yaml` only.

### How the current step is detected

The hub checks from the end of the flow backwards and stops at the first match.

1. `release.yaml` says the rollout finished: released.
2. The QA decision in `signoffs.yaml`: passed to release, or returned.
3. Bugs on main and test runs on `hub-state`: verification and autotests.
4. Team snapshots: an open merge request (ship), the latest review verdict (review), the done count in `tasks/tracker.md` (implement), a `tasks.json` (tasks).
5. SDD artifacts in backbone order: `spec.md`, `ux-flows.md`, `sad.md`, `data-model.md`, `contracts/openapi.yaml`, `screens.md`, `test-plan.md`.

Three refinements sit on top:

- **Route.** `.route` explains a missing optional artifact. On the quick route it is a legal skip and shows as skipped.
- **Sign-off.** A step whose artifact exists but whose sign-off is missing shows as waiting for sign-off, with the person's name.
- **Running.** A started event without a finished event shows the step as running, and by whom.

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
| Acceptance and go or no-go | PO, then PM | `signoffs.yaml` | Both are recorded |
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
| Feature: Tasks | Dependency graph and list per team, with cross-team waits | Filter by team, open the task file |
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
| Sign-offs and the QA decision | The owner of that gate |
| Release checklist and rollout stage | Ops |
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
| PO / analyst | `docs/features/*/spec.md`, `.size`, `.route`, `CONTEXT.md`, `hub/feature.yaml`, own sign-offs |
| PM | `docs/roadmap.md`, `hub/feature.yaml`, the go or no-go in `hub/release.yaml`, own sign-offs |
| Designer | `docs/design-system.md`, `ux-flows.md`, `screens.md`, own sign-offs |
| Developer | Own sign-offs and the status of bugs on their team |
| Team lead (a developer with `lead: true`) | Also `sad.md` and `data-model.md`; the lead of the team that publishes the API contract also `contracts/**` |
| QA | `test-plan.md`, `hub/bugs/**`, the QA decision |
| Ops | `hub/release.yaml` and, by merge request to the admin, the `hub-ci` project |

Everyone can read everything in the repository. The rules restrict writing only.

```yaml
# .hub/roles.yaml (excerpt)
people:
  - { user: olena.k, name: Olena K., role: po }
  - { user: taras.m, name: Taras M., role: dev, team: backend, lead: true }
  - { user: iryna.s, name: Iryna S., role: qa }
roles:
  po:
    write:
      - docs/features/*/spec.md
      - docs/features/*/hub/feature.yaml
      - CONTEXT.md
  qa:
    write:
      - docs/features/*/test-plan.md
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

This project runs on self-managed GitLab, so the rest of this document uses GitLab words. The hub asks for the host at init and keeps every difference in one host adapter.

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
4. Setup vendors the hub into `hub/`, writes `.hub/*` and the assistant files, makes the first commit and creates the `hub-state` branch.
5. It applies the host settings through the API and opens one merge request in each team repository to add the `hub-report` job. Anything it may not change is listed as left for people.
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
| 2 Repositories | Team repositories: any number of rows with team name, repository and kind | Backend `backend`, Web `web-admin`, Android `android-app`, iOS `ios-app` | `teams[]` |
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

Before the review screen, setup checks what the install needs: Owner rights, a CI runner that is online (without one no change could ever merge), the host version, and that forking of the specifications repository is off. On GitHub Free it stops on the first screen and asks whether to continue in advisory mode.

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

Six phases, each usable on its own; the first needs no hub at all.

| Phase | Scope | Done when |
| --- | --- | --- |
| 0. Pilot by hand | The hub-and-sync repository layout from the map and SDD on one feature, without the hub | One feature has shipped through all the steps |
| 1. Read-only site | `hub init` and `hub serve`, stage detection, the Features, Flow, Documents and Tasks screens, copy-prompt | Every role can see the real state of the pilot feature on their machine |
| 2. Plugin and writing | The `hub` plugin for Claude Code with `next`, `status`, `signoff` and `bug`; saves through merge requests; `hub-guard`; People, roles and setup scripts | A new person is working 15 minutes after receiving a script, and an edit outside a role is refused at merge |
| 3. QA and release | Test runs from CI and local, bugs, the QA decision, the release checklist, team snapshots from `hub-report` | A feature goes from staging to released with the site as the only tracker |
| 4. Metrics | Usage hooks, the Costs screen, estimates against actuals, encrypted per-person records | Cost per feature is within 10% of the provider's report for the same period |
| 5. Other assistants and headless | Codex and Cursor skills, headless validation, a second engine adapter as proof | The same step of one feature runs from all three assistants |

Screens and commands added after the first draft fall into the same phases. Phase 1 also has Home, Your guide, command help, the Features graph and `hub-report`, because the Tasks screen needs team snapshots. Phase 2 also has the task page, sign-off and light edits. Phase 5 also has the setup site. Until phase 2 lands, branch protection stays off and the site is read only. The phase 4 check is against the admin console's monthly export for the team, since seats are not billed per feature.

## Hardening and lifecycle

This section closes gaps found in a review of the design: what the guard checks beyond paths, what happens when a save fails, how the hub reaches team repositories, and what happens to people, teams and versions over time.

### Guard rules

- The default is deny. A path that no role is allowed to change can be changed only by the admin. That covers `hub/**`, `.hub/**`, the assistant folders (`.claude/**`, `.agents/**`, `.codex/**`, `.cursor/**`, `CLAUDE.md`, `AGENTS.md`) and CI files, because they run on every machine.
- The guard script and its tests live in the `hub-ci` project on GitLab, or come from the default branch on GitHub. The merge request is only data: the list of changed files and their contents.
- `signoffs.yaml` is append-only. A new entry must name the merge request author as the person, and its step must be a gate of the author's role. Existing entries cannot be edited or removed.
- A sign-off records the content hash of the file it approves. It stays current while the hash matches; a wording-only edit carries it forward and is logged.
- `release.yaml` and bug files are checked field by field: the PM writes the go or no-go, Ops the checklist and the rollout, a developer the status of a bug on their own team, QA everything in a bug.
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

## Risks and open questions

The largest risks come from building on things the hub does not control: SDD's file layout and each assistant's session data.

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| SDD keeps no state file | Stage detection relies on artifacts, the tracker and review files | Hooks add explicit events, and the adapter holds all detection rules in one place |
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
- [ ] How long is the watch period after a rollout before a feature counts as released?

## Sources

Pages read for this design on 7 October 2026.

- SDD engine: [genkovich/sdd](https://github.com/genkovich/sdd), release v2.3.0 (README, skill files, `install.sh`)
- Claude Code: [plugins](https://code.claude.com/docs/en/plugins), [plugin marketplaces](https://code.claude.com/docs/en/plugin-marketplaces), [hooks](https://code.claude.com/docs/en/hooks), [headless mode](https://code.claude.com/docs/en/headless), [costs](https://code.claude.com/docs/en/costs), [permissions](https://code.claude.com/docs/en/permissions), [MCP](https://code.claude.com/docs/en/mcp)
- Codex: [skills](https://learn.chatgpt.com/codex/skills), [non-interactive mode](https://developers.openai.com/codex/noninteractive.md), [hooks](https://developers.openai.com/codex/hooks.md), [config reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- Cursor: [headless CLI](https://cursor.com/docs/cli/headless), [output format](https://cursor.com/docs/cli/reference/output-format.md), [hooks](https://cursor.com/docs/agent/hooks), [CLI permissions](https://cursor.com/docs/cli/reference/permissions), [skills](https://cursor.com/help/customization/skills.md)
- GitLab: [protected branches](https://docs.gitlab.com/user/project/repository/branches/protected/), [server hooks](https://docs.gitlab.com/administration/server_hooks/), [Code Owners](https://docs.gitlab.com/user/project/codeowners/), [push rules](https://docs.gitlab.com/user/project/repository/push_rules/), [predefined CI variables](https://docs.gitlab.com/ci/variables/predefined_variables/), [project access tokens](https://docs.gitlab.com/user/project/settings/project_access_tokens/), [pipelines API](https://docs.gitlab.com/api/pipelines/), [MCP server](https://docs.gitlab.com/user/model_context_protocol/mcp_server/)

Two details come from community sources and are marked as risks above: the layout of Codex session files and the `usage` object in Cursor's headless result.

The GitHub column was checked on the same day against [about protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [about rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) and the [pull\_request\_target change note](https://github.blog/changelog/2025-11-07-actions-pull_request_target-and-environment-branch-protections-changes/). The auto-merge page could not be opened, so that row and the author field are from memory and need a check during the build.
