# Decisions

A dated log of what was decided about SDLC Hub and why. The newest entries come first. The specification shows the result; this file keeps the reason. "Owner" means the product owner decided. "Proposed" means Claude proposed it in the phase 1 plan, which the owner approved.

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
- **Decision:** tech-design, data-model and api run in the repository of the team that publishes the API contract. Detection reads them from that team's `hub-report` snapshot, plus the contract merge request in product-specs. Only that team's lead writes `sad.md`, `adr/**`, `data-model.md`, `migrations/**`, `_audit/**` and `contracts/**` in product-specs.
- **Why:** This is how the AI-SDLC map runs the backend-first steps. Otherwise the steps would look not started while the backend works on them. It is also why `hub-report` is in phase 1.
- **By:** Owner (repository and detection); proposed (the lead's paths).

### Step ids are kebab-case
- **Decision:** `specify, clarify, epic, ux-flows, tech-design, data-model, api, screens, tasks, sprint, plan-tests, implement, review, ship, staging, verify, autotests, qa-final, accept, release`.
- **Why:** The specification, the prototype and the command output used three different names for some steps. "final check" broke command parsing.
- **By:** Owner.

### The adapter maps every engine step; step id and engine stage are separate
- **Decision:** Each entry is keyed by the hub step id and names the engine `stage` (or `stages`), where the evidence is (`in`), whether the stage is `optional`, and the evidence (`done_when`). For example, `tech-design` runs `design`, then `sequences`.
- **Why:** Revision 50 mapped 9 of the steps under names that differed from the step table.
- **By:** Owner.

### fix is a return path, not a step
- **Decision:** The adapter lists `fix` under `returns`, apart from the twenty steps.
- **Why:** The step table already said so; the adapter disagreed.
- **By:** Owner.

### Epic is a hub step with no LLM
- **Decision:** At epic the PM names the teams and their leads in `feature.yaml` and records pass or return with `/hub:decide epic <slug>`. If the PM disagrees with the size or the route, the PM does not edit them: the step goes back to the PO with a reason, the same way QA returns a feature, and the PO runs `classify-size` again. Epic costs no tokens.
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
  - An optional step with no evidence shows as skipped when a later step has evidence.
  - `feature.yaml` no longer repeats size and route.
- **Why:** Each settles a small contradiction found in the review of revision 50.
- **By:** Proposed.

### Phase 1 build choices
- **Decision:** npm workspaces with the packages `core`, `git`, `host`, `server`, `web` and `cli`; Preact + Vite for the web app; synthetic fixture repositories until a phase 0 pilot exists.
- **Why:** These are not set by the specification, and phase 1 needs them.
- **By:** Owner (Preact + Vite, synthetic fixtures); proposed (the package split).
