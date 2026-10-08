# Decisions

A dated log of what was decided about SDLC Hub and why. The newest entries come first. The specification shows the result; this file keeps the reason. "Owner" means the product owner decided. "Proposed" means Claude proposed it in the phase 1 plan, which the owner approved.

## 2026-10-08: Revision 55

### A wait marker with the count, and the Home tile "Blocked by another team"
- **Decision:** The step stays running. A red marker with the number of waiting teams ("⧗ 3 teams wait") stands beside it in the Features list, on the graph track and in the Now strip. The Home tile is named "Blocked by another team", as in the prototype, and counts the waiting teams; it opens the Features list filtered to these features.
- **By:** Owner.

### The task page is in phase 1a
- **Decision:** An action on Home opens as a task page over the current screen, read only. It shows:
  - the feature and its step;
  - the detail the action needs: the waiting tasks for a wait, the open bugs and test runs at a QA step, otherwise the step with its gate and prompt;
  - the command to copy;
  - the button to the place on the site.

  It follows the prototype. Revision 51 had put it in phase 2.
- **By:** Owner.

### The demo carries the prototype's sample data
- **Decision:** The demo uses the prototype's task titles, criteria, stories, bugs and pipeline numbers, so it can be shown to the team. It stays synthetic and is replaced when a real SDD run arrives.
- **By:** Owner.

### Git authors in one call per repository
- **Decision:** One `git log --name-only` per repository names the last author of every file. One whole-file `git blame` per event log names its lines, and one `git cat-file --batch` reads hub-state. The first load of the demo went from 0.9 s to 0.18 s.
- **By:** Owner.

## 2026-10-08: Revision 54, owner review of the phase 1a site

### Waits between teams are shown everywhere, not only on the Tasks screen
- **Decision:** A wait on another team is shown:
  - on Home: as an action for the lead whose task is waited for ("Web, Android and iOS wait for your T2"), for each waiting lead ("Your T3 waits for Backend T2") and for the PM, and in the statistics as "Features where a team waits for another";
  - in the Features list;
  - on the Features graph, as a ring on the current mark and a line under the feature's name;
  - in the Now strip.

  The step stays running while the waiting teams still have work, and turns blocked only when a team has nothing else it can do.
- **Why:** The rule for blocked is sound, but clients waiting for the backend is the pain the hub was started for. Showing it only on the Tasks screen hid it.
- **By:** Owner.

### Home actions come from the detected state
- **Decision:** The actions on Home are derived from detection, not written as sample text like the prototype's.
- **By:** Owner (accepted).

### The graph names who holds each feature
- **Decision:** Under each feature's name the graph shows who holds it now: the people its step waits on, else who runs it, else the role.
- **Why:** The review found the graph showed where each feature was but not who had it.
- **By:** Review.

## 2026-10-07: Revision 53

### A feature with no user interface: ui: false in feature.yaml
- **Decision:** The PM sets `ui: false` in `feature.yaml` at epic for a feature with no user interface. ux-flows and screens then show as skipped on every route. The hub warns when `target_surfaces` in `sad.md` disagrees.
- **Why:** On the full route the hub showed these steps as missed, while SDD skips them for backend-only work. SDD records no signal for ux-flows. Its "no human-facing UI" condition (`skills/_shared/size-matrix.md`) is judged from the spec's actors in a stage's handoff and is not written down. For screens it uses `sad.md` `target_surfaces`, which exists only from step 5.
- **By:** Owner (the rule if SDD records no signal); the SDD behaviour was checked at v2.3.0.

### Node 22 is the minimum
- **Decision:** Node 22 or newer, in the specification, the setup checks, the setup script and `CLAUDE.md`.
- **Why:** The Node.js release schedule (nodejs/Release `schedule.json`, read on 7 October 2026) gives Node 20 an end of life of 30 April 2026. Node 22 is the oldest supported LTS line, until 30 April 2027, so this minimum must be raised again before then.
- **By:** Owner.

### Three detection rules confirmed
- **Decision:** These rules from phase 1a are confirmed:
  - When the contract team is not one of a feature's teams, that feature follows the no-contract rule.
  - CI results are not later evidence.
  - Partial evidence shows as running, or as waiting for sign-off when only a person's record is missing.
- **By:** Owner.

## 2026-10-07: Revision 52, owner review of revision 51

### Skipped or missed depends on the route
- **Decision:** Each skippable step lists the routes that allow a skip (`skippable_on`, from SDD's route table: `quick` and `standard`; `full` runs every stage; a missing `.route` counts as `standard`). A step with no evidence while a later step has evidence shows as skipped when the route allows it, and as missed with a warning when the route requires it.
- **Why:** Revision 51 showed every such step as skipped on any route, which hid a stage that should have run.
- **By:** Owner. Supersedes the skip rule under "Smaller resolutions" in revision 51.

### Only sad.md, data-model.md and contracts/** of steps 5 to 7 live in product-specs
- **Decision:** The contract merge request copies `sad.md`, `data-model.md` and `contracts/**` to product-specs, and only the contract team's lead may write those there (the PO keeps the `feature_size:` field of `sad.md`). `adr/**`, `migrations/**` and `_audit/**` stay in the contract team's repository. With no contract team, steps 5 and 6 run in every team repository, step 7 is skipped, nothing is copied to product-specs, and each team's lead signs its own tech-design gate.
- **Why:** The AI-SDLC map (`prototypes/map/v2_data_over.js`, the api step and the files table) lists exactly these three for the merge request. Revision 51 restricted paths that never reach product-specs and had no rule for a project without a contract team.
- **By:** Owner (restrict only what lives there, add the no-contract rule); the file list is from the map.

### Rules below the file level are a structural check
- **Decision:** The guard parses both versions of the file into front matter keys and ATX sections (ignoring fenced code). It cuts the allowed region out of both, requires the rest to be byte-identical, and requires the region to keep its place. A renamed or moved heading is refused. `packages/core` implements this with tests for a renamed heading, a moved section, a captured heading and a duplicate heading.
- **Why:** A text search would let a renamed or moved heading through. SDD v2.3.0 `plan-tests` writes the plan into `spec.md` under `## Test plan` (not into `test-plan.md`) for XS or S and on the quick route (`skills/plan-tests/SKILL.md`, steps 2 and 10), so QA needs this one section of the PO's file.
- **By:** Owner (structural check); the SDD behaviour was confirmed from source.

### decide is for the QA final check only; return sends a step back
- **Decision:** `decide <slug>` stays the QA final check. A new command, `return <step> <slug> <reason>`, lets any gate owner send a step back. `flow.yaml` names where each gate returns to (`returns_to`, by default the step itself). The PM uses `return epic` to send the size and route back to the PO at clarify (`returns_to: clarify`, because a return must land on a step with a human gate that can answer it), and `signoff epic` to pass.
- **Why:** A general return keeps `decide` simple and gives every gate the same way back.
- **By:** Owner. Supersedes `decide epic` from revision 51.

### Fixes from a fresh-context review
- **Decision:** A reviewer with no prior context read the draft for contradictions. Its 21 findings were fixed:
  - Each person may add their own key file under `.hub/keys/`.
  - `release.yaml` is checked field by field, not append-only.
  - "No change needed" is a `confirm` entry by the owner of the step.
  - Engineering gates are signed off by people named through `feature.yaml` and `roles.yaml` (`by` in `flow.yaml`), because Free has no required approvals.
  - `fix` starts from verify and from a return at `qa-final`.
  - A return entry names `returns_to`, the same field as `flow.yaml`.
  - `api` is skipped on every route when there is no contract team.
  - The validation report is written by the local server with a timestamp.
  - `verify` writes test runs.
  - The setup script carries `HUB_ROLES`.
  - The key used for usage records is per machine.
  - `HUB_STATE_TOKEN` can push to any unprotected branch until phase 2 (an accepted risk).
  - One list of fanned-out files.
  - A blocking bug is any bug of high severity or above that is not closed or rejected.
  - The detection order lists every step.
  - One status list.
  - `decide` is in phase 3.
- **Why:** Each pair of places said different things, and some would have refused valid changes at the guard.
- **By:** Review; the owner asked for the review and the fixes.

### Commits carry no AI attribution
- **Decision:** Commits in this repository have no `Co-Authored-By` line and no AI attribution, and nothing is pushed unless the owner asks. The rule is in `CLAUDE.md`.
- **Why:** Owner's preference.
- **By:** Owner.

## 2026-10-07: Revision 51, after planning phase 1

### The specification in this repository is the source of truth
- **Decision:** `docs/specification.md` in this repository is the source of truth from revision 51. The published copy is a snapshot.
- **Why:** The specification, the prototypes and the map disagreed in places, and one place has to win.
- **By:** Owner.

### SDD 2.3 checked against its source
- **Decision:** The adapter, the data model and step detection follow what SDD v2.3.0 (commit `4403913`) actually writes:
  - `.size` and `.route` are one bare word each. `specify` writes both, and a missing `.route` means `standard`.
  - `classify-size` writes only `.size` and `.route`, and keeps `feature_size:` in step in `spec.md` and `sad.md`.
  - `tasks/tracker.md` exists. It is a table with `Blocked by` and `Status` columns, with the states `todo`, `in_progress`, `blocked`, `review` and `done`.
  - `tasks.json` ids are `T1`, and `deps` may name only ids in the same file.
  - `review` writes `_review/review-<date>.md` with the gate result `PASS` or `CHANGES REQUESTED` in prose. There is no front matter.
  - `plan-tests` writes a `## Test plan` section in `spec.md` for XS and S and on the quick route.
  - `api` may write other contract files than `openapi.yaml`.
  - `ship` only proposes the merge request command.
  - `CONTEXT.md` has a root level and a feature level.
  - A skipped stage leaves no marker on disk.
- **Why:** Revision 50 assumed several of these from the README. Step detection is built on them.
- **By:** Read-only check of the skill files and templates.

### Phase 1 is split into 1a and 1b
- **Decision:**
  - 1a: core, step detection, `hub report`, and the read-only hub site on fixture repositories.
  - 1b: the setup site and the GitLab install.
- **Why:** Something usable lands before the host work, which depends on claims about the GitLab instance.
- **By:** Owner.

### The setup site moves from phase 5 to phase 1b
- **Decision:** Install in 1b writes the files, vendors the hub, creates `hub-state`, stores `HUB_STATE_TOKEN` and opens the `hub-report` merge requests. Protected `main`, `hub-ci` and "Pipelines must succeed" come from a second Install run in phase 2, together with `hub-guard`.
- **Why:** Revision 50 listed `hub init` in phase 1 and the setup site, which is how init works, in phase 5. Protecting `main` before `hub-guard` exists would leave nothing to pass.
- **By:** Owner.

### GitLab only in the version 1 install
- **Decision:** One host adapter is built, with the GitLab implementation complete. On the GitHub path the setup site says clearly that install on GitHub is not available yet and stops before Install. The GitHub install moves to phase 5.
- **Why:** The team runs GitLab, and the GitHub claims are not verified.
- **By:** Owner.

### Team data: hub-state first, local clones as fallback
- **Decision:** The site reads team snapshots from `hub-state`. When a team has no valid snapshot it reads the local clone and marks the step as read from the local copy.
- **Why:** The snapshot is the shared view; the clone keeps the site useful before `hub-report` runs.
- **By:** Owner.

### Steps 5 to 7 happen in the contract team's repository
- **Decision:** tech-design, data-model and api run in the repository of the team that publishes the API contract. Detection reads them from that team's `hub-report` snapshot, plus the contract merge request in product-specs. Only that team's lead writes `sad.md`, `adr/**`, `data-model.md`, `migrations/**`, `_audit/**` and `contracts/**` in product-specs (narrowed in revision 52 to the three that live there).
- **Why:** This is how the AI-SDLC map runs the backend-first steps. Otherwise the steps would look not started while the backend works on them. It is also why `hub-report` is in phase 1.
- **By:** Owner (repository and detection); proposed (the lead's paths).

### Step ids are kebab-case
- **Decision:** `specify, clarify, epic, ux-flows, tech-design, data-model, api, screens, tasks, sprint, plan-tests, implement, review, ship, staging, verify, autotests, qa-final, accept, release`.
- **Why:** The specification, the prototype and the command output used three different names for some steps. "final check" broke command parsing.
- **By:** Owner.

### The adapter maps every engine step; step id and engine stage are separate
- **Decision:** Each entry is keyed by the hub step id and names the engine `stage` (or `stages`), where the evidence is (`in`), whether the stage is `optional` (replaced in revision 52 by `skippable_on`), and the evidence (`done_when`). For example, `tech-design` runs `design`, then `sequences`.
- **Why:** Revision 50 mapped 9 of the steps under names that differed from the step table.
- **By:** Owner.

### fix is a return path, not a step
- **Decision:** The adapter lists `fix` under `returns`, apart from the twenty steps.
- **Why:** The step table already said so; the adapter disagreed.
- **By:** Owner.

### Epic is a hub step with no LLM
- **Decision:** At epic the PM names the teams and their leads in `feature.yaml` and records pass or return with `/hub:decide epic <slug>` (changed in revision 52: `signoff epic` and `return epic`). If the PM disagrees with the size or the route, the PM does not edit them: the step goes back to the PO with a reason, the same way QA returns a feature, and the PO runs `classify-size` again. Epic costs no tokens.
- **Why:** `classify-size` writes only `.size` and `.route`, which `specify` already wrote at step 1. It does not write `roadmap.md` or `feature.yaml`. Letting the PM rerun it would give the PM write access to the PO's files.
- **By:** Owner.

### Cross-team waits live in the tracker
- **Decision:** A wait on another team is written in the `Blocked by` column of the waiting team's `tasks/tracker.md`, in the fixed format `<team-id>:<task-id>` (for example `backend:T2`). `hub-report` checks each reference against the other team's tasks, and the site shows an unknown reference as a warning on the Tasks screen, never dropping it. The order between teams is derived from these references; the PM only confirms it at the sprint gate. Teams get an `id` in `config.yaml`.
- **Why:** SDD's `tasks.json` may name only ids in its own file, and SDD does not read the `Blocked by` column, so nothing in SDD breaks.
- **By:** Owner.

### The go or no-go lives only in release.yaml
- **Decision:** `release.yaml` holds the PM's go or no-go. `signoffs.yaml` keeps the PO acceptance and every other gate.
- **Why:** Revision 50 named both files in different places.
- **By:** Owner.

### A sign-off records a content hash, not a commit
- **Decision:** An entry records the content hash of the approved file, with line endings normalised. It stays current while the hash matches.
- **Why:** The hash shows whether the approved content changed; a commit does not, and rebases change commits.
- **By:** Owner.

### Names on steps come from git; privacy covers spend only
- **Decision:** The site names the person on a running or finished step from the git author of the event commit or of the merge request. `events.jsonl` carries no username and no token counts. The privacy rule covers spend only: no per-person totals, tables or rankings outside the admin and the PM, and usage records stay encrypted per person.
- **Why:** Revision 50 asked for "by whom" on a running step while the event log carried no username. Git authors are already visible to the team.
- **By:** Owner.

### Section- and field-level guard rules
- **Decision:** QA may change only the `## Test plan` section of `spec.md`. The PO may change only the `feature_size:` field in `sad.md` front matter. Setup adds `.claude/sdd.local.md` to `.gitignore`.
- **Why:** SDD writes these places on behalf of other roles. Otherwise the default-deny guard would refuse a valid stage result: QA's small-feature test plan, the PO's `classify-size` rerun, and the `.gitignore` patch from `specify`.
- **By:** Proposed.

### Smaller resolutions
- **Decision:**
  - The hub is vendored as one file, `hub/cli.js`, with the web app embedded.
  - `roles.yaml` takes `role` or `roles`.
  - `CONTEXT.md` is writable by the PO at both levels.
  - The watch period defaults to 7 days (`release.watch_days` in `flow.yaml`).
  - The review gate is the team lead.
  - An optional step with no evidence shows as skipped when a later step has evidence (changed in revision 52: skipped or missed by route).
  - `feature.yaml` no longer repeats size and route.
- **Why:** Each settles a small contradiction found in the review of revision 50.
- **By:** Proposed.

### Phase 1 build choices
- **Decision:** npm workspaces with the packages `core`, `git`, `host`, `server`, `web` and `cli`; Preact + Vite for the web app; synthetic fixture repositories until a phase 0 pilot exists.
- **Why:** These are not set by the specification, and phase 1 needs them.
- **By:** Owner (Preact + Vite, synthetic fixtures); proposed (the package split).
