# Plan after phase 5

Agreed with the owner on 10 October 2026. Phases 0 to 5 of the delivery plan are built; this is what is left, in order. Sizes are rough: S is a few hours, M about a day, L several days. The status column is kept up to date as items land.

## Stage 1: before the team uses it for real

| # | What | Why | Size | Status |
|---|---|---|---|---|
| 1 | Decide whether `tech-design` waits for `sequences` | SDD's `sequences` writes no file of its own, only `_sequences-log.md`, so the step shows done once `design` finishes | — | Done: it waits, except on the quick route (revision 67) |
| 2 | `hub upgrade`, and a site older than the repository turns read only | Every new hub version otherwise means running setup again | M | Done (revision 68) |
| 3 | File validation in CI (`hub-validate`) | `hub-guard` checks who changed which files, not whether they are valid: a broken `feature.yaml` or `roles.yaml` can merge and break the site | S–M | Done: inside `hub-guard` (revision 67) |
| 4 | Install on the team's real GitLab, and check the GitLab MCP server there (claim 4) | Only a local GitLab CE in Docker was used so far | S | Needs the owner |
| 5 | One real feature through all twenty steps (phase 0) | The SDD run stopped at `tasks`: test plan, review record and ship are unchecked against real output | M | Needs the team |

## Stage 2: team repositories

| # | What | Why | Size | Status |
|---|---|---|---|---|
| 6 | `hub-fanout` | Copies a feature's shared files (`spec.md`, `ux-flows.md`, `screens.md`, `test-plan.md`, `contracts/`) to each team repository by merge request; implement and review run there | L | Done: verified on the local GitLab and on github.com (revision 69) |
| 7 | Add a team after install (Settings) | The `hub-report` merge request in the new repository and the team in `config.yaml`; on GitHub a new deploy key | M | Done: Settings, then `hub connect-teams`; verified on github.com |
| 8 | Membership check on People and roles | Warn when a person is not in the group or organization | S–M | Done |
| 9 | A person with two roles chooses the role to work in | The specification says the site asks | S | Done: Working as, for Home and Your guide |

## Stage 3: metrics, QA and Settings

| # | What | Size | Status |
|---|---|---|---|
| 10 | Days client teams waited for the contract team | M | Done: hub-report keeps the waits; the Flow tab shows the days |
| 11 | An Ops view across features in release, and a check that a CI result is not older than the last merge | M | Done: the Releases page; a warning on the QA tab |
| 12 | The price table and a host checklist in Settings | S–M | Done: checked against both hosts |
| 13 | Re-run open merge requests when `roles.yaml` changes (claim 14) | M | Done: verified on github.com; GitLab under test |
| 14 | `hub doctor` warns when a GitHub user has SSH only and cannot save from the site | S | Done |

## Stage 4: platforms and checks that need something from outside

| # | What | Needs | Status |
|---|---|---|---|
| 15 | The same step from Codex and Cursor (phase 5 exit check) | Codex and Cursor installed | Postponed by the owner |
| 16 | The PowerShell setup script on Windows; the keychain on Linux and Windows | A Windows and a Linux machine | Open |
| 17 | GitHub with private repositories: Team, and advisory mode on Free | A Team organization, or a private repository in the test organization | Open |
| 18 | Whether GitHub keeps auto-merge after the force push that moves a conflicting save | The test organization | Done: it keeps it, and merges the new content |
| 19 | Cost within 10% of the provider's report (phase 4 exit check) | A month of real use | Open |

## Lower priority, or waiting on a decision

- The Jira copy of bugs: when a bug is copied is not specified.
- ~~The format of prompt templates~~: done, plain Markdown with five placeholders (specification, How proxying works).
- ~~Uninstall~~: done, `hub uninstall`.
- ~~The `hub script` command~~: done. Editing a story's wording on the site; redrawing the two diagrams; Node 24 as the minimum before April 2027.
- The optional GitLab pre-receive hook, which needs access to the GitLab server.
