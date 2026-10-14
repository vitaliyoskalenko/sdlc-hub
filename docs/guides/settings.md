# Settings

For the admin. The hub's settings live in `.hub/config.yaml` in `product-specs`. The admin changes them on the site's **Settings** page; everyone else can read the page. A change is a save: a merge request on `config.yaml` that only the admin role passes, and that merges by itself. Repositories and the engine are set at install, and teams can be added, edited and removed here (see below). To change the engine, add its adapter under `.hub/engines/` and set `engine` in `.hub/config.yaml`.

## How strict hub-guard is

`hub-guard` runs on every merge request (pull request on GitHub) into `main` of `product-specs`. It decides by the settings on `main`, so a merge request cannot loosen its own check.

**Mode**

| Mode | What happens to a change that breaks a rule |
|---|---|
| **Enforce** (default) | It does not merge. For a save from the site, the reason appears on the site and the branch is deleted. |
| **Advisory** | It merges anyway. `hub-guard` lists the problems in its log and, for a save from the site, in `hub-state`; the site shows the save as "merged with warnings". |

Choose Advisory for a team that wants the flow and the site without the restrictions, and for private repositories on GitHub Free, which have no rulesets or auto-merge.

**Checks you can switch off**

| Check | When it is on | When it is off |
|---|---|---|
| Files by role | Each role changes only its own files (`.hub/roles.yaml` lists them). | Anyone in `roles.yaml` may change any file. |
| Who signs a gate | A sign-off or a QA decision comes from the step's role and the right lead. | Anyone in `roles.yaml` may sign any gate, in their own name. |
| Everyone who pushed | Every person who pushed to the branch is judged, not only its author. | Only the author is judged. |
| People not in roles.yaml | A change from someone who is not in `roles.yaml` is refused. | Anyone with access to the repository may change files. |

**Never relaxed.** Whatever the mode and the checks say, these stay admin-only and are refused even in advisory mode, because they run on every machine:

- `.hub/` and `hub/`;
- the assistants' files: `.claude/`, `.claude-plugin/`, `.agents/`, `.codex/`, `.cursor/`, `CLAUDE.md`, `AGENTS.md`;
- CI files: `.github/`, `.gitlab-ci.yml`, `ci/`.

`signoffs.yaml` stays append-only, and a new sign-off must name its author. A hub file that would not load (`.hub/`, `feature.yaml`, `signoffs.yaml`, `release.yaml`, `verification.yaml`, a bug file) is refused too, so a typo can never break the site for everyone.

The checks change what the guard lets through, not what the site offers: a Sign off button still appears only for the step's owner.

In `config.yaml`:

```yaml
guard:
  mode: enforce        # or advisory
  checks:
    files: true
    signoffs: true
    pushers: true
    members: true
```

## Other settings

| Setting | What it does |
|---|---|
| Assistants | Which assistants people may choose. Claude Code is always on. A newly allowed assistant gets its files with the next install run. |
| Headless runs | Lets the PO and the team leads start a read-only validation run from the site, under their own assistant seat. Off by default. |
| Links | The Confluence space and the Figma project for the whole project. Each feature's own links (Jira, Figma, staging) are on the feature's page, where the PM edits them with **Edit details**. |

## The host checklist

The admin's Settings page reads, on the host, what install set up, with the admin's own git credential:
- **GitLab:** the protection of `main`, the CI configuration, "Pipelines must succeed", forking, `hub-state`, and each token with its expiry date. A token that expires within 30 days is marked "to do".
- **GitHub:** the ruleset, auto-merge, `hub-state`, the two organization settings, and each team's secret and workflows.

It only reads. What it marks "to do" says what to do: renew a token, run setup or `hub connect-teams` again, or merge a team's pull request.

## Prices

Costs are API-equivalent: what the same work would cost at the provider's list prices. On seats, work is not billed per token. Settings shows the hub's table, with the day it was read, and the project's overrides. The admin changes a model's prices with **Edit**, saved under `prices` in `config.yaml`, and goes back to the hub's with **Use the hub's**. An override applies to that model and to every model id it starts.

## Teams

The project's teams are listed on Settings. The admin:

- **Edits** a team's name, repository, kind and test command, and chooses which team publishes the API contract (one at most). A team's id stays: features refer to it.
- **Removes** a team. A team that people are still in is refused, with the reason: move them to another team on the Team page first. The removal leaves the team's repository and its jobs as they are.

## Add a team after install

On Settings, **Add a team** with its name, its repository in the group or organization, and its kind. That is a save on `config.yaml`. When it has merged, run this in your clone of `product-specs`:

```
node hub/cli.js connect-teams
```

It runs install's team steps for every team, and skips those already connected:
- **GitLab:** the `hub-report` merge request in the new repository, and its fan-out token.
- **GitHub:** the deploy key's secret, and the pull request with the `hub-report` and `hub-fanout` workflows.

It uses your setup token: the one git's credential helper keeps from setup, or `HUB_SETUP_TOKEN`. Running setup again instead also works, but rewrites `config.yaml` from the setup answers, so enter the new team there too.

## Usage records

Per-person usage is encrypted to the person, the admins and the PMs, as `.hub/roles.yaml` names them when it is published. After the PM or an admin changes, run this on the admin's or a PM's machine:

```
node hub/cli.js usage rekey
```

It encrypts every record in `hub-state` again for the people `roles.yaml` names now. A record that was not encrypted to your key stays as it is, and the command says which.
