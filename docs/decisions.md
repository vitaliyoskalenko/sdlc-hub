# Decisions

A dated log of what was decided about SDLC Hub and why. The newest entries come first. The specification shows the result; this file keeps the reason. "Owner" means the product owner decided. "Proposed" means Claude proposed it in the phase 1 plan, which the owner approved.

## 2026-10-10: Revision 67, tech-design waits for sequences; fan-out tokens

### tech-design waits for sequences, except on the quick route
- **Decision:** The SDD adapter's `tech-design` needs `_sequences-log.md` besides `sad.md` and `adr/`, unless the feature is on the quick route. The evidence language gains `route:<route>`.
- **Why:** The real SDD run showed that `sequences` leaves only its log, so `tech-design` showed done before `sequences` ran.
- **By:** Owner.

### File validation runs inside hub-guard
- **Decision:** `hub-guard` refuses a change whose hub files do not load, or that adds a problem to `.hub/` as a whole, in any guard mode. A person's team that `config.yaml` does not list is now a warning when `.hub/` loads.
- **Why:** The specification's `hub-validate`. Inside `hub-guard` it needs no second required check, and a save from the site gets the same answer before it is pushed.
- **By:** Proposed.

### hub-fanout uses one token per team repository
- **Decision:** On GitLab, install creates a project access token on each team repository and stores it as a masked variable of product-specs. The fan-out job uses it to open the merge request with the shared files there.
- **Why:** The specification's design. `HUB_STATE_TOKEN` belongs to product-specs and cannot open merge requests in team repositories, and a group access token needs Premium on gitlab.com.
- **By:** Owner.

## 2026-10-09: GitHub saves are nudged; release versions

### The person's server merges a slow GitHub save
- **Decision:** A pending save on GitHub still open after 90 seconds is merged through the API with the person's token. The ruleset still requires `hub-guard` to pass, so this changes nothing about who may merge what.
- **Why:** On github.com, auto-merge merged one save after 8 minutes and left the install pull request open with its check passed. Other runs merged in about 25 seconds.
- **By:** Found in verification.

### Versions shipped
- **Decision:** Ops records the version each team shipped on the Release tab, as `versions.<team>` in `release.yaml`. The plugin's release tool takes the same edit.
- **By:** Specification (the `versions` field); the UI was proposed.

## 2026-10-09: The real SDD run (claim 8)

### Read what SDD 2.3.0 actually writes
- **Decision:**
  - Criteria are read from headings as well as list items, with suffixed ids (`AC-02b`) everywhere an id is checked or matched.
  - Tracker ids are read from their markdown links.
  - Install ignores `.claude/*.local.md`, SDD's own pattern.
  - The real output is the fixture `packages/core/test/fixtures/sdd-2.3.0`.
- **Why:** A real run from `specify` to `tasks` found no criteria and whole links as tracker ids with the old readers.
- **Open:** `tech-design` counts as done after `design`, before `sequences`, which leaves only `_sequences-log.md`. Whether to wait for that log is the owner's call, because a size or route may skip `sequences`.
- **By:** Owner asked for the run; fixes proposed.

## 2026-10-09: Revision 66, conflicts, offline saves, rekey, setup merges its own pull request on GitHub

### Conflicting saves: merge once, then the person chooses
- **Decision:** A pending save that conflicts with `main` is merged onto it once, each file three-way. `signoffs.yaml` keeps both sides' entries. If that fails, the save shows "conflicts" with Keep mine and Use the newer one.
- **Why:** The specification's rule ("rebase once, then ask"). A plain rebase of an append-only YAML list always conflicts, while a union merge keeps both entries in order.
- **By:** Specification; the per-file merge was proposed.

### Offline saves are queued
- **Decision:** Without a connection, a save is made on the last fetched `main` and queued, then sent at the next look at the saves or `hub sync`. A queued save blocks a second save of the same file, like a pending one.
- **By:** Specification.

### hub usage rekey
- **Decision:** On the admin's or a PM's machine, `hub usage rekey` decrypts every usage record and encrypts it again to the person, the admins and the PMs that `roles.yaml` on `main` names now.
- **Why:** A new PM could not read records encrypted before they joined.
- **By:** Proposed.

### Setup merges its own pull request on GitHub
- **Decision:** After opening the install pull request and setting auto-merge, setup waits for `hub-guard` and merges it through the API.
- **Why:** On github.com, auto-merge left a pull request that changed `.github/workflows/hub-guard.yml` open, with its check passed and its state clean. A direct merge by the same owner worked.
- **By:** Found in verification.

## 2026-10-09: Revision 65, guard settings and Settings

### Advisory mode: warn, then merge
- **Decision:**
  - `guard.mode: advisory` makes `hub-guard` pass while it lists what breaks a rule: in the job log and, for a save from the site, in `hub-state` with `advisory: true`. The site shows "merged with warnings".
  - Saves still merge by themselves where the host has auto-merge.
  - On GitHub Free with private repositories, only advisory mode installs. Install adds no ruleset, writes `git.auto_merge: false`, and each pull request waits for someone to merge it.
- **Why:** The owner wanted a looser mode for teams that do not need the restrictions, and a way to install on GitHub Free with private repositories.
- **By:** Owner (chose "warn, then merge").

### Four checks the admin can switch off
- **Decision:** `guard.checks`: `files` (files by role), `signoffs` (who signs a gate), `pushers` (everyone who pushed), `members` (people not in `roles.yaml`). They are set at install (screen 4) and on Settings. Whatever the switches and the mode say, these stay admin-only and are refused even in advisory mode: `.hub/`, `hub/`, the assistants' files and CI files.
- **Why:** The owner chose all four switches. The admin-only paths run on every machine (hooks, MCP servers, CI). Loosening them would let anyone run code on everyone's machine, or switch the guard itself.
- **By:** Owner chose the switches; the admin-only limit was proposed.

### Settings page
- **Decision:** The admin changes the guard settings, the assistants allowed, headless runs and links through a save on `config.yaml`. The edit keeps the file's comments, and the file must still load. Everyone else reads the page. The project, teams and engine are shown read only and change by running setup again.
- **Why:** These are the settings the owner asked to change after install. Teams and the engine change files beyond `config.yaml`.
- **By:** Owner asked for Settings; scope proposed.

### GitHub closes a refused pull request
- **Decision:** On GitHub the guard closes a refused save's pull request after deleting its branch, so its workflow has `pull-requests: write`.
- **Why:** In the test organization, refused pull requests stayed open: GitHub does not close a pull request when its branch is deleted.
- **By:** Found in verification.

## 2026-10-09: Revision 64, the GitHub install

### GitHub install, built from the docs
- **Decision:**
  - Setup signs in to GitHub with a fine-grained token of an organization owner, and checks the owner role, the plan, the team repositories and `ssh-keygen`.
  - Install writes the hub files with git. Once the ruleset protects `main`, it opens a pull request with auto-merge instead.
  - Install turns on auto-merge and branch deletion, and creates `hub-state`.
  - It adds a deploy key with write access to product-specs, and stores the private half as `HUB_STATE_KEY` in each team repository, sealed with libsodium's sealed box.
  - It adds the ruleset "sdlc-hub: main": pull requests only, `hub-guard` required (from GitHub Actions on github.com), no deletion or force push.
  - It opens one pull request per team with a `hub-report` workflow on `workflow_run`.
  - `hub-guard` runs on `pull_request_target` from the default branch, with the pull request checked out as data only.
- **Why:**
  - A fine-grained token cannot be created through the API. A deploy key can, so nothing is left to do by hand.
  - `pull_request_target` keeps the workflow and the hub out of the author's reach.
- **By:** Owner chose a throwaway test organization for verification; the rest proposed. Verified on github.com on 9 October 2026. The run found that a new organization may have deploy keys turned off. Setup now checks that and tells the owner where to turn them on, rather than changing an organization-wide policy itself.

### Saves on GitHub open their own pull request
- **Decision:** GitHub has no push options. After pushing the branch, the person's server opens the pull request and sets auto-merge through the API. It uses the person's own token from git's credential helper. If that fails, the branch is deleted and the save fails with the reason.
- **Why:** A save must stay in the person's name and must never wait on a pull request that was not opened.
- **By:** Proposed.

### GitHub Free with private repositories is refused, not advisory
- **Decision:** For now, setup's plan check fails for a Free organization with private repositories. The advisory mode in the specification is not built.
- **Why:** Free has no auto-merge for private repositories, so every save would wait for someone to merge it by hand. That changes the product, and the owner has not decided it.
- **By:** Proposed; open for the owner.

## 2026-10-09: Revision 63, phase 5 so far

### The second engine is the hub's own
- **Decision:** `plain` ships with the hub: the same steps and evidence as SDD, each stage a prompt in `.hub/engines/plain/<stage>.md` that says what to write and in which format, run by the hub's `stage` command. Setup offers it beside SDD and a custom adapter.
- **Why:** It proves the adapter contract with no outside dependency, and gives a team a fallback that needs no engine plugin. On the demo every feature has the same state with either engine.
- **By:** Owner.

### Headless validation
- **Decision:** When `headless.enabled` is on, the local server starts the person's own Claude Code with `/hub:validate <slug>`. It runs in plan permission mode, with editing and shell tools denied and a turn limit; only the PO and the team leads may start it. The report is shown first; saving it is a separate action (`hub/validation/<time>.md`, a merge request). The run's usage is recorded by the plugin's hooks like any session.
- **Why:** The specification's rule: read-only tools, a turn limit, the person's seat, the result shown before anything is saved. A real run changed no file.
- **By:** Proposed; verified with Claude Code.

### Codex and Cursor from their documentation
- **Decision:**
  - One set of skills in `.agents/skills/hub-*/SKILL.md`, which both read.
  - Codex: `.codex/config.toml` and `.codex/hooks.json`, with commands that find the repository root through `git rev-parse`, because Codex may start in a subfolder.
  - Cursor: `.cursor/mcp.json` and `.cursor/hooks.json`, with `${workspaceFolder}`.
  - The hook command answers each assistant as its docs ask: Cursor gets JSON at session start and before a prompt, Codex's `Stop` prints nothing.
  - Usage: Codex's comes from the running total in its session file. Its format is read from the Codex source and marked `@unverified-codex-format`. Cursor keeps no token counts on the machine.
- **Why:** The owner chose to build from the docs and verify later; neither CLI is installed here.
- **By:** Owner.

## 2026-10-09: Revision 62, metrics

### Usage from the transcript, priced at list prices
- **Decision:** The `Stop` hook reads Claude Code's transcript since its last mark: each message once by its id, with model and usage, and cache writes split into 5 minutes and 1 hour. The hub prices that with a table taken from Anthropic's pricing page on 2026-10-08, which `prices` in `config.yaml` overrides per model. The session's feature and step come from a typed `/hub:x` (`UserPromptSubmit`) or a hub tool's input (`PostToolUse`). Records stay in the git directory until `hub sync`.
- **Why:** It needs nothing from the person. In a headless run, the cost the hub computed from the hooks was $0.1581636, exactly Claude Code's own `total_cost_usd` for that run.
- **By:** Proposed; verified.

### Keys in a folder per person, files per person and machine
- **Decision:**
  - Public keys are `.hub/keys/<user>/<machine>.pub`; the guard lets a person add files in their own folder only. Usage files are `metrics/<yyyy-mm>/<user>/<machine>.jsonl.age`.
  - The private key stays in the system keychain through git's credential helper, or in a file readable only by its owner where there is none.
  - `HUB_KEYS_DIR` keeps keys in a folder; tests use it, so no test touches a keychain.
- **Why:** With `<user>-<machine>.pub`, a user named `olena` could add `olena-k-laptop.pub`. The guard would have taken it as her own file, and `olena-k`'s usage would then have been encrypted to her. Two machines of one person would also have overwritten one usage file.
- **By:** Proposed.

### Open totals keep people out of sight
- **Decision:** Totals are kept per dimension (feature, step, role, team, model, assistant, and feature with step). A group of fewer than three people is merged into "other". An "other" that still has fewer than three people is left out, because subtracting it from the rest could reveal one person. Only the admin and the PM see each person, decrypted on their own machine; it is never published.
- **By:** Proposed, from the specification's rule.

### Install writes product-specs with git
- **Decision:** The files step commits with git: a shallow fetch, a commit and a push with the admin's token in git's environment, straight to `main` before it is protected, or to `sdlc-hub/install` with a merge request after. The GitLab API stays for merge requests, checks and small files in team repositories and `hub-ci`. Every GitLab request now fails after a minute instead of waiting forever.
- **Why:** On GitLab CE 19.4.1 a commit of the vendored hub (2.8 MB) through the commits API did not finish in five minutes; in one test run it answered after 15 minutes with an error and held the run up.
- **By:** Proposed; verified.

### The demo's usage
- **Decision:** The demo encrypts a month of made-up usage at start, with a key it makes then and keeps only in memory. The repository holds no key.
- **By:** Proposed.

## 2026-10-08: Revision 61, QA and release

### CI results come from the hub job at the end of each team pipeline
- **Decision:**
  - When a team has CI of its own, the template has `hub-tests-passed` (`when: on_success`) and `hub-tests-failed` (`when: on_failure`) in `.post`. Exactly one runs, and it publishes the team's snapshot and the pipeline's result for every feature the branch reports, as `tests/ci-<team>-<pipeline>.json` on `hub-state`.
  - A repository with no CI gets one `hub-report` job in `test`, because GitLab needs a job outside `.post`; that pipeline counts as passed. Install works the layout out again on every run, from the jobs in the team's `.gitlab-ci.yml`; a file that only includes the hub has none. A team that adds tests later gets the end-of-pipeline jobs through a merge request on the next install run.
  - The hub job has `allow_failure: true`, so the hub never turns a team's pipeline red. A run records passed or failed; counts are optional.
  - Pushes to `hub-state` carry `-o ci.skip`, so machine data starts no pipeline in product-specs.
- **Why:** It needs no token and no setup per team. The alternatives were reading JUnit reports at a known path, or asking GitLab at decision time with a token on QA's machine. The first version had a separate hub-report job beside the result jobs. On GitLab CE that doubled the hub's jobs, and the queue made merge requests wait minutes; one job per pipeline fixed it.
- **By:** Owner; the one-job layout proposed after the GitLab run.

### QA's verdicts live in hub/verification.yaml
- **Decision:** One record per criterion and platform, appended; the newest per cell counts, so earlier cycles stay as history. The platforms are the kinds of the feature's client teams, or of all its teams when it has none. A fail names its bugs. The site and the plugin refuse the verify sign-off until every cell passes or does not apply. The criteria are read from `spec.md` (`@assumed-sdd-format`).
- **Why:** A hub-owned file is simple for the guard and the site, and works for small features whose test plan lives inside `spec.md`. The specification had said "a verdict per criterion in test-plan.md", which would have mixed hub data into SDD's file.
- **By:** Owner.

### Local test runs use a command per team
- **Decision:** `teams[].test` in `.hub/config.yaml` names the command. `hub test <slug>` (and `/hub:test`) runs it in the person's clone of the team repository and records the run with the label local, who ran it and the commit.
- **By:** Owner.

### Bugs, the QA decision and the release on the site
- **Decision:**
  - A bug edit changes only the lines of the fields asked for, so the owning team's status change passes the guard's region rule.
  - The QA decision at `qa-final` is a sign-off entry: pass, or return with the reason and the bugs.
  - `release.yaml` is edited field by field: the smoke check, the checklist and the rollout by Ops, the go by the PM. Rollout at 100% starts the watch period. The default checklist is `release.checklist` in `flow.yaml`.
  - Accept waits for the PO's sign-off once the final check passed: its evidence is people's records only.
- **By:** Proposed.

### One change per file at a time
- **Decision:** While a person's save of a file waits to merge, a second save of the same file is refused with the reason, and the site's controls wait.
- **Why:** The release walk showed it. Two quick ticks of the checklist made two merge requests from the same main, and the second could not merge. Rebasing once is still not built.
- **By:** Proposed.

### The phase 3 exit check
- **Decision:** A browser test takes a feature from staging to released on the demo, each person doing their part on the site. Every save goes through the demo's stand-in for GitLab, which runs hub-guard and merges. The demo's clock now moves with real time, so saves and what the site reads agree.
- **By:** Test run on 8 October 2026.

## 2026-10-08: Revision 60, People and roles and the setup scripts

### hub setup records who the checkout belongs to
- **Decision:** `hub setup` sets `git config hub.user` once it has confirmed the person's roles on `main`. The site, the plugin and `hub doctor` take the person from there first, and from the git identity only when it is not set.
- **Why:** A git e-mail often does not match the username in `roles.yaml`, and the person would then not be recognised.
- **By:** Proposed.

### What the script expects of the hub, and what the admin sees
- **Decision:**
  - The script's hub release is a short hash of `hub/cli.js` on `main`. A newer hub is noted, not refused, because the checkout always runs `main`'s hub.
  - `hub setup` writes `people/<user>.json` to `hub-state` with the person's own credential, and People and roles shows it as "set up" with the date.
  - The local Claude Code path rules are guidance only: they deny edits to `.hub/`, `hub/`, `.claude-plugin/` and `signoffs.yaml` to everyone but the admin. The local settings file is kept out of commits in the checkout itself and in `.gitignore`, because a machine may have no global ignore for it.
- **Why:** A version number would need a release process the hub does not have yet. The admin needs to see who has finished setup without asking.
- **By:** Proposed; verified by running a generated script against GitLab CE.

### People and roles saves like everything else
- **Decision:** Adding, changing or removing a person is one change to `.hub/roles.yaml`, saved through a self-merging merge request. The site checks it first, like the guard: an unknown role or team, a lead without a team, removing the last admin, a username a script cannot carry. Everyone can read People and roles and the setup scripts, which hold nothing secret; only the admin changes people.
- **By:** Proposed.

## 2026-10-08: Revision 59, the Claude Code plugin

### The MCP server reads the checkout itself, not the local server
- **Decision:** `node hub/cli.js mcp` serves `hub_status`, `hub_next`, `hub_signoff`, `hub_return` and `hub_bug` over stdio. It opens product-specs directly and saves through the same code as the site's actions (`packages/save`), so the plugin works when the site is not running and needs no session with the server. Saves from both appear in the same record, `.git/sdlc-hub/saves.json`. It uses the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`), bundled into `hub/cli.js`, because Claude Code now negotiates protocol revision 2026-07-28.
- **Why:** The specification had the MCP server ask the local server. That needs the server running and a way to authenticate the assistant to it; the files and the guard give the same answer without either.
- **By:** Proposed.

### Where the plugin lives and how people get it
- **Decision:**
  - Install writes `hub/plugin/` (skills, `.mcp.json`, hooks), `.claude-plugin/marketplace.json` (marketplace `product-specs`) and `.claude/settings.json`. The settings enable `hub@product-specs` and `sdd@sdd`, with `genkovich/sdd` as a GitHub marketplace.
  - `.mcp.json` runs `${CLAUDE_PROJECT_DIR}/hub/cli.js`.
  - Each person registers the marketplace on their own machine at local scope; the setup scripts will do this.
  - The plugin's version ends with a hash of its files, so every change reaches people as a new version.
- **Why:** Verified with Claude Code 2.1.292 (claim 6). An installed plugin is a cached copy that may not reach outside its folder. A relative marketplace path in the shared settings does not install, and the CLI writes an absolute path, which cannot be shared.
- **By:** Proposed; verified.

### A save from the assistant is confirmed in the chat
- **Decision:** Only the person starts `/hub:signoff`, `/hub:return` and `/hub:bug`. Each shows what will be saved, asks the person to confirm it in the chat, and stops; it saves only after their reply. The saving tools are not pre-allowed.
- **Why:** The plan relied on Claude Code's permission prompt as the confirmation. In auto permission mode that prompt does not appear, as a headless run showed.
- **By:** Proposed; verified in a two-turn headless run.

## 2026-10-08: Revision 58, saving from the site

### A save is a git push; the guard records refusals in hub-state
- **Decision:** The site saves with git alone. The local server commits in its own worktree and pushes a branch `hub/<user>/<label>-<time>` with GitLab push options, which open the merge request and set it to merge when the pipeline succeeds (claim 16). It sees a save merged when `main` has it. When `hub-guard` refuses a save branch, the job writes the reason to `hub-state` and deletes the branch with `HUB_STATE_TOKEN`, which closes the merge request (verified on GitLab CE). The site reads the reason from there.
- **Why:** People sign in with a credential manager or an SSH key and may have no API token. A personal API token for everyone was the alternative; it would shut out people on SSH alone and give every machine a broader token.
- **By:** Owner.

### The site checks a save with the guard before it pushes
- **Decision:** The server builds the change from `main` of the remote and runs the same `guard()` on it before pushing. A refusal is shown at once and nothing is pushed. A sign-off records the file it approves and its content hash: the step's own file in product-specs, or the previous step's when the gate is the step's only evidence (clarify approves `spec.md`). Steps whose files live in team repositories record none.
- **Why:** A refusal at merge takes a pipeline run; most mistakes can be caught on the person's machine with the same code.
- **By:** Proposed.

### The demo has a stand-in for the git host
- **Decision:** `npm run demo` gives the demo checkout a bare remote. After each save it runs `hub-guard` on the branch, as the CI job would, then merges it or records the refusal, and brings the checkout up to date. Sign off and Return can be clicked through without GitLab.
- **By:** Proposed.

## 2026-10-08: Revision 57, hub-guard on GitLab

### The guard runs main's hub/cli.js, configured from hub-ci
- **Decision:** `hub-ci` holds only the job configuration, `ci/product-specs.yml`, which product-specs uses as its CI/CD configuration file. The job fetches `main` and runs `hub/cli.js` from it with `guard --rules FETCH_HEAD`. It never runs code from the merge request's checkout. The rules (`roles.yaml`, `config.yaml`, `flow.yaml` and each `feature.yaml`) are read from `main` as well.
- **Why:** The specification asked for the guard script itself to live in `hub-ci`. That would need a second copy of the hub to keep in step. `hub/**` on `main` already changes only by an admin's merge request, so a merge request cannot change the code that judges it, and the property holds with one copy.
- **By:** Proposed.

### Who the guard judges
- **Decision:** The guard judges the merge request author, read from the merge request API, and every person who pushed to the branch. Those people are the pipeline's user plus the authors of the project's push events to the branch since its base commit. Both are read with `HUB_GUARD_TOKEN`, a project access token of product-specs (`read_api`, Reporter) stored as a masked project variable that is not protected, because merge request branches are not protected.
- **Why:** GitLab CI has no author variable, and commit authors can be anything. The push events name the people GitLab authenticated.
- **By:** Proposed; verified on GitLab CE. A developer's push followed by the PO's push and merge request was refused, naming the developer.

### The order of the install's phase 2 steps, and updates once main is protected
- **Decision:** The steps run in this order:
  1. the files (pushed directly while `main` is still open);
  2. forking;
  3. `hub-state`;
  4. `HUB_STATE_TOKEN`;
  5. `hub-ci`, with its `main` protected for Maintainers (push and merge);
  6. `HUB_GUARD_TOKEN`;
  7. the CI configuration path, with "Pipelines must succeed" on and skipped pipelines not counting;
  8. last, `main` protected (push: No one, merge: Developers).

  After that, a later run sends its file changes through the `sdlc-hub/install` merge request, which merges itself when the admin passes `hub-guard`.
- **Why:** The bundle that has the `guard` command must reach `main` before the configuration that calls it. Even the admin changes `main` only through a merge request.
- **By:** Proposed; verified on GitLab CE.

### Verified on GitLab CE 19.4.1 (Free)
- **Decision:** `npm run test:gitlab` now also proves the phase 2 exit criterion, "an edit outside a role is refused at merge":
  - The admin's merge request adding people to `roles.yaml` merges by itself.
  - The PO's spec change merges by itself, in her name.
  - The PO's change to `.hub/config.yaml` fails `hub-guard`, with the reason in the job log, and stays open.
  - A change pushed with `[skip ci]` gets a skipped pipeline and does not merge.
  - A direct push to `main` is refused, even for the admin.

  Two new accepted risks are recorded as claims 14 and 15 in `docs/open-items.md`.
- **By:** Test run on 8 October 2026.

## 2026-10-08: Revision 56, phase 1b on GitLab CE

### Setup signs in with a pasted personal access token
- **Decision:** The admin pastes a personal access token with the `api` scope. Setup keeps it in the system keychain through git's credential helper, or in memory when there is none, and says which. A link opens the host's token page with the name and scope filled in. `hub init --no-keychain` keeps it in memory only.
- **Why:** It works on any self-managed instance without an instance admin registering an OAuth application (claim 9).
- **By:** Owner.

### Tested against GitLab CE in Docker, not gitlab.com
- **Decision:** Phase 1b is tested against GitLab CE 19.4.1 in Docker, with the Owner as a non-admin. `e2e/gitlab/bootstrap.mjs` prepares it; `npm run test:gitlab` runs the install twice, merges a hub-report merge request and waits for its pipeline.
- **Why:** gitlab.com Free has no project access tokens; they need Premium there, while self-managed Free has them. A gitlab.com test would fail for a reason the team's server does not have. The specification's plan row now says so.
- **By:** Owner.

### How the install writes and resumes
- **Decision:**
  - product-specs and the team repositories are written through the API, so no local clone is needed.
  - Only the orphan `hub-state` branch is pushed with git, with the token in git's environment, never on its command line.
  - Each step checks the host before it acts, which makes a second run safe; there is no `.hub/install.log`.
  - The hub-report job goes into a team repository as `ci/hub-report.gitlab-ci.yml`, included from `.gitlab-ci.yml`. The include is added above the team's file, which otherwise stays byte-identical. The job runs in stage `.post` when the team has CI, `test` when it has none.
  - `HUB_GIT_URL` overrides the server address for runners that reach GitLab under another name.
- **Why:** A real GitLab showed two problems a unit test had not. A script line containing "Authorization: Basic" is read as a YAML key, so the script is one literal block. And a merged older job must be updated, not skipped.
- **By:** Proposed; verified on GitLab CE.

### Claims verified on GitLab CE 19.4.1 (Free)
- **Decision:** These claims are verified:
  - **3:** project access tokens and masked group variables work for a non-admin Owner.
  - **11:** the checks work for a non-admin Owner.
  - **12:** team CI publishes to `hub-state` with `HUB_STATE_TOKEN`.

  **13** is confirmed: the token can push to any unprotected branch, an accepted risk until phase 2. **10** is verified on macOS. **9** is replaced by token sign-in.
- **By:** Test run on 8 October 2026.

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
