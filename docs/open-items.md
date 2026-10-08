# Open items

State on 7 October 2026, revision 51 of the specification. Items already fixed are not listed. Decisions that closed earlier items are in `docs/decisions.md`.

## Specification

- "Setup" means three things: the first-install site, the per-person `hub setup` command and the setup script. ("Step" now means one of the twenty, named by its step id; "engine stage" means an SDD stage.)
- The two diagrams (architecture; QA and release) still say GitLab only, were not redrawn, and do not show team snapshots as the source of steps 5 to 14.
- Prompt templates (`.hub/prompts/`) have no specified format yet.
- The JSON schema of a team snapshot (`hub-state/features/<slug>/teams/<team>.json`) is described by its fields only. It is defined in `packages/core` during phase 1a and then copied into the specification.
- Jira mirror of bugs: no command or trigger is specified, only the setting.

## Claims to verify

"Blocks" names the first phase that cannot finish without the claim.

| # | Claim | Blocks | How to verify | Status |
|---|---|---|---|---|
| 1 | GitLab: a merge request set to merge automatically uses the rights of the person who set it (the design therefore allows merge for Developers on protected `main`) | 2 | Set auto-merge as a Developer on a protected branch of a test project | **Verified** (GitLab CE 19.4.1 Free; `node e2e/gitlab/claims.mjs`, 8 October 2026): with main protected (push: No one, merge: Developers and Maintainers) and "Pipelines must succeed", a Developer's direct push is refused, and the merge request they set to merge when the pipeline succeeds merges, by them, once the pipeline passes. The real guard confirmed it again (`npm run test:gitlab`): the PO's change to a spec merged by itself in her name, her change to `.hub/config.yaml` failed `hub-guard` and stayed open, and a change pushed with `[skip ci]` got a skipped pipeline and did not merge. |
| 2 | GitLab: how pipelines run for merge requests from forks | 2 | Test project with forking on; phase 1b only reads `forking_access_level` | **Settled by forking off** (GitLab CE 19.4.1 Free; `node e2e/gitlab/claims.mjs`, 8 October 2026): with `forking_access_level` disabled, a member's fork of product-specs is refused, so no pipeline can come from a fork. |
| 3 | GitLab: group and project access tokens on self-managed Free | 1b | As a group Owner who is not an instance admin, create a project access token through the API (Developer role, `write_repository`), store it as a masked group variable, push to `hub-state` from a team repository's CI. Record the version and the expiry limit | **Verified** (GitLab CE 19.4.1, self-managed, Free, in Docker; `npm run test:gitlab`, 8 October 2026): a non-admin group Owner creates a project access token through the API (Developer, `read_repository` + `write_repository`, expiry up to 365 days) and stores it as a masked group variable; hub-report pushes to `hub-state` with it. **Not on gitlab.com Free:** there project access tokens need Premium or Ultimate (GitLab docs). |
| 4 | GitLab: the MCP server on Free from 19.2 | 2 | Instance version and the GitLab docs for it | Open |
| 5 | GitHub: required check tied to GitHub Actions as its source; auto-merge; plan limits for private repositories | 5 | GitHub docs and a test organization on the Team plan | Open |
| 6 | Claude Code: whether one plugin can declare another as a dependency; exact hook payloads; headless JSON fields | 2 | Current Claude Code docs and a test plugin | **Verified** with Claude Code 2.1.292 (headless runs on the demo, 8 October 2026). (1) An installed plugin is a cached copy and may not reach outside its folder, so `.mcp.json` runs `node ${CLAUDE_PROJECT_DIR}/hub/cli.js mcp`; it works. (2) The plugin's tools are named `mcp__plugin_hub_hub__<tool>`. (3) Hook payloads all carry `session_id`, `transcript_path` and `cwd`. A `/hub:x` the person types arrives in `UserPromptSubmit` as `prompt`, and no `PostToolUse` for `Skill` follows. An MCP call arrives in `PostToolUse` with `tool_name`, `tool_input` and `mcp_server`. `Stop` has `last_assistant_message`. (4) SessionStart output reaches the session. (5) The marketplace must be registered on each machine (`claude plugin marketplace add <folder> --scope local`, then `install`): a relative `directory` path in the shared settings does not install. (6) In auto permission mode no permission prompt appears, so the skills ask for confirmation in the chat. Plugin `dependencies` are not used: the shared settings enable `sdd@sdd` beside the hub. |
| 7 | Codex and Cursor: skill invocation syntax (`$hub-name`, `/hub-name`), hooks, where usage can be read | 5 | Current docs, and SDD's `install.sh codex` and `install.sh cursor` in a scratch repository. Command help in phase 1a shows the forms marked as unverified until then | Open |
| 8 | SDD 2.3: the files each stage writes, their names and formats | 1a | Read the skill files at tag v2.3.0, then run one feature from `specify` to `tasks` in a scratch repository and copy the output into the fixtures | Source checked on 7 Oct 2026 (see `docs/decisions.md`), so it no longer blocks 1a. The real run is still to do and replaces the synthetic fixtures when it lands |
| 9 | GitLab: sign-in through the browser on a self-managed instance needs an OAuth application registered on it | 1b | Ask the GitLab admin whether one exists. Fallbacks: a token pasted once, or `glab auth` | **Replaced:** setup takes a pasted personal access token (owner decision, 8 October 2026), so no OAuth application is needed. |
| 10 | The system keychain can be used through `git credential approve` and `fill`, with no native modules | 1b | Test with osxkeychain on macOS, libsecret on Linux and Git Credential Manager on Windows | **Verified on macOS** (osxkeychain: approve, fill, reject). Linux (libsecret) and Windows (Git Credential Manager) still to test. Without a helper the token stays in memory for the setup run, and the page says so. |
| 11 | The checks before install work for a group Owner who is not an instance admin | 1b | Call `GET /version`, group membership (access level 50), project or group runners, and group variables as such a user | **Verified** (GitLab CE 19.4.1, self-managed, Free, in Docker; `npm run test:gitlab`, 8 October 2026): version, Owner membership, the project's runners (instance runner seen) and group variables, as a non-admin Owner. |
| 12 | A team repository's CI can fetch the `hub-report` code from product-specs | 1b | Test `include: project:` across projects and a files-API read of `hub/cli.js` with `HUB_STATE_TOKEN` in a real team repository | **Verified** (GitLab CE 19.4.1, self-managed, Free, in Docker; `npm run test:gitlab`, 8 October 2026): the job clones product-specs over HTTPS with `HUB_STATE_TOKEN` as an `http.extraHeader` in git's environment, runs `hub/cli.js report` and pushes the snapshot. No `include: project:` needed. |
| 13 | `HUB_STATE_TOKEN` can push only to `hub-state` | 1b | On Free, a Developer-role token can push to any unprotected branch. Confirm, and accept it as a risk until `main` is protected in phase 2 | **Confirmed** (GitLab CE 19.4.1, self-managed, Free, in Docker; `npm run test:gitlab`, 8 October 2026): the token pushed to a new branch of product-specs. An accepted risk until `main` is protected in phase 2. Since phase 2 `main` takes no pushes, so the token can still write other branches, but nothing it writes reaches `main` without a merge request that passes `hub-guard`, and its bot user is not in `roles.yaml`. |
| 14 | A passed `hub-guard` stays valid until the merge request merges, even if `roles.yaml` on `main` changes in between | 2 | Found while wiring the guard. GitLab merges on the last pipeline's result; a person removed from a role after their pipeline passed could still merge | **Accepted risk** for now. A fix: when a change to `.hub/roles.yaml` merges, re-run the pipelines of open merge requests (phase 2 or later) |
| 15 | On GitLab Free a protected branch cannot be limited to the Owner: a Maintainer of the group can change `hub-ci` and the protection of `main` | 2 | Found while wiring the guard | **Accepted risk**: setup tells the admin to keep the people of the hub at Developer in the group. `hub-ci`'s `main` takes pushes and merges from Maintainers only |
| 16 | A save can open its merge request and set it to merge itself with git alone (push options), so it works over HTTPS or SSH without an API token | 2 | `git push -o merge_request.create -o merge_request.target=main -o merge_request.merge_when_pipeline_succeeds -o merge_request.remove_source_branch` as a Developer | **Verified** (GitLab CE 19.4.1 Free, 8 October 2026): pushed as olena.k with only her git credential, the merge request opened, was set to merge when the pipeline succeeds, and merged in her name after `hub-guard` passed |
| 17 | The PowerShell setup script runs on Windows | 2 | Run a generated `setup-<user>.ps1` on Windows with Git Credential Manager, Node 22 and Claude Code | **Open.** Only its content is checked: there is no Windows machine or `pwsh` here. The bash script is verified by `bash -n`, by a full run against bare repositories and by a full run against GitLab CE |
| 18 | GitLab runs a `.post` job with `when: on_success` only when every earlier job passed, and one with `when: on_failure` only when one failed, so the hub can record a pipeline's result with no token | 3 | A team repository with a passing pipeline on `main` and a failing test on a feature branch | **Verified** (GitLab CE 19.4.1 Free, `npm run test:gitlab`, 8 October 2026). `main` recorded passed. On the red branch, `hub-tests-failed` ran, `hub-tests-passed` was skipped, and the failing test kept the pipeline red. Pushes to `hub-state` with `-o ci.skip` start no pipeline |

Claims 8 to 13 were found while planning phase 1, 14 to 17 while building phase 2, 18 in phase 3. Claims 3, 11 and 12 are verified, 9 is replaced, 10 is verified on macOS and 13 is a confirmed, accepted risk. Phase 1b is not blocked; claim 10 on Linux and Windows is the open part.

## Not built yet in phase 2

- **Saving: rebase once, then ask.** A save is cut from the newest `main`, and a person's second save of a file waits for the first. Two people saving the same file at once (QA and Ops in `release.yaml` is the likely case) can still conflict; the second merge request then fails to merge. Rebasing it once and asking the person after that is not built.
- **Saving offline.** A push that fails is reported, not queued for the next sync.
- **Other saves.** Light edits on the site (a feature's title, links and estimates; the wording of a story) still need a merge request by hand.
- **QA and release: still to come.** The release `versions`, an Ops view across features, and a check at decision time that a CI result is not older than the last merge of the feature branch.
- **Plugin: still to come.** `hub_record` and the hooks that record a stage's start and finish in `events.jsonl`, usage (phase 4), Codex and Cursor skills (phase 5), and refreshing the cached plugin copy after `hub/plugin` changes (`hub sync` should run `claude plugin marketplace update` and `claude plugin update`).
- **People and roles: still to come.** The check that a person is a member of the group on the host (the site only says to add them), Settings, and adding a team later.
- **Stale guard results** (claim 14) and **group Maintainers** (claim 15) are accepted risks for now.

## Decided in code during phase 1a

The owner confirmed three of these on 7 October 2026: the contract team per feature, CI results not counting as later evidence, and partial evidence (see `docs/decisions.md`). The rest are notes:

- **A gate of other teams' leads with no other team.** When a feature has only the contract team, or no contract team, each team's own lead signs `tech-design`, `data-model` and `api`.
- **The contract merge request in phase 1a.** Without the host API, a merged contract merge request is seen as `contracts/` files on main.
- **Not in core yet (phase 2, with `hub-guard`):** who may append which `signoffs.yaml` entry, and `release.yaml` field by field.
- **Node 22 ends on 30 April 2027.** Raise the minimum to Node 24 before then.
- **Git calls.** Done on 8 October 2026: authors of every file come from one `git log --name-only` per repository, event-line authors from one `git blame` per event log, and the hub-state files from one `git cat-file --batch`. The demo's first load went from 0.9 s to 0.18 s. A very long history makes that one `git log` slower; limiting it by date is the next step if needed.

## Hub prototype

The prototypes are the UI reference and were not updated to revision 51. Where they differ, the specification wins:

- Step ids are `uxflows`, `design`, `datamodel`, `plantests` and `qafinal` (the specification uses `ux-flows`, `tech-design`, `data-model`, `plan-tests` and `qa-final`), and epic is shown as the engine stage `classify-size`.
- Task ids are `T-01` and a task can be `waiting`. SDD uses `T1` and the states `todo`, `in_progress`, `blocked`, `review` and `done`.
- The PM's go or no-go is also written to `signoffs.yaml`; sign-offs have no time or content hash; the QA decision has no cycle.
- The Android sample team has no lead, though the gates ask for every client lead.
- Role tiles for PM, designer and Ops are still fixed sample numbers.
- Not shown: answering a QA question, opening a task file, the headless result before saving, editing prices, the PM returning epic to the PO, a warning for an unknown cross-team reference.
- Settings does not reflect what was entered in the setup prototype (two separate pages with no shared data). It always shows Jira and four teams.
- The hub prototype shows four fixed sample teams although the list is free in setup.
- Phone: the tab row and the side menu scroll sideways without a hint.

## Setup prototype

- The GitHub path goes on to Install. In version 1 it stops before Install with a message that GitHub install is not available yet.
- There is no check that forking of the specifications repository is off.
- Team rows have no `id`.
- A team repository row on the phone has labels, but the preset buttons replace rows without asking.
- The GitHub Free state is reachable only through a prototype toggle.
