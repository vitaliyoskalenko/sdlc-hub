# SDLC Hub

A local web site and an assistant plugin that live inside a team's `product-specs` repository and show the whole AI-assisted, spec-driven development flow of every feature. The design is in `docs/specification.md` (the source of truth), `docs/decisions.md` and `docs/open-items.md`; `CLAUDE.md` is the short version.

## Run it

Node 22 or newer and git.

```
npm install
npm run demo -- --as iryna.s     # build, write the demo project to a temporary folder, serve it
```

Open the address it prints, `http://127.0.0.1:4173/?as=iryna.s`. The dashed "Demo" control in the top bar switches the person and the assistant; `--as <user>` picks who you are at start. The people are `nazar.t` (admin), `olena.k` (PO), `maksym.d` (PM), `daria.l` (designer), `taras.m`, `petro.v`, `andrii.p`, `sofiia.h` (team leads of backend, web, Android, iOS), `iryna.s` (QA) and `bohdan.r` (Ops). Ctrl+C stops the demo and deletes the folder.

To try saving: open `returns-portal` as `olena.k`, step clarify, and press Sign off; or `order-webhooks` as `taras.m`, step tech-design, and Return with a reason. The save waits to merge for a moment while the demo's stand-in for GitLab runs hub-guard, then the step moves on.

QA and release: as `iryna.s`, a feature's QA tab records verdicts, bugs and the final decision; as `bohdan.r` and `maksym.d`, its Release tab records the smoke check, the checklist, the rollout and the go. `npm run demo -- --fixture release-walk --as bohdan.r` has one feature at staging to take all the way to released.

Costs: a feature's Costs tab shows tokens and API-equivalent cost by step for everyone (groups of three people or more), and as `maksym.d` or `nazar.t` each person too. In a real checkout, usage is collected by the plugin's hooks and published, encrypted, by `node hub/cli.js sync`.

Other fixtures: `npm run demo -- --fixture <name>`, for example `quick-route`, `implement-blocked`, `qa-return-cycle-2` or `no-user-interface` (all in `packages/fixtures/src/cases.ts`).

On a real `product-specs` checkout: `npm run build`, then from inside the checkout `node <this repo>/packages/cli/dist/cli.mjs serve`. You are the person in `.hub/roles.yaml` that matches your git identity, or `--as <user>`.

## Install and use

Step-by-step guides, with the tokens and permissions each host needs:

| Guide | For |
|---|---|
| [Install on GitLab](docs/guides/gitlab.md) | The admin: the personal access token (`api` scope), the Owner role, a runner, what Install creates (`HUB_STATE_TOKEN`, `hub-ci`, `HUB_GUARD_TOKEN`, protected `main`) and when to renew the tokens. |
| [Install on GitHub](docs/guides/github.md) | The admin: the organization settings, the fine-grained token and its permissions, the plan, what Install creates (the deploy key and `HUB_STATE_KEY`, the ruleset, the workflows). |
| [People](docs/guides/people.md) | The admin adds a person and sends a setup script; the person runs it. What each machine needs, and the everyday commands. |
| [Settings](docs/guides/settings.md) | How strict `hub-guard` is (enforce or advisory, and the checks that can be switched off), assistants, headless runs, links, and `hub usage rekey`. |

The same guides are built into the hub, on its Help page, with what each role does.

From this repository, before the package is published:

```
npm run build
node packages/cli/dist/cli.mjs init        # npx sdlc-hub init once the package is published
```

## The Claude Code plugin

Install writes the `hub` plugin into `hub/plugin/` and enables it in `.claude/settings.json`; the setup script registers it on each machine. Then `/hub:status`, `/hub:next <slug>`, `/hub:signoff <step> <slug>`, `/hub:return <step> <slug> <reason>`, `/hub:bug <slug>`, `/hub:verify <slug>`, `/hub:test <slug>`, `/hub:decide <slug>`, `/hub:release <slug>` and `/hub:start` work in Claude Code (`$hub-x` in Codex, `/hub-x` in Cursor). For `/hub:test`, the admin sets each team's test command as `test:` under `teams` in `.hub/config.yaml`. To try the plugin without installing it: `claude --plugin-dir hub/plugin`.

In the demo, try People as `nazar.t`: Team, Add a person, then Setup script.

## Testing against real hosts

For developers of the hub. Secrets go only in `~/.sdlc-hub-test/` (mode 600), never into the repository.

A local GitLab CE in Docker (about 4 GB of memory, 10 minutes for the first start):

```
docker run -d --name sdlc-hub-gitlab -p 8929:8929 -e GITLAB_OMNIBUS_CONFIG="external_url 'http://localhost:8929'" gitlab/gitlab-ce:latest
node e2e/gitlab/bootstrap.mjs      # group shop, owner nazar.t, five repositories, a runner; secrets in ~/.sdlc-hub-test/
npm run test:gitlab                # the install twice, a real hub-report pipeline, and hub-guard at merge
HUB_GITLAB_IT=1 npx playwright test e2e/setup.spec.ts
```

A throwaway GitHub organization: create a token as in [the GitHub guide](docs/guides/github.md#2-create-your-fine-grained-token). Put `{"org": "<org>", "token": "<token>"}` in `~/.sdlc-hub-test/github.json`. To include the refusal and advisory tests, add `"people": {"<login>": "<token>"}` with a second member's token (Contents and Pull requests, read and write, on `product-specs`). Then:

```
node e2e/github/bootstrap.mjs      # public product-specs, backend and web-admin, each team with a CI workflow
npm run test:github                # the install twice, saves that merge themselves, hub-report, refusal and advisory mode
```

The PowerShell setup script, in PowerShell on Linux (this checks the script, not Windows itself):

```
docker build -t sdlc-hub-pwsh e2e/pwsh
npm run -s build && HUB_PWSH_IT=1 npx vitest run packages/cli/test/script-run.test.ts
```

## Check it

```
npm test            # unit and integration tests (Vitest)
npm run typecheck
npm run e2e         # build, then walk every page as every person at 1366px and 390px (Playwright)
```

`npx playwright install chromium` once before the first `npm run e2e`.

## Layout

| Package | What |
|---|---|
| `packages/core` | Data model and validators, the SDD adapter, step detection, roles and paths. No I/O. |
| `packages/git` | Read-only view of product-specs: the working tree, the `hub-state` branch, team clones, git authors. |
| `packages/server` | Loopback-only server: Host and Origin checks, session cookie, read-only REST and SSE, the web app. |
| `packages/web` | The site (Preact + Vite). |
| `packages/cli` | `serve` and `demo`, bundled into one file by esbuild. |
| `packages/fixtures` | Synthetic fixture repositories and the demo project, until a real SDD run replaces them. |
| `prototypes/` | The UI reference from the design phase. |
