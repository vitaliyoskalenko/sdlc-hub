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

## People and setup scripts

The admin adds each person on People and roles (`/people`); saving opens a merge request on `.hub/roles.yaml` that merges itself. Setup script, on the same page, gives one script per person for bash or PowerShell, with no secrets in it. The person runs it: it checks git, Node and the assistant, clones the repositories of their role, runs `node hub/cli.js setup` (confirms the role on `main`, sets up Claude Code and the hub plugin, tells the admin) and `node hub/cli.js doctor`, and opens Your guide.

In the demo, try it as `nazar.t`: People and roles, Add a person, then Setup script.

## The Claude Code plugin

Install writes the `hub` plugin into `hub/plugin/` and enables it in `.claude/settings.json`; the setup script registers it on each machine. Then `/hub:status`, `/hub:next <slug>`, `/hub:signoff <step> <slug>`, `/hub:return <step> <slug> <reason>`, `/hub:bug <slug>`, `/hub:verify <slug>`, `/hub:test <slug>`, `/hub:decide <slug>`, `/hub:release <slug>` and `/hub:start` work in Claude Code. For `/hub:test`, the admin sets each team's test command as `test:` under `teams` in `.hub/config.yaml`. To try the plugin without installing it: `claude --plugin-dir hub/plugin`.

## First install on GitLab

```
npm run build
node packages/cli/dist/cli.mjs init        # npx sdlc-hub init once the package is published
```

The setup site opens at `http://127.0.0.1:4173/setup`. Paste a personal access token of a group Owner with the `api` scope. Install writes the hub into the specifications repository, creates `hub-state`, stores `HUB_STATE_TOKEN` and opens one hub-report merge request per team repository. It also creates `hub-ci` with the hub-guard job, stores `HUB_GUARD_TOKEN`, turns on "Pipelines must succeed" and protects `main`. Run it again after an upgrade; once `main` is protected its changes arrive as a merge request that merges itself. Then clone the repository and run `node hub/cli.js serve` in it.

To try it on a local GitLab CE in Docker (about 4 GB of memory, 10 minutes for the first start):

```
docker run -d --name sdlc-hub-gitlab -p 8929:8929 -e GITLAB_OMNIBUS_CONFIG="external_url 'http://localhost:8929'" gitlab/gitlab-ce:latest
node e2e/gitlab/bootstrap.mjs      # group shop, owner nazar.t, five repositories, a runner; secrets in ~/.sdlc-hub-test/
npm run test:gitlab                # the install twice, a real hub-report pipeline, and hub-guard at merge
HUB_GITLAB_IT=1 npx playwright test e2e/setup.spec.ts
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
